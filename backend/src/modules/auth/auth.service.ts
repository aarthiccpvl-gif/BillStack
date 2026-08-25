import type { AuthUser, ChangePasswordInput, LoginInput, Permission, RoleKey } from '@app/shared';
import { prisma } from '../../db/prisma';
import { env } from '../../config/env';
import {
  AccountLockedError,
  ForbiddenError,
  InvalidCredentialsError,
  UnauthenticatedError,
} from '../../utils/errors';
import { recordAudit, recordAuditSafely } from '../../services/audit.service';
import { getPermissionsForRole } from '../../services/permission.service';
import { hashPassword, verifyPassword } from './password.service';
import {
  generateRefreshToken,
  hashToken,
  refreshExpiryDate,
  signAccessToken,
} from './token.service';

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

const userInclude = { role: true } as const;

type UserWithRole = Awaited<
  ReturnType<typeof prisma.user.findFirstOrThrow<{ include: typeof userInclude }>>
>;

const toAuthUser = async (user: UserWithRole): Promise<AuthUser> => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: {
    id: user.role.id,
    key: user.role.key as RoleKey,
    name: user.role.name,
    isReadOnly: user.role.isReadOnly,
  },
  permissions: await getPermissionsForRole(user.roleId),
  mustChangePassword: user.mustChangePassword,
  lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
});

const issueSession = async (
  user: UserWithRole,
  context: { ip?: string; userAgent?: string },
): Promise<IssuedSession> => {
  const refreshToken = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiryDate(),
      ip: context.ip ?? null,
      userAgent: context.userAgent?.slice(0, 255) ?? null,
    },
  });

  return {
    accessToken: signAccessToken({
      sub: String(user.id),
      roleKey: user.role.key,
      tokenVersion: user.tokenVersion,
    }),
    refreshToken,
    user: await toAuthUser(user),
  };
};

/**
 * A dummy verification run when the email is unknown, so a missing account and a
 * wrong password take a comparable amount of time and cannot be told apart.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZS1zYWx0LXZhbHVl$Ml/2Yl8b0M0zj1lZQqz1lQ3B9pEBM7oJ0v0kK9pQZ2g';

export const login = async (
  input: LoginInput,
  context: { ip?: string; userAgent?: string },
): Promise<IssuedSession> => {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: userInclude,
  });

  if (!user) {
    await verifyPassword(DUMMY_HASH, input.password);
    await recordAuditSafely({
      action: 'LOGIN_FAILED',
      entityType: 'USER',
      entityLabel: input.email,
      metadata: { reason: 'unknown_email' },
      actor: { userEmail: input.email },
    });
    throw new InvalidCredentialsError();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAuditSafely({
      action: 'LOGIN_FAILED',
      entityType: 'USER',
      entityId: user.id,
      entityLabel: user.email,
      metadata: { reason: 'locked', lockedUntil: user.lockedUntil.toISOString() },
      actor: { userId: user.id, userEmail: user.email },
    });
    throw new AccountLockedError(
      `Too many failed attempts. Try again after ${user.lockedUntil.toLocaleTimeString()}.`,
    );
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);

  if (!passwordOk) {
    const failedLoginCount = user.failedLoginCount + 1;
    const shouldLock = failedLoginCount >= env.LOGIN_MAX_ATTEMPTS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount,
        lockedUntil: shouldLock
          ? new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60_000)
          : user.lockedUntil,
        status: shouldLock ? 'LOCKED' : user.status,
      },
    });

    await recordAuditSafely({
      action: 'LOGIN_FAILED',
      entityType: 'USER',
      entityId: user.id,
      entityLabel: user.email,
      metadata: { reason: 'bad_password', failedLoginCount, locked: shouldLock },
      actor: { userId: user.id, userEmail: user.email },
    });

    if (shouldLock) {
      throw new AccountLockedError(
        `Too many failed attempts. This account is locked for ${env.LOGIN_LOCK_MINUTES} minutes.`,
      );
    }
    throw new InvalidCredentialsError();
  }

  if (user.status === 'INACTIVE') {
    await recordAuditSafely({
      action: 'LOGIN_FAILED',
      entityType: 'USER',
      entityId: user.id,
      entityLabel: user.email,
      metadata: { reason: 'inactive' },
      actor: { userId: user.id, userEmail: user.email },
    });
    throw new ForbiddenError('This account has been deactivated. Contact an administrator.');
  }

  const refreshed = await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      status: 'ACTIVE',
      lastLoginAt: new Date(),
    },
    include: userInclude,
  });

  await recordAudit({
    action: 'LOGIN',
    entityType: 'USER',
    entityId: refreshed.id,
    entityLabel: refreshed.email,
    actor: { userId: refreshed.id, userEmail: refreshed.email },
  });

  return issueSession(refreshed, context);
};

/**
 * Rotating refresh.
 *
 * Presenting a token that has already been rotated means it leaked, so the whole
 * family is revoked and the user must sign in again.
 */
export const refresh = async (
  token: string | undefined,
  context: { ip?: string; userAgent?: string },
): Promise<IssuedSession> => {
  if (!token) throw new UnauthenticatedError('No session to refresh.');

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: userInclude } },
  });

  if (!stored) throw new UnauthenticatedError('Your session is no longer valid.');

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAuditSafely({
      action: 'LOGIN_FAILED',
      entityType: 'USER',
      entityId: stored.userId,
      entityLabel: stored.user.email,
      metadata: { reason: 'refresh_token_reuse' },
      actor: { userId: stored.userId, userEmail: stored.user.email },
    });
    throw new UnauthenticatedError('Your session was ended for security reasons. Please sign in.');
  }

  if (stored.expiresAt <= new Date()) {
    throw new UnauthenticatedError('Your session has expired. Please sign in again.');
  }

  if (stored.user.status !== 'ACTIVE') {
    throw new ForbiddenError('This account is not active.');
  }

  const session = await issueSession(stored.user, context);

  const replacement = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(session.refreshToken) },
    select: { id: true },
  });

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date(), replacedById: replacement?.id ?? null },
  });

  return session;
};

export const logout = async (token: string | undefined, userId?: number): Promise<void> => {
  if (token) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    await recordAuditSafely({
      action: 'LOGOUT',
      entityType: 'USER',
      entityId: userId,
      entityLabel: user?.email ?? null,
    });
  }
};

export const getCurrentUser = async (userId: number): Promise<AuthUser> => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: userInclude,
  });
  return toAuthUser(user);
};

export const changePassword = async (userId: number, input: ChangePasswordInput): Promise<void> => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new InvalidCredentialsError('Your current password is not correct.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(input.newPassword),
        mustChangePassword: false,
        /* Ends every other session immediately. */
        tokenVersion: { increment: 1 },
      },
    });

    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await recordAudit(
      {
        action: 'PASSWORD_CHANGED',
        entityType: 'USER',
        entityId: userId,
        entityLabel: user.email,
      },
      tx,
    );
  });
};

export const listPermissionsForRole = (roleId: number): Promise<Permission[]> =>
  getPermissionsForRole(roleId);

import type {
  CreateUserInput,
  PaginationQuery,
  Permission,
  ResetPasswordInput,
  RoleKey,
  RoleSummary,
  UpdateUserInput,
  UserSummary,
} from '@app/shared';
import { parseSort } from '@app/shared';
import { prisma } from '../../db/prisma';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../utils/errors';
import { recordAudit } from '../../services/audit.service';
import { invalidatePermissionCache } from '../../services/permission.service';
import { hashPassword } from '../auth/password.service';

const SORTABLE = ['name', 'email', 'createdAt', 'lastLoginAt'] as const;

const toSummary = (user: {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  role: { id: number; key: string; name: string };
}): UserSummary => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  status: user.status as UserSummary['status'],
  role: { id: user.role.id, key: user.role.key as RoleKey, name: user.role.name },
  lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  mustChangePassword: user.mustChangePassword,
  createdAt: user.createdAt.toISOString(),
});

export const listUsers = async (query: PaginationQuery) => {
  const { field, direction } = parseSort(query.sort, SORTABLE, {
    field: 'name',
    direction: 'asc',
  });

  const where = query.search
    ? {
        OR: [{ name: { contains: query.search } }, { email: { contains: query.search } }],
      }
    : {};

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { role: true },
      orderBy: { [field]: direction },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items: rows.map(toSummary), total };
};

export const getUser = async (id: number): Promise<UserSummary> => {
  const user = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!user) throw new NotFoundError('User');
  return toSummary(user);
};

export const createUser = async (input: CreateUserInput, actorId: number): Promise<UserSummary> => {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError('A user with that email address already exists.');

  const role = await prisma.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw new BusinessRuleError('That role does not exist.');

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        roleId: input.roleId,
        passwordHash: await hashPassword(input.password),
        /* The administrator who created the account knows the password, so the
           owner must replace it before doing anything else. */
        mustChangePassword: true,
        createdById: actorId,
      },
      include: { role: true },
    });

    await recordAudit(
      {
        action: 'USER_CREATED',
        entityType: 'USER',
        entityId: user.id,
        entityLabel: user.email,
        newData: { name: user.name, email: user.email, role: role.key },
      },
      tx,
    );

    return user;
  });

  return toSummary(created);
};

export const updateUser = async (id: number, input: UpdateUserInput): Promise<UserSummary> => {
  const existing = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!existing) throw new NotFoundError('User');

  if (input.roleId && input.roleId !== existing.roleId) {
    const role = await prisma.role.findUnique({ where: { id: input.roleId } });
    if (!role) throw new BusinessRuleError('That role does not exist.');
    await assertNotLastSuperAdmin(existing.id, existing.role.key);
  }

  if (input.status === 'INACTIVE' && existing.status === 'ACTIVE') {
    await assertNotLastSuperAdmin(existing.id, existing.role.key);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id },
      data: {
        name: input.name ?? undefined,
        phone: input.phone === undefined ? undefined : input.phone || null,
        roleId: input.roleId ?? undefined,
        status: input.status ?? undefined,
        /* Deactivating must end the session, not merely block the next login. */
        tokenVersion: input.status === 'INACTIVE' ? { increment: 1 } : undefined,
      },
      include: { role: true },
    });

    if (input.status === 'INACTIVE') {
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await recordAudit(
      {
        action: input.roleId && input.roleId !== existing.roleId ? 'ROLE_CHANGED' : 'USER_UPDATED',
        entityType: 'USER',
        entityId: id,
        entityLabel: user.email,
        previousData: {
          name: existing.name,
          phone: existing.phone,
          role: existing.role.key,
          status: existing.status,
        },
        newData: { name: user.name, phone: user.phone, role: user.role.key, status: user.status },
      },
      tx,
    );

    return user;
  });

  return toSummary(updated);
};

export const resetPassword = async (id: number, input: ResetPasswordInput): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError('User');

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(input.newPassword),
        mustChangePassword: input.mustChangePassword,
        failedLoginCount: 0,
        lockedUntil: null,
        status: user.status === 'LOCKED' ? 'ACTIVE' : user.status,
        tokenVersion: { increment: 1 },
      },
    });

    await tx.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await recordAudit(
      {
        action: 'PASSWORD_RESET',
        entityType: 'USER',
        entityId: id,
        entityLabel: user.email,
        metadata: { mustChangePassword: input.mustChangePassword },
      },
      tx,
    );
  });
};

/** The system must never be left without a way in. */
const assertNotLastSuperAdmin = async (userId: number, roleKey: string): Promise<void> => {
  if (roleKey !== 'SUPER_ADMIN') return;

  const remaining = await prisma.user.count({
    where: { role: { key: 'SUPER_ADMIN' }, status: 'ACTIVE', id: { not: userId } },
  });

  if (remaining === 0) {
    throw new BusinessRuleError(
      'This is the only active Super Admin. Promote another user before changing this one.',
    );
  }
};

// ------------------------------------------------------------------ roles ---

export const listRoles = async (): Promise<RoleSummary[]> => {
  const roles = await prisma.role.findMany({
    orderBy: { id: 'asc' },
    include: {
      permissions: { select: { permission: { select: { key: true } } } },
      _count: { select: { users: true } },
    },
  });

  return roles.map((role) => ({
    id: role.id,
    key: role.key as RoleKey,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    isReadOnly: role.isReadOnly,
    userCount: role._count.users,
    permissions: role.permissions.map((entry) => entry.permission.key as Permission),
  }));
};

export const listPermissions = async () => {
  const permissions = await prisma.permission.findMany({
    orderBy: [{ module: 'asc' }, { action: 'asc' }],
  });
  return permissions.map((permission) => ({
    id: permission.id,
    key: permission.key as Permission,
    module: permission.module,
    action: permission.action,
    description: permission.description,
  }));
};

export const updateRolePermissions = async (
  roleId: number,
  permissionKeys: Permission[],
): Promise<RoleSummary> => {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new NotFoundError('Role');

  if (role.key === 'SUPER_ADMIN') {
    throw new BusinessRuleError(
      'The Super Admin role always holds every permission and cannot be reduced.',
    );
  }

  if (role.isReadOnly) {
    const writePermissions = permissionKeys.filter(
      (key) => !key.endsWith('.read') && !key.endsWith('.export') && !key.endsWith('.download'),
    );
    if (writePermissions.length > 0) {
      throw new BusinessRuleError(
        `${role.name} is a read-only role. Remove ${writePermissions.join(', ')} or change the role first.`,
      );
    }
  }

  const permissions = await prisma.permission.findMany({
    where: { key: { in: permissionKeys } },
    select: { id: true, key: true },
  });

  const unknown = permissionKeys.filter(
    (key) => !permissions.some((permission) => permission.key === key),
  );
  if (unknown.length > 0) {
    throw new BusinessRuleError(`Unknown permission: ${unknown.join(', ')}`);
  }

  const previous = await prisma.rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { key: true } } },
  });

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    await tx.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
    });

    await recordAudit(
      {
        action: 'ROLE_PERMISSIONS_UPDATED',
        entityType: 'ROLE',
        entityId: roleId,
        entityLabel: role.name,
        previousData: { permissions: previous.map((entry) => entry.permission.key) },
        newData: { permissions: permissionKeys },
      },
      tx,
    );
  });

  /* Effective immediately — permissions are not carried in the access token. */
  invalidatePermissionCache(roleId);

  const roles = await listRoles();
  const updated = roles.find((entry) => entry.id === roleId);
  if (!updated) throw new NotFoundError('Role');
  return updated;
};

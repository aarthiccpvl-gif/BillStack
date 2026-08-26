import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Permission, RoleKey } from '@app/shared';
import { prisma } from '../db/prisma';
import { ForbiddenError, UnauthenticatedError } from '../utils/errors';
import { getPermissionsForRole } from '../services/permission.service';
import { setContextUser } from '../utils/request-context';
import { ACCESS_COOKIE, verifyAccessToken } from '../modules/auth/token.service';

/**
 * Establishes the principal for the request.
 *
 * Permissions are loaded per request (from a short-lived cache) rather than read
 * from the token, so revoking a permission takes effect at once. `tokenVersion` is
 * compared with the stored value, which is how a password change ends every
 * existing session immediately.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const token = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    if (!token) throw new UnauthenticatedError();

    const claims = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: Number(claims.sub) },
      include: { role: true },
    });

    if (!user) throw new UnauthenticatedError();
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError('This account is not active. Contact an administrator.');
    }
    if (user.tokenVersion !== claims.tokenVersion) {
      throw new UnauthenticatedError('Your session has ended. Please sign in again.');
    }

    req.auth = {
      userId: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleKey: user.role.key as RoleKey,
      isReadOnly: user.role.isReadOnly,
      permissions: await getPermissionsForRole(user.roleId),
      mustChangePassword: user.mustChangePassword,
    };

    setContextUser({ userId: user.id, userEmail: user.email, roleKey: user.role.key });
    next();
  } catch (error) {
    next(error);
  }
};

export const getAuth = (req: Request) => {
  if (!req.auth) throw new UnauthenticatedError();
  return req.auth;
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The handful of POSTs that produce output rather than change anything.
 *
 * They are POSTs only because their input is a list too long for a URL — and a
 * list of document ids has no business in a server access log either. Each still
 * enforces its own permission, which a read-only role has to actually hold; this
 * list only stops the blanket method check from refusing them first.
 *
 * Every entry here is a deliberate hole in a security guard, so the RBAC matrix
 * asserts the list is exactly this and nothing else.
 */
export const READ_ONLY_POST_ALLOWLIST: readonly string[] = ['/api/export/documents/bulk-pdf'];

const isAllowlistedRead = (req: Request): boolean =>
  req.method === 'POST' &&
  READ_ONLY_POST_ALLOWLIST.includes(`${req.baseUrl}${req.path}`.replace(/\/+$/, ''));

/**
 * The structural guarantee behind the Finance Viewer requirement.
 *
 * Any role flagged read-only is refused every non-GET request here, before a
 * controller runs — so even a future endpoint that forgets to declare a permission
 * cannot be used to write.
 */
export const enforceReadOnlyRole = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.auth?.isReadOnly && !SAFE_METHODS.has(req.method) && !isAllowlistedRead(req)) {
    next(
      new ForbiddenError(
        'Your role has read-only access. You can view, export and download, but not make changes.',
      ),
    );
    return;
  }
  next();
};

/**
 * While a password change is outstanding the session can reach only the handful of
 * endpoints needed to complete it.
 */
const PASSWORD_CHANGE_ALLOWLIST = ['/auth/me', '/auth/change-password', '/auth/logout'];

export const enforcePasswordChange = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.auth?.mustChangePassword) {
    next();
    return;
  }

  const path = req.baseUrl.replace(/^\/api/, '') + req.path;
  if (PASSWORD_CHANGE_ALLOWLIST.some((allowed) => path.startsWith(allowed))) {
    next();
    return;
  }

  next(new ForbiddenError('Set a new password before continuing.'));
};

export const hasPermission = (req: Request, permission: Permission): boolean =>
  req.auth?.permissions.includes(permission) ?? false;

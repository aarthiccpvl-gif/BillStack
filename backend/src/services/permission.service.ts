import type { Permission } from '@app/shared';
import { prisma } from '../db/prisma';

/**
 * Permissions are resolved per request from the database rather than embedded in
 * the access token, so revoking one takes effect immediately instead of after the
 * token's 15-minute lifetime.
 *
 * A short in-memory cache keeps that from meaning a join on every request; any
 * change to a role's permissions clears it explicitly, so the TTL is a safety net
 * rather than the mechanism.
 */

const CACHE_TTL_MS = 30_000;

const cache = new Map<number, { permissions: Permission[]; at: number }>();

export const getPermissionsForRole = async (roleId: number): Promise<Permission[]> => {
  const cached = cache.get(roleId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.permissions;
  }

  const rows = await prisma.rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { key: true } } },
  });

  const permissions = rows.map((row) => row.permission.key as Permission);
  cache.set(roleId, { permissions, at: Date.now() });
  return permissions;
};

/** Called whenever a role's permission set changes, so the effect is immediate. */
export const invalidatePermissionCache = (roleId?: number): void => {
  if (roleId === undefined) cache.clear();
  else cache.delete(roleId);
};

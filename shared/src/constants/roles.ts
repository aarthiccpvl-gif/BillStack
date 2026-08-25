/**
 * Role keys. Roles are bundles of permissions; code always checks permissions,
 * never a role key — except for the one structural rule below.
 *
 * The permission catalogue itself lands in Phase 2 alongside the seed.
 */
export const ROLE_KEYS = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  FINANCE_VIEWER: 'FINANCE_VIEWER',
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

export const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin / Billing User',
  FINANCE_VIEWER: 'Finance Viewer',
};

/**
 * Roles that may never perform a write, enforced by a global backend guard that
 * rejects every non-GET request before a controller is reached. This is the
 * backstop behind the per-route permission checks: even a future endpoint that
 * forgets to declare a permission stays safe for these roles.
 */
export const READ_ONLY_ROLE_KEYS: readonly RoleKey[] = [ROLE_KEYS.FINANCE_VIEWER];

export const isReadOnlyRole = (roleKey: string): boolean =>
  READ_ONLY_ROLE_KEYS.includes(roleKey as RoleKey);

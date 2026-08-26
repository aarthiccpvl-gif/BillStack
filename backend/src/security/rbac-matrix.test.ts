import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { PERMISSIONS, ROLE_PERMISSIONS, type Permission } from '@app/shared';
import { createApp } from '../app';
import { READ_ONLY_POST_ALLOWLIST } from '../middleware/authenticate';
import { collectRoutes, isMutating, type RouteInfo } from '../utils/route-audit';

/**
 * The route × role matrix.
 *
 * Every route the application mounts is enumerated from the live router — not from
 * a hand-written list that would drift the moment someone adds an endpoint — and
 * checked against each role's permission set. A new route is covered the day it is
 * written, including one whose author forgot this file exists.
 *
 * This proves the *contract*: which permission each route demands, and whether a
 * role holds it. That the middleware then honours the contract is proved
 * separately, by the unauthenticated checks below and by the live smoke runs.
 */

const app = createApp();
const routes = collectRoutes(app);

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'FINANCE_VIEWER'] as const;
type RoleKey = (typeof ROLES)[number];

/** Roles whose every non-GET request is refused by the global guard, before routing. */
const READ_ONLY_ROLES: RoleKey[] = ['FINANCE_VIEWER'];

const guarded = routes.filter((route) => route.permission !== undefined);
const mutating = guarded.filter((route) => isMutating(route.method));

const holds = (role: RoleKey, permission: Permission): boolean =>
  (ROLE_PERMISSIONS[role] ?? []).includes(permission);

/** What the matrix says should happen when `role` calls `route`. */
const allowed = (role: RoleKey, route: RouteInfo): boolean => {
  if (route.permission === 'PUBLIC' || route.permission === 'AUTHENTICATED') return true;

  const blockedByReadOnlyGuard =
    READ_ONLY_ROLES.includes(role) &&
    isMutating(route.method) &&
    !READ_ONLY_POST_ALLOWLIST.includes(route.path);

  if (blockedByReadOnlyGuard) return false;
  return holds(role, route.permission as Permission);
};

const describeRoute = (route: RouteInfo) => `${route.method.toUpperCase()} ${route.path}`;

describe('the router can be introspected at all', () => {
  it('finds the mounted routes, so the rest of this file means something', () => {
    expect(routes.length).toBeGreaterThan(80);
    expect(mutating.length).toBeGreaterThan(40);
  });

  it('leaves no route without a declared permission', () => {
    const untagged = routes.filter((route) => !route.tagged).map(describeRoute);
    expect(untagged).toEqual([]);
  });
});

/**
 * Signing in, refreshing, signing out and changing your own password are not
 * business writes, so the read-only guard is not mounted on them — a Finance
 * Viewer who could not log in would be no use to anyone. They are listed by name
 * so a new mutating route under /auth cannot join them unnoticed.
 *
 * The bulk download is a POST that produces a file and changes nothing; it is the
 * one deliberate exception in `READ_ONLY_POST_ALLOWLIST`, and it is here for the
 * same reason — so a second exception cannot be added quietly.
 */
const SELF_SERVICE = [
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'POST /api/auth/change-password',
  'POST /api/export/documents/bulk-pdf',
];

describe('a Finance Viewer cannot change anything', () => {
  it('is refused every mutating route except signing in and out', () => {
    const reachable = mutating.filter((route) => allowed('FINANCE_VIEWER', route));
    expect(reachable.map(describeRoute).sort()).toEqual([...SELF_SERVICE].sort());
  });

  it('is refused every route that demands a business permission', () => {
    const businessWrites = mutating.filter(
      (route) =>
        route.permission !== 'PUBLIC' &&
        route.permission !== 'AUTHENTICATED' &&
        !READ_ONLY_POST_ALLOWLIST.includes(route.path),
    );

    expect(businessWrites.length).toBeGreaterThan(40);
    expect(businessWrites.filter((route) => allowed('FINANCE_VIEWER', route))).toEqual([]);
  });

  it('has exactly one POST that a read-only role may still call', () => {
    expect([...READ_ONLY_POST_ALLOWLIST]).toEqual(['/api/export/documents/bulk-pdf']);

    /* And it is a real, mounted, permission-guarded route rather than a typo. */
    const route = mutating.find((entry) => entry.path === READ_ONLY_POST_ALLOWLIST[0]);
    expect(route?.permission).toBe(PERMISSIONS.DOCUMENT_BULK_DOWNLOAD);
    expect(holds('FINANCE_VIEWER', PERMISSIONS.DOCUMENT_BULK_DOWNLOAD)).toBe(true);
  });

  it('holds no permission that ends in a write', () => {
    const writes = (ROLE_PERMISSIONS.FINANCE_VIEWER ?? []).filter((permission) =>
      /\.(create|update|delete|archive|cancel|void|share|convert|publish|manage|status_update|update_status|reset|assign)$/.test(
        permission,
      ),
    );
    expect(writes).toEqual([]);
  });

  it('can still reach the reads its job needs', () => {
    const needed: Permission[] = [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.QUOTATION_READ,
      PERMISSIONS.QUOTATION_DOWNLOAD,
      PERMISSIONS.INVOICE_READ,
      PERMISSIONS.INVOICE_DOWNLOAD,
      PERMISSIONS.DOCUMENT_BULK_DOWNLOAD,
      PERMISSIONS.CUSTOMER_READ,
      PERMISSIONS.REPORT_READ,
      PERMISSIONS.REPORT_EXPORT,
      PERMISSIONS.AUDIT_READ,
    ];

    for (const permission of needed) {
      expect(holds('FINANCE_VIEWER', permission)).toBe(true);
    }
  });
});

describe('every route is reachable by somebody', () => {
  it('demands no permission that no role holds', () => {
    const orphans = guarded
      .filter(
        (route) =>
          route.permission !== 'PUBLIC' &&
          route.permission !== 'AUTHENTICATED' &&
          !ROLES.some((role) => holds(role, route.permission as Permission)),
      )
      .map(describeRoute);

    expect(orphans).toEqual([]);
  });

  it('lets a Super Admin reach all of it', () => {
    const refused = guarded.filter((route) => !allowed('SUPER_ADMIN', route)).map(describeRoute);
    expect(refused).toEqual([]);
  });
});

describe('an Admin can run the day to day but not administer the system', () => {
  const adminCan = (path: string, method = 'post') =>
    allowed('ADMIN', { method, path, tagged: true, permission: permissionFor(method, path) });

  function permissionFor(method: string, path: string): Permission | undefined {
    return guarded.find((route) => route.method === method && route.path === path)?.permission as
      Permission | undefined;
  }

  it.each([
    ['post', '/api/quotations'],
    ['patch', '/api/quotations/:id'],
    ['post', '/api/quotations/:id/convert'],
    ['post', '/api/invoices'],
    ['post', '/api/invoices/:id/issue'],
    ['post', '/api/invoices/:id/payment'],
    ['post', '/api/customers'],
  ])('may %s %s', (method, path) => {
    expect(permissionFor(method, path)).toBeDefined();
    expect(adminCan(path, method)).toBe(true);
  });

  it.each([
    ['delete', '/api/quotations/:id'],
    ['delete', '/api/invoices/:id'],
    ['post', '/api/invoices/:id/cancel'],
    ['post', '/api/invoices/:id/void'],
    ['post', '/api/users'],
    ['patch', '/api/company'],
  ])('may not %s %s', (method, path) => {
    expect(permissionFor(method, path)).toBeDefined();
    expect(adminCan(path, method)).toBe(false);
  });
});

describe('nothing is reachable without a session', () => {
  /* One live request per guarded route, no database needed: authentication runs
     before anything that would touch one. Public routes are exempt by design. */
  const authenticated = guarded.filter(
    (route) => route.permission !== 'PUBLIC' && !route.path.startsWith('/api/auth'),
  );

  it('refuses every guarded route with 401', async () => {
    const surprises: string[] = [];

    for (const route of authenticated) {
      const path = route.path.replace(/:(\w+)/g, '1');
      const method = route.method as 'get' | 'post' | 'patch' | 'put' | 'delete';
      const response = await request(app)[method](path).send({});

      if (response.status !== 401) {
        surprises.push(`${describeRoute(route)} → ${response.status}`);
      }
    }

    expect(surprises).toEqual([]);
  }, 30_000);
});

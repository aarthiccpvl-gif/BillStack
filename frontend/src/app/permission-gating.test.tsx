import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { ROLE_PERMISSIONS, type Permission } from '@app/shared';
import { ALL_NAV_ITEMS, navVisibilityPermission } from '@/constants/navigation';
import { buildUser, mockApi, renderAt } from '@/test/harness';

/**
 * The permission gating audit.
 *
 * Hiding a link is not access control — the API enforces that — but a sidebar
 * that offers a page the router then refuses is a bug, and the reverse (a page
 * reachable by typing its URL that the role was never meant to see) is worse.
 *
 * This walks the navigation manifest for each role and proves the two agree:
 * every entry a role can see, it can open; every entry it cannot see, it is
 * refused with the 403 page rather than being shown the screen.
 */

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'FINANCE_VIEWER'] as const;

const holds = (role: (typeof ROLES)[number], permission: Permission): boolean =>
  (ROLE_PERMISSIONS[role] ?? []).includes(permission);

/** Phase 8 still owns these, so they render a placeholder rather than a screen. */
const NOT_BUILT_YET = ['/reports', '/admin/audit'];

const cases = ROLES.flatMap((role) =>
  ALL_NAV_ITEMS.filter((item) => !NOT_BUILT_YET.includes(item.to)).map((item) => ({
    role,
    label: item.label,
    to: item.to,
    visible: holds(role, navVisibilityPermission(item)),
  })),
);

describe('the sidebar and the router agree', () => {
  it.each(cases.filter((entry) => entry.visible))(
    'a $role sees $label and can open it',
    async ({ role, to }) => {
      mockApi(buildUser(role));
      renderAt(to);

      const heading = await screen.findByRole('heading', { level: 1 });
      expect(heading.textContent).not.toMatch(/do not have access/i);
    },
  );

  it.each(cases.filter((entry) => !entry.visible))(
    'a $role is refused $label, which is hidden from them',
    async ({ role, to }) => {
      mockApi(buildUser(role));
      renderAt(to);

      expect(
        await screen.findByRole('heading', { level: 1, name: /do not have access/i }),
      ).toBeInTheDocument();
    },
  );
});

describe('the manifest itself', () => {
  it('covers every role with at least one visible entry', () => {
    for (const role of ROLES) {
      const visible = ALL_NAV_ITEMS.filter((item) => holds(role, navVisibilityPermission(item)));
      expect(visible.length).toBeGreaterThan(0);
    }
  });

  it('gives a Finance Viewer the read-only surface PRD §44 describes', () => {
    const visible = ALL_NAV_ITEMS.filter((item) =>
      holds('FINANCE_VIEWER', navVisibilityPermission(item)),
    ).map((item) => item.label);

    expect(visible).toEqual([
      'Dashboard',
      'Quotations',
      'Invoices',
      'Customers',
      'Downloads',
      'Reports',
      'Audit Logs',
    ]);
  });
});

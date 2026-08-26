import {
  BarChart3,
  Building2,
  FolderDown,
  FileText,
  LayoutDashboard,
  LayoutTemplate,
  Package,
  ReceiptText,
  ScrollText,
  Settings2,
  Users,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PERMISSIONS, type Permission } from '@app/shared';

/**
 * The navigation manifest.
 *
 * Two permissions per entry, because "may read this data" and "should see this menu
 * entry" are genuinely different questions:
 *
 *   permission     guards the route — what the API will allow
 *   navPermission  decides whether the entry appears at all
 *
 * A Finance Viewer may read item and template records (a document cannot be
 * displayed without them), but PRD §44 says the authoring and administration
 * modules must not appear in their sidebar. Gating visibility on the *authoring*
 * permission produces exactly the Finance sidebar the PRD describes, without
 * maintaining a second hard-coded menu or removing a permission the API needs.
 */
export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Permission the route requires. */
  permission: Permission;
  /** Permission that makes this entry visible; defaults to `permission`. */
  navPermission?: Permission;
  /** The phase that makes this item functional; used by the placeholder pages. */
  phase: number;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      {
        label: 'Dashboard',
        to: '/',
        icon: LayoutDashboard,
        permission: PERMISSIONS.DASHBOARD_READ,
        phase: 7,
      },
    ],
  },
  {
    label: 'Sales',
    items: [
      {
        label: 'Quotations',
        to: '/quotations',
        icon: FileText,
        permission: PERMISSIONS.QUOTATION_READ,
        phase: 5,
      },
      {
        label: 'Invoices',
        to: '/invoices',
        icon: ReceiptText,
        permission: PERMISSIONS.INVOICE_READ,
        phase: 6,
      },
    ],
  },
  {
    label: 'Masters',
    items: [
      {
        label: 'Customers',
        to: '/customers',
        icon: Users,
        permission: PERMISSIONS.CUSTOMER_READ,
        phase: 3,
      },
      {
        label: 'Products & Services',
        to: '/items',
        icon: Package,
        permission: PERMISSIONS.ITEM_READ,
        navPermission: PERMISSIONS.ITEM_CREATE,
        phase: 3,
      },
    ],
  },
  {
    items: [
      {
        label: 'Templates',
        to: '/templates',
        icon: LayoutTemplate,
        permission: PERMISSIONS.TEMPLATE_READ,
        navPermission: PERMISSIONS.TEMPLATE_UPDATE,
        phase: 4,
      },
      {
        label: 'Downloads',
        to: '/downloads',
        icon: FolderDown,
        permission: PERMISSIONS.DOCUMENT_BULK_DOWNLOAD,
        phase: 7,
      },
      {
        label: 'Reports',
        to: '/reports',
        icon: BarChart3,
        permission: PERMISSIONS.REPORT_READ,
        phase: 8,
      },
      {
        /* PRD §5.3 grants the Finance Viewer "view audit history", so this sits
           outside the Administration group rather than being hidden from them. */
        label: 'Audit Logs',
        to: '/admin/audit',
        icon: ScrollText,
        permission: PERMISSIONS.AUDIT_READ,
        phase: 8,
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        label: 'Users & Roles',
        to: '/admin/users',
        icon: UsersRound,
        permission: PERMISSIONS.USER_READ,
        phase: 2,
      },
      {
        label: 'Company Settings',
        to: '/admin/company',
        icon: Building2,
        permission: PERMISSIONS.COMPANY_READ,
        navPermission: PERMISSIONS.COMPANY_UPDATE,
        phase: 3,
      },
      {
        label: 'Masters & Numbering',
        to: '/admin/masters',
        icon: Settings2,
        permission: PERMISSIONS.MASTER_READ,
        navPermission: PERMISSIONS.MASTER_MANAGE,
        phase: 3,
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** The permission that decides whether an entry is shown. */
export const navVisibilityPermission = (item: NavItem): Permission =>
  item.navPermission ?? item.permission;

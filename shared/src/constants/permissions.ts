/**
 * The permission catalogue.
 *
 * Permissions are the unit of authorisation; roles are bundles of them. Code always
 * checks a permission key, never a role name, so moving a capability between roles
 * is a data change (a seed update) rather than a deployment.
 *
 * Every mutating API route declares one of these. A route without a declared
 * permission fails an assertion at startup, so an unprotected write cannot ship.
 */

export const PERMISSIONS = {
  /* dashboard */
  DASHBOARD_READ: 'dashboard.read',

  /* customers */
  CUSTOMER_READ: 'customer.read',
  CUSTOMER_CREATE: 'customer.create',
  CUSTOMER_UPDATE: 'customer.update',
  CUSTOMER_ARCHIVE: 'customer.archive',

  /* items */
  ITEM_READ: 'item.read',
  ITEM_CREATE: 'item.create',
  ITEM_UPDATE: 'item.update',
  ITEM_ARCHIVE: 'item.archive',

  /* master data: currencies, taxes, units, categories, financial years, numbering */
  MASTER_READ: 'master.read',
  MASTER_MANAGE: 'master.manage',

  /* company profile, branding, bank accounts */
  COMPANY_READ: 'company.read',
  COMPANY_UPDATE: 'company.update',

  /* application settings */
  SETTINGS_READ: 'settings.read',
  SETTINGS_UPDATE: 'settings.update',

  /* templates */
  TEMPLATE_READ: 'template.read',
  TEMPLATE_CREATE: 'template.create',
  TEMPLATE_UPDATE: 'template.update',
  TEMPLATE_PUBLISH: 'template.publish',

  /* quotations */
  QUOTATION_READ: 'quotation.read',
  QUOTATION_CREATE: 'quotation.create',
  QUOTATION_UPDATE: 'quotation.update',
  QUOTATION_DELETE: 'quotation.delete',
  QUOTATION_UPDATE_STATUS: 'quotation.update_status',
  QUOTATION_CONVERT: 'quotation.convert',
  QUOTATION_SHARE: 'quotation.share',
  QUOTATION_DOWNLOAD: 'quotation.download',

  /* invoices */
  INVOICE_READ: 'invoice.read',
  INVOICE_CREATE: 'invoice.create',
  INVOICE_UPDATE: 'invoice.update',
  INVOICE_DELETE: 'invoice.delete',
  INVOICE_UPDATE_STATUS: 'invoice.update_status',
  INVOICE_CANCEL: 'invoice.cancel',
  INVOICE_VOID: 'invoice.void',
  INVOICE_SHARE: 'invoice.share',
  INVOICE_DOWNLOAD: 'invoice.download',

  /* payment status (manual — no gateway, no ledger; decision Q2) */
  PAYMENT_STATUS_UPDATE: 'payment.status_update',

  /* documents */
  DOCUMENT_BULK_DOWNLOAD: 'document.bulk_download',

  /* reporting */
  REPORT_READ: 'report.read',
  REPORT_EXPORT: 'report.export',

  /* audit */
  AUDIT_READ: 'audit.read',

  /* administration */
  USER_READ: 'user.read',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  ROLE_READ: 'role.read',
  ROLE_UPDATE: 'role.update',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/** Grouping used by the seed and by the roles administration screen. */
export const PERMISSION_MODULES: Record<string, { label: string; permissions: Permission[] }> = {
  dashboard: { label: 'Dashboard', permissions: [PERMISSIONS.DASHBOARD_READ] },
  customers: {
    label: 'Customers',
    permissions: [
      PERMISSIONS.CUSTOMER_READ,
      PERMISSIONS.CUSTOMER_CREATE,
      PERMISSIONS.CUSTOMER_UPDATE,
      PERMISSIONS.CUSTOMER_ARCHIVE,
    ],
  },
  items: {
    label: 'Products & Services',
    permissions: [
      PERMISSIONS.ITEM_READ,
      PERMISSIONS.ITEM_CREATE,
      PERMISSIONS.ITEM_UPDATE,
      PERMISSIONS.ITEM_ARCHIVE,
    ],
  },
  masters: {
    label: 'Master Data',
    permissions: [PERMISSIONS.MASTER_READ, PERMISSIONS.MASTER_MANAGE],
  },
  company: {
    label: 'Company',
    permissions: [
      PERMISSIONS.COMPANY_READ,
      PERMISSIONS.COMPANY_UPDATE,
      PERMISSIONS.SETTINGS_READ,
      PERMISSIONS.SETTINGS_UPDATE,
    ],
  },
  templates: {
    label: 'Templates',
    permissions: [
      PERMISSIONS.TEMPLATE_READ,
      PERMISSIONS.TEMPLATE_CREATE,
      PERMISSIONS.TEMPLATE_UPDATE,
      PERMISSIONS.TEMPLATE_PUBLISH,
    ],
  },
  quotations: {
    label: 'Quotations',
    permissions: [
      PERMISSIONS.QUOTATION_READ,
      PERMISSIONS.QUOTATION_CREATE,
      PERMISSIONS.QUOTATION_UPDATE,
      PERMISSIONS.QUOTATION_DELETE,
      PERMISSIONS.QUOTATION_UPDATE_STATUS,
      PERMISSIONS.QUOTATION_CONVERT,
      PERMISSIONS.QUOTATION_SHARE,
      PERMISSIONS.QUOTATION_DOWNLOAD,
    ],
  },
  invoices: {
    label: 'Invoices',
    permissions: [
      PERMISSIONS.INVOICE_READ,
      PERMISSIONS.INVOICE_CREATE,
      PERMISSIONS.INVOICE_UPDATE,
      PERMISSIONS.INVOICE_DELETE,
      PERMISSIONS.INVOICE_UPDATE_STATUS,
      PERMISSIONS.INVOICE_CANCEL,
      PERMISSIONS.INVOICE_VOID,
      PERMISSIONS.INVOICE_SHARE,
      PERMISSIONS.INVOICE_DOWNLOAD,
      PERMISSIONS.PAYMENT_STATUS_UPDATE,
    ],
  },
  documents: { label: 'Documents', permissions: [PERMISSIONS.DOCUMENT_BULK_DOWNLOAD] },
  reports: { label: 'Reports', permissions: [PERMISSIONS.REPORT_READ, PERMISSIONS.REPORT_EXPORT] },
  audit: { label: 'Audit', permissions: [PERMISSIONS.AUDIT_READ] },
  administration: {
    label: 'Administration',
    permissions: [
      PERMISSIONS.USER_READ,
      PERMISSIONS.USER_CREATE,
      PERMISSIONS.USER_UPDATE,
      PERMISSIONS.ROLE_READ,
      PERMISSIONS.ROLE_UPDATE,
    ],
  },
};

/**
 * Role → permission assignment (decision Q6: Super Admin holds the higher-level
 * permissions). This is the seed; roles administration can change it afterwards.
 */

/** Read-only surface. The Finance Viewer gets exactly this and nothing else. */
const READ_AND_EXPORT: Permission[] = [
  PERMISSIONS.DASHBOARD_READ,
  PERMISSIONS.CUSTOMER_READ,
  PERMISSIONS.ITEM_READ,
  PERMISSIONS.MASTER_READ,
  PERMISSIONS.COMPANY_READ,
  PERMISSIONS.SETTINGS_READ,
  PERMISSIONS.TEMPLATE_READ,
  PERMISSIONS.QUOTATION_READ,
  PERMISSIONS.QUOTATION_DOWNLOAD,
  PERMISSIONS.INVOICE_READ,
  PERMISSIONS.INVOICE_DOWNLOAD,
  PERMISSIONS.DOCUMENT_BULK_DOWNLOAD,
  PERMISSIONS.REPORT_READ,
  PERMISSIONS.REPORT_EXPORT,
  PERMISSIONS.AUDIT_READ,
];

/** Everything the operational billing user needs to run the day to day. */
const ADMIN_PERMISSIONS: Permission[] = [
  ...READ_AND_EXPORT,
  PERMISSIONS.CUSTOMER_CREATE,
  PERMISSIONS.CUSTOMER_UPDATE,
  PERMISSIONS.CUSTOMER_ARCHIVE,
  PERMISSIONS.ITEM_CREATE,
  PERMISSIONS.ITEM_UPDATE,
  PERMISSIONS.ITEM_ARCHIVE,
  PERMISSIONS.QUOTATION_CREATE,
  PERMISSIONS.QUOTATION_UPDATE,
  PERMISSIONS.QUOTATION_UPDATE_STATUS,
  PERMISSIONS.QUOTATION_CONVERT,
  PERMISSIONS.QUOTATION_SHARE,
  PERMISSIONS.INVOICE_CREATE,
  PERMISSIONS.INVOICE_UPDATE,
  PERMISSIONS.INVOICE_UPDATE_STATUS,
  PERMISSIONS.INVOICE_SHARE,
  PERMISSIONS.PAYMENT_STATUS_UPDATE,
];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  /* Everything, including templates, cancel/void, draft delete, company settings,
     master data and user administration (decision Q6). */
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  FINANCE_VIEWER: READ_AND_EXPORT,
};

/** Splits "invoice.create" into its parts for storage and for the admin UI. */
export const splitPermission = (key: Permission): { module: string; action: string } => {
  const [module = '', action = ''] = key.split('.');
  return { module, action };
};

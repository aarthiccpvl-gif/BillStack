import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { ROLE_PERMISSIONS, type AuthUser, type Permission } from '@app/shared';
import { AppProviders } from '@/app/providers';
import { AppRoutes } from '@/app/routes';
import * as apiClientModule from '@/services/api-client';

/**
 * The shared test harness.
 *
 * Renders the real router and the real providers over a mocked API client, so a
 * test exercises routing, permissions and the components together rather than a
 * component in isolation pretending the rest exists.
 */

export const buildUser = (
  roleKey: 'SUPER_ADMIN' | 'ADMIN' | 'FINANCE_VIEWER',
  overrides: Partial<AuthUser> = {},
): AuthUser => ({
  id: 1,
  name: 'Alex Admin',
  email: 'user@example.com',
  phone: null,
  role: { id: 1, key: roleKey, name: roleKey, isReadOnly: roleKey === 'FINANCE_VIEWER' },
  permissions: (ROLE_PERMISSIONS[roleKey] ?? []) as Permission[],
  mustChangePassword: false,
  lastLoginAt: null,
  ...overrides,
});

export const CURRENCIES = [
  {
    code: 'INR',
    name: 'Indian Rupee',
    symbol: '₹',
    decimalPlaces: 2,
    symbolPosition: 'PREFIX',
    separatorStyle: 'INDIAN',
    isActive: true,
    sortOrder: 1,
  },
];

export const TAX_GROUPS = [
  {
    id: 1,
    name: 'GST 18%',
    scope: 'INTRA_STATE',
    totalRate: '18.0000',
    isActive: true,
    sortOrder: 1,
    rates: [
      { id: 1, name: 'CGST 9%', taxTypeKey: 'CGST', rate: '9.0000' },
      { id: 2, name: 'SGST 9%', taxTypeKey: 'SGST', rate: '9.0000' },
    ],
  },
];

export const UNITS = [{ id: 1, code: 'NOS', name: 'Numbers', isActive: true }];

export const CUSTOMER = {
  id: 7,
  customerCode: 'CUST-0007',
  name: 'Northwind Traders',
  companyName: 'Northwind Traders Pvt Ltd',
  contactPerson: null,
  email: null,
  phone: null,
  altPhone: null,
  gstin: '33AABCN1234C1Z5',
  pan: null,
  otherTaxId: null,
  taxTreatment: 'REGISTERED',
  placeOfSupplyStateCode: '33',
  defaultCurrencyCode: 'INR',
  paymentTermsDays: 30,
  notes: null,
  status: 'ACTIVE',
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
  addresses: [],
  contacts: [],
};

export const COMPANY = {
  companyName: 'Five2 Digitals',
  baseCurrencyCode: 'INR',
  defaultTermsQuotation: 'Valid for 30 days.',
  defaultTermsInvoice: 'Payable within the agreed terms.',
  defaultNotes: null,
  financialYearStartMonth: 4,
  isConfigured: true,
};

export const FINANCIAL_YEARS = [
  {
    id: 2,
    code: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    isCurrent: true,
    status: 'OPEN',
    documentCounts: { quotations: 5, invoices: 4 },
  },
  {
    id: 1,
    code: '2025-26',
    startDate: '2025-04-01',
    endDate: '2026-03-31',
    isCurrent: false,
    status: 'CLOSED',
    documentCounts: { quotations: 3, invoices: 2 },
  },
];

export const SUMMARY = {
  period: {
    scope: 'FY',
    financialYearId: 2,
    code: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    label: 'Financial year 2026-27',
  },
  baseCurrencyCode: 'INR',
  baseCurrencySymbol: '₹',
  baseCurrencyDecimalPlaces: 2,
  quotations: {
    total: 5,
    byStatus: {
      DRAFT: 1,
      SENT: 1,
      VIEWED: 0,
      ACCEPTED: 1,
      DECLINED: 1,
      EXPIRED: 0,
      CONVERTED: 1,
      CANCELLED: 0,
    },
    openCount: 2,
    openValueBase: '59000.00',
    acceptedValueBase: '94400.00',
    winRatePercent: '50',
  },
  invoices: {
    total: 4,
    byStatus: {
      DRAFT: 1,
      ISSUED: 1,
      SENT: 0,
      VIEWED: 0,
      PARTIALLY_PAID: 1,
      PAID: 0,
      CANCELLED: 0,
      VOID: 0,
    },
    overdueCount: 1,
    billedBase: '237400.00',
    receivedBase: '20000.00',
    outstandingBase: '217400.00',
    overdueBase: '70800.00',
  },
  byCurrency: [
    {
      currencyCode: 'INR',
      currencySymbol: '₹',
      currencyDecimalPlaces: 2,
      quotationCount: 4,
      quotationValue: '165200.00',
      invoiceCount: 2,
      invoiceBilled: '153400.00',
      invoiceReceived: '20000.00',
      invoiceOutstanding: '133400.00',
    },
    {
      currencyCode: 'USD',
      currencySymbol: '$',
      currencyDecimalPlaces: 2,
      quotationCount: 0,
      quotationValue: '0.00',
      invoiceCount: 1,
      invoiceBilled: '1000.00',
      invoiceReceived: '0.00',
      invoiceOutstanding: '1000.00',
    },
  ],
  mixedCurrencies: true,
};

export const CHARTS = {
  baseCurrencyCode: 'INR',
  months: ['04', '05', '06'].map((month) => ({
    month: `2026-${month}`,
    label: `${{ '04': 'Apr', '05': 'May', '06': 'Jun' }[month]} 26`,
    quotationValueBase: '10000.00',
    invoiceBilledBase: '20000.00',
    invoiceReceivedBase: '5000.00',
  })),
  funnel: { raised: 5, sent: 4, accepted: 2, converted: 1 },
};

export const RECENT = [
  {
    type: 'INVOICE',
    id: '9',
    number: 'FT001/2026-2027',
    status: 'ISSUED',
    customerName: 'Northwind Traders',
    documentDate: '2026-07-12',
    currencyCode: 'INR',
    currencySymbol: '₹',
    currencyDecimalPlaces: 2,
    grandTotal: '70800.00',
    isOverdue: true,
    updatedAt: '2026-08-20T10:00:00.000Z',
  },
  {
    type: 'QUOTATION',
    id: '3',
    number: 'QT003/2026-2027',
    status: 'SENT',
    customerName: 'Northwind Traders',
    documentDate: '2026-08-01',
    currencyCode: 'INR',
    currencySymbol: '₹',
    currencyDecimalPlaces: 2,
    grandTotal: '23600.00',
    updatedAt: '2026-08-19T10:00:00.000Z',
  },
];

export const REPORT = {
  kind: 'invoices',
  title: 'Invoices',
  columns: [
    { key: 'number', label: 'Number' },
    { key: 'customerName', label: 'Customer' },
    { key: 'status', label: 'Status' },
    { key: 'currencyCode', label: 'Currency' },
    { key: 'grandTotal', label: 'Total', numeric: true },
    { key: 'outstanding', label: 'Outstanding', numeric: true },
  ],
  rows: [
    {
      number: 'FT001/2026-2027',
      customerName: 'Northwind Traders',
      status: 'Partially paid',
      currencyCode: 'INR',
      grandTotal: '70800.00',
      outstanding: '50800.00',
    },
  ],
  totals: [
    {
      currencyCode: 'INR',
      currencySymbol: '₹',
      currencyDecimalPlaces: 2,
      count: 1,
      values: { grandTotal: '70800.00', outstanding: '50800.00' },
    },
  ],
  meta: {
    generatedAt: '2026-08-26T00:00:00.000Z',
    rowCount: 1,
    truncated: false,
    filtersApplied: [],
  },
};

export const AUDIT_ROWS = [
  {
    id: '55',
    createdAt: '2026-08-26T09:15:00.000Z',
    userName: 'Alex Admin',
    userEmail: 'alex@example.com',
    action: 'INVOICE_STATUS_CHANGED',
    entityType: 'INVOICE',
    entityId: '9',
    entityLabel: 'FT001/2026-2027',
    requestId: 'req-1',
    ip: '10.0.0.9',
    summary: 'Alex Admin changed the status of invoice FT001/2026-2027 (DRAFT → ISSUED)',
  },
];

export const HEALTH = {
  status: 'ok',
  version: '0.1.0',
  environment: 'test',
  uptimeSeconds: 1,
  timestamp: '2026-08-26T00:00:00.000Z',
  checks: { database: 'up' },
};

interface MockOptions {
  /** Rows the paginated endpoints return, keyed by path. */
  rows?: Record<string, unknown[]>;
  /** Extra single-object responses, keyed by the exact URL. */
  get?: Record<string, unknown>;
  /** What global search should find. */
  hits?: unknown[];
}

/** Answers every read the document screens make; unknown URLs return nothing. */
export const mockApi = (user: AuthUser, options: MockOptions = {}) => {
  vi.spyOn(apiClientModule.apiClient, 'get').mockImplementation(((url: string) => {
    if (options.get && url in options.get) return Promise.resolve(options.get[url]);
    if (url === '/auth/me') return Promise.resolve({ user });
    if (url === '/health') return Promise.resolve(HEALTH);
    if (url.startsWith('/masters/currencies')) return Promise.resolve(CURRENCIES);
    if (url.startsWith('/masters/tax-groups')) return Promise.resolve(TAX_GROUPS);
    if (url.startsWith('/masters/units')) return Promise.resolve(UNITS);
    if (url === '/company') return Promise.resolve(COMPANY);
    if (url === '/company/bank-accounts') return Promise.resolve([]);
    if (url.startsWith('/templates')) return Promise.resolve([]);
    if (url.startsWith('/dashboard/summary')) return Promise.resolve(SUMMARY);
    if (url.startsWith('/dashboard/charts')) return Promise.resolve(CHARTS);
    if (url.startsWith('/dashboard/recent-documents')) return Promise.resolve(RECENT);
    if (url.startsWith('/reports/')) return Promise.resolve(REPORT);
    if (url.startsWith('/audit-logs/entry/')) {
      return Promise.resolve({
        ...AUDIT_ROWS[0],
        previousData: { status: 'DRAFT' },
        newData: { status: 'ISSUED' },
        metadata: { reason: null },
      });
    }
    if (url.startsWith('/search')) {
      return Promise.resolve({ query: '', hits: options.hits ?? [], truncated: false });
    }
    return Promise.resolve([]);
  }) as never);

  vi.spyOn(apiClientModule.apiClient, 'getPaginated').mockImplementation(((url: string) => {
    const items =
      options.rows?.[url] ??
      (url === '/customers' ? [CUSTOMER] : url === '/audit-logs' ? AUDIT_ROWS : []);

    return Promise.resolve({
      items,
      meta: { page: 1, pageSize: 25, total: items.length, totalPages: items.length ? 1 : 0 },
    });
  }) as never);

  /* The preview and download helpers use the raw axios instance rather than the
     envelope-aware client. Answer those here too, so a detail-page test never
     reaches jsdom's XMLHttpRequest and races the next test with a network error. */
  vi.spyOn(apiClientModule.http, 'get').mockImplementation(((url: string) => {
    const data = url.endsWith('/preview') ? '<html><body>Preview</body></html>' : '';
    return Promise.resolve({
      data,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });
  }) as never);
};

export const renderAt = (path: string) =>
  render(
    <AppProviders
      queryClient={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );

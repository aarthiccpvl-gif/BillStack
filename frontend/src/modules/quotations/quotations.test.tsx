import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { ROLE_PERMISSIONS, type AuthUser, type Permission } from '@app/shared';
import { AppProviders } from '@/app/providers';
import { AppRoutes } from '@/app/routes';
import * as apiClientModule from '@/services/api-client';

/**
 * Quotation module tests.
 *
 * The one that matters most is the totals check: the editor runs the very same
 * `calculateDocument` the server runs, so if these figures ever stop matching the
 * engine's fixtures, the "what you see is what gets stored" promise is broken.
 */

const buildUser = (
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

const CURRENCIES = [
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

const TAX_GROUPS = [
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

const UNITS = [{ id: 1, code: 'NOS', name: 'Numbers', isActive: true }];

const CUSTOMER = {
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

const COMPANY = {
  companyName: 'Five2 Digitals',
  baseCurrencyCode: 'INR',
  defaultTermsQuotation: 'Valid for 30 days.',
  defaultNotes: null,
  financialYearStartMonth: 4,
  isConfigured: true,
};

const LIST_ROW = {
  id: '1',
  number: 'QT001/2026-2027',
  status: 'SENT',
  customerId: 7,
  customerName: 'Northwind Traders',
  documentDate: '2026-04-10',
  expiryDate: '2026-05-10',
  currencyCode: 'INR',
  currencySymbol: '₹',
  currencyDecimalPlaces: 2,
  grandTotal: '118000.00',
  createdByName: 'Alex Admin',
  createdAt: '2026-04-10T05:00:00.000Z',
  isExpired: false,
  convertedInvoiceNumber: null,
};

/** Answers every read the quotation screens make; unknown URLs return nothing. */
const mockApi = (user: AuthUser, rows = [LIST_ROW]) => {
  vi.spyOn(apiClientModule.apiClient, 'get').mockImplementation(((url: string) => {
    if (url === '/auth/me') return Promise.resolve({ user });
    if (url === '/health')
      return Promise.resolve({
        status: 'ok',
        version: '0.1.0',
        environment: 'test',
        uptimeSeconds: 1,
        timestamp: new Date().toISOString(),
        checks: { database: 'up' },
      });
    if (url.startsWith('/masters/currencies')) return Promise.resolve(CURRENCIES);
    if (url.startsWith('/masters/tax-groups')) return Promise.resolve(TAX_GROUPS);
    if (url.startsWith('/masters/units')) return Promise.resolve(UNITS);
    if (url === '/company') return Promise.resolve(COMPANY);
    if (url === '/company/bank-accounts') return Promise.resolve([]);
    if (url.startsWith('/templates')) return Promise.resolve([]);
    return Promise.resolve([]);
  }) as never);

  vi.spyOn(apiClientModule.apiClient, 'getPaginated').mockImplementation(((url: string) => {
    if (url === '/customers')
      return Promise.resolve({
        items: [CUSTOMER],
        meta: { page: 1, pageSize: 500, total: 1, totalPages: 1 },
      });
    if (url === '/items')
      return Promise.resolve({
        items: [],
        meta: { page: 1, pageSize: 500, total: 0, totalPages: 0 },
      });
    if (url === '/quotations')
      return Promise.resolve({
        items: rows,
        meta: { page: 1, pageSize: 25, total: rows.length, totalPages: 1 },
      });
    return Promise.resolve({ items: [], meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 } });
  }) as never);
};

const renderAt = (path: string) =>
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

describe('the quotation list', () => {
  it('shows each quotation with its status and its own currency', async () => {
    mockApi(buildUser('ADMIN'));
    renderAt('/quotations');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Quotations' }),
    ).toBeInTheDocument();

    expect(await screen.findByRole('link', { name: 'QT001/2026-2027' })).toBeInTheDocument();

    /* Scoped to the table: the customer filter lists the same name. */
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Northwind Traders')).toBeInTheDocument();
    expect(table.getByText('Sent')).toBeInTheDocument();
    /* Indian grouping, not 118,000.00 */
    expect(table.getByText('₹1,18,000.00')).toBeInTheDocument();
  });

  it('offers a way to raise the first one when the list is empty', async () => {
    mockApi(buildUser('ADMIN'), []);
    renderAt('/quotations');

    expect(await screen.findByText(/no quotations yet/i)).toBeInTheDocument();
  });
});

describe('what a Finance Viewer may do', () => {
  it('can read the list but is not offered a way to create one', async () => {
    mockApi(buildUser('FINANCE_VIEWER'));
    renderAt('/quotations');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Quotations' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new quotation/i })).not.toBeInTheDocument();
  });

  it('is refused the editor URL typed directly', async () => {
    mockApi(buildUser('FINANCE_VIEWER'));
    renderAt('/quotations/new');

    expect(
      await screen.findByRole('heading', { level: 1, name: /do not have access/i }),
    ).toBeInTheDocument();
  });
});

describe('the editor totals', () => {
  it('matches the engine while typing, tax and all', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('ADMIN'));
    renderAt('/quotations/new');

    expect(
      await screen.findByRole('heading', { level: 1, name: /new quotation/i }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Item name, line 1'), 'Website redesign');

    const quantity = screen.getByLabelText('Quantity, line 1');
    await user.clear(quantity);
    await user.type(quantity, '2');

    const rate = screen.getByLabelText('Rate, line 1');
    await user.clear(rate);
    await user.type(rate, '5000');

    await user.selectOptions(screen.getByLabelText('Tax, line 1'), '1');

    const totals = screen.getByText('Totals').closest('.card') as HTMLElement;

    /* Subtotal and taxable value are both 10,000 — nothing is discounted here. */
    await waitFor(() => {
      expect(within(totals).getAllByText('₹10,000.00')).toHaveLength(2);
    });

    /* CGST 9% + SGST 9% on 10,000 = 900 + 900, so the total is 11,800. */
    expect(within(totals).getAllByText('₹900.00')).toHaveLength(2);
    expect(within(totals).getByText('₹11,800.00')).toBeInTheDocument();
    expect(
      within(totals).getByText('Eleven Thousand Eight Hundred Rupees Only'),
    ).toBeInTheDocument();
  });

  it('takes the document discount off before tax', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('ADMIN'));
    renderAt('/quotations/new');

    await screen.findByRole('heading', { level: 1, name: /new quotation/i });

    const quantity = screen.getByLabelText('Quantity, line 1');
    await user.clear(quantity);
    await user.type(quantity, '1');

    const rate = screen.getByLabelText('Rate, line 1');
    await user.clear(rate);
    await user.type(rate, '10000');

    await user.selectOptions(screen.getByLabelText('Tax, line 1'), '1');
    await user.selectOptions(screen.getByLabelText('Discount type'), 'PERCENT');

    const discount = screen.getByLabelText('Document discount');
    await user.clear(discount);
    await user.type(discount, '10');

    const totals = screen.getByText('Totals').closest('.card') as HTMLElement;

    /* 10,000 − 10% = 9,000 taxable; 18% of that is 1,620; total 10,620. */
    await waitFor(() => {
      expect(within(totals).getByText('₹10,620.00')).toBeInTheDocument();
    });
    expect(within(totals).getByText('₹9,000.00')).toBeInTheDocument();
  });

  it('adds and removes item rows', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('ADMIN'));
    renderAt('/quotations/new');

    await screen.findByRole('heading', { level: 1, name: /new quotation/i });

    await user.click(screen.getByRole('button', { name: /add item/i }));
    expect(screen.getByLabelText('Item name, line 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove line 2/i }));
    expect(screen.queryByLabelText('Item name, line 2')).not.toBeInTheDocument();
  });
});

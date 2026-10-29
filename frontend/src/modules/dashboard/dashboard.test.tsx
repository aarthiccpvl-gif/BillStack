import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FINANCIAL_YEARS, buildUser, mockApi, renderAt } from '@/test/harness';
import * as apiClientModule from '@/services/api-client';

/**
 * Dashboard, search and the Finance Viewer surface.
 *
 * The dashboard's job is to be believable: the figures have to be the ones the
 * API returned, the roll-up has to admit it is a roll-up, and a read-only user
 * has to be able to complete their whole job from here.
 */

describe('the dashboard', () => {
  it('leads with what is owed and what is late', async () => {
    mockApi(buildUser('ADMIN'));
    renderAt('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();

    expect(await screen.findByText('₹2,17,400.00')).toBeInTheDocument();

    /* Scoped to the card: the figure and the word both appear again in the
       recent-documents table, where "Overdue" is a badge rather than a label. */
    const overdueCard = screen
      .getAllByText('Overdue')
      .map((element) => element.closest('.card'))
      .find((card) => card?.textContent?.includes('past due')) as HTMLElement;
    expect(within(overdueCard).getByText('₹70,800.00')).toBeInTheDocument();
    expect(within(overdueCard).getByText('1 invoice past due')).toBeInTheDocument();
  });

  it('names the financial year the figures belong to', async () => {
    mockApi(buildUser('ADMIN'));
    renderAt('/');

    expect(await screen.findByText(/Financial year 2026-27/)).toBeInTheDocument();
  });

  it('says out loud that a mixed-currency figure was converted', async () => {
    mockApi(buildUser('ADMIN'));
    renderAt('/');

    expect(
      await screen.findByText(/converted to INR at the rate each document recorded/i),
    ).toBeInTheDocument();
  });

  it('shows each currency exactly, without adding them together', async () => {
    mockApi(buildUser('ADMIN'));
    renderAt('/');

    const card = (await screen.findByText('By currency')).closest('.card') as HTMLElement;

    /* Dollars stay dollars: billed and outstanding both $1,000, not folded into rupees. */
    await waitFor(() => expect(within(card).getAllByText('$1,000.00')).toHaveLength(2));
    expect(within(card).getByText('₹1,53,400.00')).toBeInTheDocument();
  });

  it('draws the funnel from raised down to invoiced', async () => {
    mockApi(buildUser('ADMIN'));
    renderAt('/');

    const card = (await screen.findByText('Quotation funnel')).closest('.card') as HTMLElement;

    for (const label of ['Raised', 'Sent', 'Accepted', 'Invoiced']) {
      expect(await within(card).findByText(label)).toBeInTheDocument();
    }
  });

  it('offers the chart figures as a table, not only as bars', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('ADMIN'));
    renderAt('/');

    const disclosure = await screen.findByText('Show the figures');
    await user.click(disclosure);

    const figures = within(disclosure.closest('details') as HTMLElement);
    expect(figures.getByRole('columnheader', { name: 'Billed' })).toBeInTheDocument();
    expect(figures.getByRole('rowheader', { name: 'Apr 26' })).toBeInTheDocument();
  });

  it('links a recent document straight to it, and flags it overdue', async () => {
    mockApi(buildUser('ADMIN'));
    renderAt('/');

    const link = await screen.findByRole('link', { name: 'FT001/2026-2027' });
    expect(link).toHaveAttribute('href', '/invoices/9');
    expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0);
  });
});

describe('global search', () => {
  const HITS = [
    {
      type: 'INVOICE',
      id: '9',
      title: 'FT001/2026-2027',
      subtitle: 'Northwind Traders · 2026-07-12 · ₹70,800.00',
      path: '/invoices/9',
    },
    {
      type: 'CUSTOMER',
      id: '7',
      title: 'Northwind Traders',
      subtitle: 'CUST-0007',
      path: '/customers/7',
    },
  ];

  it('finds documents and customers, grouped', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('ADMIN'), { hits: HITS });
    renderAt('/');

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

    await user.type(screen.getByLabelText('Global search'), 'north');

    expect(await screen.findByText('FT001/2026-2027')).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText('Customers')).toBeInTheDocument();
  });

  it('says so when nothing matched instead of showing an empty box', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('ADMIN'), { hits: [] });
    renderAt('/');

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await user.type(screen.getByLabelText('Global search'), 'zzzz');

    expect(await screen.findByText(/Nothing matched/)).toBeInTheDocument();
  });

  it('does not search on a single letter', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('ADMIN'), { hits: HITS });
    renderAt('/');

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await user.type(screen.getByLabelText('Global search'), 'n');

    /* The recent-documents table has that number on the page already, so the
       assertion has to be about the results list, not the whole document. */
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });
});

describe('what a Finance Viewer can do from end to end', () => {
  it('sees the dashboard and the downloads workspace, and nothing to author with', async () => {
    mockApi(buildUser('FINANCE_VIEWER'));
    renderAt('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();

    for (const label of ['Quotations', 'Invoices', 'Customers', 'Downloads', 'Reports']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }

    for (const label of ['Products & Services', 'Templates', 'Users & Roles', 'Company Settings']) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
  });

  it('can open the downloads workspace and select documents', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('FINANCE_VIEWER'), {
      rows: {
        '/invoices': [
          {
            id: '9',
            number: 'FT001/2026-2027',
            status: 'ISSUED',
            customerId: 7,
            customerName: 'Northwind Traders',
            documentDate: '2026-07-12',
            dueDate: '2026-08-11',
            currencyCode: 'INR',
            currencySymbol: '₹',
            currencyDecimalPlaces: 2,
            grandTotal: '70800.00',
            amountPaid: '0.00',
            amountOutstanding: '70800.00',
            createdByName: 'Alex Admin',
            createdAt: '2026-07-12T00:00:00.000Z',
            isOverdue: true,
            daysOverdue: 15,
            quotationNumber: null,
          },
        ],
      },
    });
    renderAt('/downloads');

    expect(await screen.findByRole('heading', { level: 1, name: 'Downloads' })).toBeInTheDocument();

    await user.click(await screen.findByLabelText('Select FT001/2026-2027'));

    expect(screen.getByRole('button', { name: /Download 1 document/i })).toBeInTheDocument();
  });

  it('is refused a page it has no permission for', async () => {
    mockApi(buildUser('FINANCE_VIEWER'));
    renderAt('/admin/company');

    expect(
      await screen.findByRole('heading', { level: 1, name: /do not have access/i }),
    ).toBeInTheDocument();
  });
});

describe('the dashboard financial-year scope', () => {
  beforeEach(() => localStorage.clear());

  it('asks for the current year, then asks for all years explicitly', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('ADMIN'), {
      get: { '/masters/financial-years': FINANCIAL_YEARS },
    });
    renderAt('/');

    await screen.findByText('₹2,17,400.00');

    const select = screen.getByLabelText('Financial year');
    await waitFor(() => expect(select).toHaveValue('2'));

    const requested = () =>
      (apiClientModule.apiClient.get as unknown as { mock: { calls: [string][] } }).mock.calls.map(
        ([url]) => url,
      );

    await waitFor(() => expect(requested()).toContain('/dashboard/summary?financialYearId=2'));

    await user.selectOptions(select, 'ALL');

    await waitFor(() => expect(requested()).toContain('/dashboard/summary?financialYearId=all'));
    expect(localStorage.getItem('billstack.financial-year')).toBe('ALL');
  });
});

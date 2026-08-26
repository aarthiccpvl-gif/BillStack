import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildUser, mockApi, renderAt } from '@/test/harness';

/**
 * Invoice module tests.
 *
 * Beyond the shared document behaviour, an invoice has two facts of its own worth
 * pinning: what is still owed, and whether it is late. Both are derived, so both
 * have to survive a round trip through the list without being stored anywhere.
 */

const OVERDUE_ROW = {
  id: '1',
  number: 'FT001/2026-2027',
  status: 'SENT',
  customerId: 7,
  customerName: 'Northwind Traders',
  documentDate: '2026-04-10',
  dueDate: '2026-05-10',
  currencyCode: 'INR',
  currencySymbol: '₹',
  currencyDecimalPlaces: 2,
  grandTotal: '118000.00',
  amountPaid: '18000.00',
  amountOutstanding: '100000.00',
  createdByName: 'Alex Admin',
  createdAt: '2026-04-10T05:00:00.000Z',
  isOverdue: true,
  daysOverdue: 12,
  quotationNumber: 'QT004/2026-2027',
};

const withInvoices = (rows: unknown[] = [OVERDUE_ROW]) => ({ rows: { '/invoices': rows } });

describe('the invoice list', () => {
  it('shows what is owed and how late it is', async () => {
    mockApi(buildUser('ADMIN'), withInvoices());
    renderAt('/invoices');

    expect(await screen.findByRole('heading', { level: 1, name: 'Invoices' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'FT001/2026-2027' })).toBeInTheDocument();

    const table = within(screen.getByRole('table'));
    expect(table.getByText('₹1,18,000.00')).toBeInTheDocument();
    expect(table.getByText('₹1,00,000.00')).toBeInTheDocument();
    expect(table.getByText('12 days late')).toBeInTheDocument();
    expect(table.getByText('Overdue')).toBeInTheDocument();
    /* The real status is still shown beside the derived one. */
    expect(table.getByText('Sent')).toBeInTheDocument();
  });

  it('shows where an invoice came from', async () => {
    mockApi(buildUser('ADMIN'), withInvoices());
    renderAt('/invoices');

    expect(await screen.findByText('From QT004/2026-2027')).toBeInTheDocument();
  });

  it('offers overdue as a filter even though no row stores it', async () => {
    mockApi(buildUser('ADMIN'), withInvoices());
    renderAt('/invoices');

    const status = await screen.findByLabelText('Status');
    expect(within(status).getByRole('option', { name: 'Overdue' })).toBeInTheDocument();
  });
});

describe('what a Finance Viewer may do', () => {
  it('can read the list but is not offered a way to create one', async () => {
    mockApi(buildUser('FINANCE_VIEWER'), withInvoices());
    renderAt('/invoices');

    expect(await screen.findByRole('heading', { level: 1, name: 'Invoices' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new invoice/i })).not.toBeInTheDocument();
  });

  it('is refused the editor URL typed directly', async () => {
    mockApi(buildUser('FINANCE_VIEWER'), withInvoices());
    renderAt('/invoices/new');

    expect(
      await screen.findByRole('heading', { level: 1, name: /do not have access/i }),
    ).toBeInTheDocument();
  });
});

describe('the invoice editor', () => {
  it('asks for a due date and payment terms rather than a validity date', async () => {
    mockApi(buildUser('ADMIN'), withInvoices());
    renderAt('/invoices/new');

    expect(
      await screen.findByRole('heading', { level: 1, name: /new invoice/i }),
    ).toBeInTheDocument();

    expect(screen.getByLabelText(/payment terms/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/due date/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/valid until/i)).not.toBeInTheDocument();
  });

  it('runs the same engine the quotation editor does', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('ADMIN'), withInvoices());
    renderAt('/invoices/new');

    await screen.findByRole('heading', { level: 1, name: /new invoice/i });

    const quantity = screen.getByLabelText('Quantity, line 1');
    await user.clear(quantity);
    await user.type(quantity, '2');

    const rate = screen.getByLabelText('Rate, line 1');
    await user.clear(rate);
    await user.type(rate, '5000');

    await user.selectOptions(screen.getByLabelText('Tax, line 1'), '1');

    const totals = screen.getByText('Totals').closest('.card') as HTMLElement;

    await waitFor(() => {
      expect(within(totals).getByText('₹11,800.00')).toBeInTheDocument();
    });
    expect(within(totals).getAllByText('₹900.00')).toHaveLength(2);
  });
});

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildUser, mockApi, renderAt } from '@/test/harness';

/**
 * Quotation module tests.
 *
 * The one that matters most is the totals check: the editor runs the very same
 * `calculateDocument` the server runs, so if these figures ever stop matching the
 * engine's fixtures, the "what you see is what gets stored" promise is broken.
 */

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

const withQuotations = (rows: unknown[] = [LIST_ROW]) => ({ rows: { '/quotations': rows } });

describe('the quotation list', () => {
  it('shows each quotation with its status and its own currency', async () => {
    mockApi(buildUser('ADMIN'), withQuotations());
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
    mockApi(buildUser('ADMIN'), withQuotations([]));
    renderAt('/quotations');

    expect(await screen.findByText(/no quotations yet/i)).toBeInTheDocument();
  });
});

describe('what a Finance Viewer may do', () => {
  it('can read the list but is not offered a way to create one', async () => {
    mockApi(buildUser('FINANCE_VIEWER'), withQuotations());
    renderAt('/quotations');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Quotations' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new quotation/i })).not.toBeInTheDocument();
  });

  it('is refused the editor URL typed directly', async () => {
    mockApi(buildUser('FINANCE_VIEWER'), withQuotations());
    renderAt('/quotations/new');

    expect(
      await screen.findByRole('heading', { level: 1, name: /do not have access/i }),
    ).toBeInTheDocument();
  });
});

describe('the editor totals', () => {
  it('matches the engine while typing, tax and all', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('ADMIN'), withQuotations());
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
    mockApi(buildUser('ADMIN'), withQuotations());
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
    mockApi(buildUser('ADMIN'), withQuotations());
    renderAt('/quotations/new');

    await screen.findByRole('heading', { level: 1, name: /new quotation/i });

    await user.click(screen.getByRole('button', { name: /add item/i }));
    expect(screen.getByLabelText('Item name, line 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove line 2/i }));
    expect(screen.queryByLabelText('Item name, line 2')).not.toBeInTheDocument();
  });

  it('asks a quotation for a validity date, not a due date', async () => {
    mockApi(buildUser('ADMIN'), withQuotations());
    renderAt('/quotations/new');

    await screen.findByRole('heading', { level: 1, name: /new quotation/i });

    expect(screen.getByLabelText(/valid until/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/due date/i)).not.toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InvoiceRecord } from '@app/shared';
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

const DRAFT_INVOICE: InvoiceRecord = {
  id: '9',
  number: 'FT001/2026-2027',
  status: 'DRAFT',
  financialYearId: 2,
  financialYearCode: '2026-27',
  customerId: 7,
  customerSnapshot: {
    name: 'Northwind Traders',
    customerCode: 'CUST-0007',
    companyName: 'Northwind Traders Pvt Ltd',
    contactPerson: null,
    email: null,
    phone: null,
    gstin: '33AABCN1234C1Z5',
    pan: null,
    taxTreatment: 'REGISTERED',
  },
  billingAddress: null,
  shippingAddress: null,
  placeOfSupplyStateCode: '33',
  currencyCode: 'INR',
  currencySymbol: '₹',
  currencyDecimalPlaces: 2,
  exchangeRateToBase: '1.000000',
  baseCurrencyCode: 'INR',
  baseTotal: '118000.00',
  documentDate: '2026-07-12',
  dueDate: '2026-08-11',
  paymentTermsDays: 30,
  referenceNumber: null,
  subject: null,
  discountMode: 'NONE',
  discountValue: '0.00',
  subtotal: '100000.00',
  discountTotal: '0.00',
  taxableTotal: '100000.00',
  taxTotal: '18000.00',
  adjustment: '0.00',
  roundOff: '0.00',
  roundOffEnabled: false,
  grandTotal: '118000.00',
  taxSummary: {
    byComponent: [
      {
        label: 'CGST 9%',
        ratePercent: '9.0000',
        taxableAmount: '100000.00',
        taxAmount: '9000.00',
      },
      {
        label: 'SGST 9%',
        ratePercent: '9.0000',
        taxableAmount: '100000.00',
        taxAmount: '9000.00',
      },
    ],
    amountInWords: 'One lakh eighteen thousand rupees only',
  },
  amountPaid: '0.00',
  amountOutstanding: '118000.00',
  paymentReference: null,
  notes: null,
  terms: null,
  customerMessage: null,
  paymentInstructions: null,
  bankAccountId: null,
  showBankDetails: false,
  templateId: 1,
  templateVersionId: 1,
  templateName: 'Default',
  currentVersion: 1,
  customFields: null,
  quotationId: null,
  quotationNumber: null,
  issuedAt: null,
  sentAt: null,
  firstViewedAt: null,
  paidAt: null,
  cancelledAt: null,
  voidedAt: null,
  cancelReason: null,
  createdById: 1,
  createdByName: 'Alex Admin',
  createdAt: '2026-07-12T05:00:00.000Z',
  updatedAt: '2026-07-12T05:00:00.000Z',
  items: [],
  isDraft: true,
  isOverdue: false,
  daysOverdue: 0,
};

const withDraftInvoice = () => ({ get: { '/invoices/9': DRAFT_INVOICE } });

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

describe('the invoice detail actions', () => {
  it('offers a draft’s full action set to a super admin', async () => {
    mockApi(buildUser('SUPER_ADMIN'), withDraftInvoice());
    renderAt('/invoices/9');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'FT001/2026-2027' }),
    ).toBeInTheDocument();

    for (const name of ['Issue', 'Download PDF', 'Duplicate', 'Cancel invoice', 'Delete draft']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument();
    /* Void applies to an issued invoice, not a draft. */
    expect(screen.queryByRole('button', { name: 'Void' })).not.toBeInTheDocument();
  });

  it('does not offer cancel, void or delete to an admin', async () => {
    mockApi(buildUser('ADMIN'), withDraftInvoice());
    renderAt('/invoices/9');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'FT001/2026-2027' }),
    ).toBeInTheDocument();

    for (const name of ['Issue', 'Download PDF', 'Duplicate']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument();

    for (const name of ['Cancel invoice', 'Void', 'Delete draft']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('leaves a finance viewer with the download only', async () => {
    mockApi(buildUser('FINANCE_VIEWER'), withDraftInvoice());
    renderAt('/invoices/9');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'FT001/2026-2027' }),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeInTheDocument();
    for (const name of ['Issue', 'Duplicate', 'Cancel invoice', 'Void', 'Delete draft']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
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

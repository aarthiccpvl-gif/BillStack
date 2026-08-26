import type { StoredInvoiceStatus } from '../constants/documents';
import type { AddressBlock } from './document';
import type { DocumentCustomerSnapshot, DocumentLineRecord } from './quotation';

/** Shapes returned by the invoice endpoints. Amounts are strings, always. */

export interface InvoiceRecord {
  id: string;
  number: string;
  status: StoredInvoiceStatus;
  financialYearId: number;
  financialYearCode: string;

  customerId: number;
  customerSnapshot: DocumentCustomerSnapshot;
  billingAddress: AddressBlock | null;
  shippingAddress: AddressBlock | null;
  placeOfSupplyStateCode: string | null;

  currencyCode: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
  exchangeRateToBase: string;
  baseCurrencyCode: string;
  baseTotal: string;

  documentDate: string;
  dueDate: string | null;
  paymentTermsDays: number;
  referenceNumber: string | null;
  subject: string | null;

  discountMode: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountValue: string;
  subtotal: string;
  discountTotal: string;
  taxableTotal: string;
  taxTotal: string;
  adjustment: string;
  roundOff: string;
  roundOffEnabled: boolean;
  grandTotal: string;
  taxSummary: {
    byComponent: {
      label: string;
      ratePercent?: string;
      taxableAmount: string;
      taxAmount: string;
    }[];
    amountInWords: string;
  };

  /** Recorded by an admin, not posted from a ledger (decision Q2). */
  amountPaid: string;
  /** grandTotal − amountPaid, never negative. */
  amountOutstanding: string;
  paymentReference: string | null;

  notes: string | null;
  terms: string | null;
  customerMessage: string | null;
  paymentInstructions: string | null;
  bankAccountId: number | null;
  showBankDetails: boolean;

  templateId: number;
  templateVersionId: number;
  templateName: string;
  currentVersion: number;
  customFields: { label: string; value: string }[] | null;

  /** Set when this invoice came from a quotation. */
  quotationId: string | null;
  quotationNumber: string | null;

  issuedAt: string | null;
  sentAt: string | null;
  firstViewedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  voidedAt: string | null;
  cancelReason: string | null;

  createdById: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;

  items: DocumentLineRecord[];

  isDraft: boolean;
  /** Derived on read from the due date, so it can never go stale. */
  isOverdue: boolean;
  daysOverdue: number;
}

/** Row shape for the list, deliberately lighter than the full record. */
export interface InvoiceListRow {
  id: string;
  number: string;
  status: StoredInvoiceStatus;
  customerId: number;
  customerName: string;
  documentDate: string;
  dueDate: string | null;
  currencyCode: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
  grandTotal: string;
  amountPaid: string;
  amountOutstanding: string;
  createdByName: string;
  createdAt: string;
  isOverdue: boolean;
  daysOverdue: number;
  quotationNumber: string | null;
}

import type { QuotationStatus } from '../constants/documents';
import type { AddressBlock } from './document';

/** Shapes returned by the quotation endpoints. Amounts are strings, always. */

export interface DocumentLineRecord {
  id: string;
  lineNumber: number;
  itemId: number | null;
  itemCode: string | null;
  name: string;
  description: string | null;
  hsnSacCode: string | null;
  unitCode: string | null;
  quantity: string;
  rate: string;
  discountMode: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountValue: string;
  discountAmount: string;
  lineGross: string;
  lineNet: string;
  allocatedDocDiscount: string;
  taxableAmount: string;
  taxAmount: string;
  lineTotal: string;
  taxGroupId: number | null;
  isTaxExempt: boolean;
  exemptReason: string | null;
  taxes: {
    id: string;
    taxRateId: number;
    taxTypeKey: string;
    label: string;
    ratePercent: string;
    taxableAmount: string;
    taxAmount: string;
  }[];
}

export interface DocumentCustomerSnapshot {
  name: string;
  customerCode: string;
  companyName: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  pan: string | null;
  taxTreatment: string;
}

export interface QuotationRecord {
  id: string;
  number: string;
  status: QuotationStatus;
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
  expiryDate: string | null;
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
  /** What was asked for. A zero round-off does not mean rounding was switched off. */
  roundOffEnabled: boolean;
  grandTotal: string;
  taxSummary: {
    byComponent: { label: string; ratePercent?: string; taxableAmount: string; taxAmount: string }[];
    amountInWords: string;
  };

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

  convertedInvoiceId: string | null;
  convertedInvoiceNumber: string | null;
  sentAt: string | null;
  firstViewedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;

  createdById: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;

  items: DocumentLineRecord[];

  /** True while the quotation can still be edited without recording a revision. */
  isDraft: boolean;
  /** Derived on read so it can never go stale. */
  isExpired: boolean;
}

/** Row shape for the list, deliberately lighter than the full record. */
export interface QuotationListRow {
  id: string;
  number: string;
  status: QuotationStatus;
  customerId: number;
  customerName: string;
  documentDate: string;
  expiryDate: string | null;
  currencyCode: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
  grandTotal: string;
  createdByName: string;
  createdAt: string;
  isExpired: boolean;
  convertedInvoiceNumber: string | null;
}

export interface DocumentRevisionRecord {
  id: string;
  version: number;
  changedById: number;
  changedByName: string;
  changeReason: string | null;
  changedFields: string[];
  createdAt: string;
}

export interface ShareLinkRecord {
  id: string;
  url: string;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  /** Pre-built wa.me deep link; no WhatsApp API involved (decision Q14). */
  whatsappUrl: string;
}

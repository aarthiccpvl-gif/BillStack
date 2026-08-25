/**
 * The document rendering contract.
 *
 * Everything the renderer needs, and nothing it does not — no database ids, no
 * live lookups. `schemaVersion` is stamped so a revision snapshot taken today can
 * still be re-rendered years from now, which is what makes "download the PDF of
 * version 1" honest rather than approximate.
 *
 * Every amount is a raw decimal string. Formatting to ₹1,25,000.00 happens in the
 * renderer through the shared `formatMoney`, so the screen and the PDF cannot
 * disagree about how a number looks.
 */

export interface AddressBlock {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
  country?: string | null;
  postalCode?: string | null;
}

export interface DocumentAsset {
  /** data: URI — the rendered HTML makes no network requests at all. */
  dataUri: string;
}

export interface DocumentCompany {
  name: string;
  legalName?: string | null;
  address: AddressBlock;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  gstin?: string | null;
  pan?: string | null;
  cin?: string | null;
  stateCode?: string | null;
  logo?: DocumentAsset | null;
  signature?: DocumentAsset | null;
  seal?: DocumentAsset | null;
  signatureLabel?: string | null;
}

export interface DocumentCustomer {
  name: string;
  code: string;
  companyName?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  gstin?: string | null;
  pan?: string | null;
  taxTreatment: string;
  placeOfSupply?: string | null;
}

export interface DocumentCurrency {
  code: string;
  symbol: string;
  decimalPlaces: number;
  symbolPosition: 'PREFIX' | 'SUFFIX';
  separatorStyle: 'WESTERN' | 'INDIAN';
}

export interface DocumentLineTax {
  label: string;
  ratePercent: string;
  taxAmount: string;
}

export interface DocumentLine {
  lineNumber: number;
  name: string;
  description?: string | null;
  hsnSac?: string | null;
  unit?: string | null;
  quantity: string;
  rate: string;
  discountLabel?: string | null;
  discountAmount?: string | null;
  taxes: DocumentLineTax[];
  taxableAmount: string;
  lineTotal: string;
}

export interface DocumentTotals {
  subtotal: string;
  discountTotal: string;
  taxableTotal: string;
  taxTotal: string;
  adjustment: string;
  roundOff: string;
  grandTotal: string;
  amountPaid?: string | null;
  balanceDue?: string | null;
  amountInWords: string;
}

export interface TaxSummaryRow {
  label: string;
  ratePercent?: string;
  taxableAmount: string;
  taxAmount: string;
}

export interface DocumentBank {
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc?: string | null;
  swift?: string | null;
  branch?: string | null;
  paymentInstructions?: string | null;
}

export interface DocumentData {
  schemaVersion: 1;
  docType: 'QUOTATION' | 'INVOICE';
  number: string;
  status: string;
  dates: {
    document: string;
    /** Quotations only. */
    expiry?: string | null;
    /** Invoices only. */
    due?: string | null;
  };
  reference?: string | null;
  subject?: string | null;
  company: DocumentCompany;
  customer: DocumentCustomer;
  billingAddress?: AddressBlock | null;
  shippingAddress?: AddressBlock | null;
  currency: DocumentCurrency;
  lines: DocumentLine[];
  totals: DocumentTotals;
  taxSummary: {
    byComponent: TaxSummaryRow[];
    byHsn?: TaxSummaryRow[];
  };
  bank?: DocumentBank | null;
  notes?: string | null;
  terms?: string | null;
  customerMessage?: string | null;
  customFields?: { label: string; value: string }[];
  meta: {
    templateKey: string;
    templateVersion: number;
    documentVersion: number;
    generatedAt: string;
    /** Reserved for a future e-invoice QR payload; never populated today. */
    qrPayload?: never;
  };
}

/** Summary shapes returned by the templates API. */
export interface TemplateVersionSummary {
  id: number;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  changeNote: string | null;
  publishedAt: string | null;
  createdAt: string;
  /** Number of documents rendered with this version — blocks editing. */
  documentCount?: number;
}

export interface TemplateRecord {
  id: number;
  key: string;
  name: string;
  docType: 'QUOTATION' | 'INVOICE';
  engineKey: string;
  description: string | null;
  isDefault: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  versions: TemplateVersionSummary[];
  /** Highest published version, which is what new documents will use. */
  currentVersion: number | null;
}

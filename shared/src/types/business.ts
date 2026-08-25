import type { TaxTreatment } from '../schemas/customer';
import type { ItemType } from '../schemas/item';

/** Company, customer and item shapes returned by the API. */

export interface CompanyAssetRef {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** API path the browser loads it from — always proxied, never a raw disk path. */
  url: string;
}

export interface CompanySettingsRecord {
  companyName: string;
  legalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  gstin: string | null;
  pan: string | null;
  cin: string | null;
  primaryColor: string;
  secondaryColor: string;
  defaultFont: string;
  signatureLabel: string | null;
  baseCurrencyCode: string;
  financialYearStartMonth: number;
  defaultTermsInvoice: string | null;
  defaultTermsQuotation: string | null;
  defaultNotes: string | null;
  /** False until an administrator has replaced the placeholder details. */
  isConfigured: boolean;
  logo: CompanyAssetRef | null;
  favicon: CompanyAssetRef | null;
  signature: CompanyAssetRef | null;
  seal: CompanyAssetRef | null;
  updatedAt: string;
}

export interface BankAccountRecord {
  id: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string | null;
  swift: string | null;
  branch: string | null;
  currencyCode: string | null;
  paymentInstructions: string | null;
  isDefault: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

export interface CustomerAddressRecord {
  id: number;
  type: 'BILLING' | 'SHIPPING' | 'OTHER';
  label: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  country: string | null;
  postalCode: string | null;
  isDefault: boolean;
}

export interface CustomerContactRecord {
  id: number;
  name: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

export interface CustomerRecord {
  id: number;
  customerCode: string;
  name: string;
  companyName: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  altPhone: string | null;
  gstin: string | null;
  pan: string | null;
  otherTaxId: string | null;
  taxTreatment: TaxTreatment;
  placeOfSupplyStateCode: string | null;
  defaultCurrencyCode: string;
  paymentTermsDays: number;
  notes: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  addresses: CustomerAddressRecord[];
  contacts: CustomerContactRecord[];
}

/** Totals for the customer detail page, grouped by currency because summing across
 *  currencies would be meaningless (decision Q3). */
export interface CustomerSummary {
  quotationCount: number;
  invoiceCount: number;
  byCurrency: {
    currencyCode: string;
    quotationTotal: string;
    invoiceTotal: string;
    outstanding: string;
  }[];
  baseCurrencyCode: string;
  baseInvoiceTotal: string;
  baseOutstanding: string;
}

export interface ItemRecord {
  id: number;
  itemCode: string;
  name: string;
  description: string | null;
  type: ItemType;
  unitId: number | null;
  unitCode: string | null;
  defaultRate: string;
  currencyCode: string;
  defaultTaxGroupId: number | null;
  defaultTaxGroupName: string | null;
  hsnSacCode: string | null;
  categoryId: number | null;
  categoryName: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

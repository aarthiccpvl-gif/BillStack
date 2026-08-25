import type { SeparatorStyle, SymbolPosition } from '../finance/money';

/** Shapes returned by the master-data endpoints. Amounts are strings, always. */

export interface CurrencyRecord {
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  symbolPosition: SymbolPosition;
  separatorStyle: SeparatorStyle;
  isActive: boolean;
  sortOrder: number;
  /** True when a document or master already references it — blocks deactivation. */
  inUse?: boolean;
}

export type TaxScope = 'INTRA_STATE' | 'INTER_STATE' | 'UNION_TERRITORY' | 'NONE';

export interface TaxTypeRecord {
  id: number;
  key: string;
  name: string;
  scope: TaxScope;
  isActive: boolean;
  sortOrder: number;
}

export interface TaxRateRecord {
  id: number;
  taxTypeId: number;
  taxTypeKey: string;
  name: string;
  /** Percentage as a decimal string, e.g. "9.0000". */
  rate: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isActive: boolean;
}

export interface TaxGroupRecord {
  id: number;
  name: string;
  scope: TaxScope;
  /** Sum of the component rates, for display and sorting. */
  totalRate: string;
  isActive: boolean;
  sortOrder: number;
  rates: { id: number; name: string; taxTypeKey: string; rate: string }[];
}

export interface UnitRecord {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ItemCategoryRecord {
  id: number;
  name: string;
  parentId: number | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  itemCount?: number;
}

export interface FinancialYearRecord {
  id: number;
  code: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: 'OPEN' | 'CLOSED';
  documentCounts?: { quotations: number; invoices: number };
}

export interface NumberingSeriesRecord {
  id: number;
  docType: 'QUOTATION' | 'INVOICE';
  prefix: string;
  pattern: string;
  padding: number;
  startNumber: number;
  resetPolicy: 'FINANCIAL_YEAR' | 'NEVER';
  isActive: boolean;
  /** Rendered with the current financial year, e.g. "FT001/2026-2027". */
  preview: string;
  /** Highest number already issued in the current year; the format locks once > 0. */
  lastNumber: number;
}

export interface ExchangeRateRecord {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  effectiveDate: string;
  source: string;
}

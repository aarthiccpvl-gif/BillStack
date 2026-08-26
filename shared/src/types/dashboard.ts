import type { QuotationStatus, StoredInvoiceStatus } from '../constants/documents';

/**
 * Dashboard shapes.
 *
 * Every figure appears twice: once per currency, where it is exact, and once
 * rolled up into the base currency using the rate each document recorded at the
 * time (decision Q3). The roll-up is a reporting convenience and says so; the
 * per-currency rows are the truth, because ₹ and $ do not add up.
 */

export interface CurrencyTotals {
  currencyCode: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
  quotationCount: number;
  quotationValue: string;
  invoiceCount: number;
  invoiceBilled: string;
  invoiceReceived: string;
  invoiceOutstanding: string;
}

export interface DashboardSummary {
  financialYear: { id: number; code: string; startDate: string; endDate: string };
  baseCurrencyCode: string;
  baseCurrencySymbol: string;
  baseCurrencyDecimalPlaces: number;

  quotations: {
    total: number;
    byStatus: Record<QuotationStatus, number>;
    /** Sent, viewed or accepted — still live, not yet won or lost. */
    openCount: number;
    openValueBase: string;
    acceptedValueBase: string;
    /** Accepted or converted, as a share of everything that reached the customer. */
    winRatePercent: string;
  };

  invoices: {
    total: number;
    byStatus: Record<StoredInvoiceStatus, number>;
    overdueCount: number;
    billedBase: string;
    receivedBase: string;
    outstandingBase: string;
    overdueBase: string;
  };

  byCurrency: CurrencyTotals[];
  /** True when a figure below rolled up more than one currency. */
  mixedCurrencies: boolean;
}

export interface MonthPoint {
  /** "2026-04" */
  month: string;
  label: string;
  quotationValueBase: string;
  invoiceBilledBase: string;
  invoiceReceivedBase: string;
}

export interface DashboardCharts {
  months: MonthPoint[];
  baseCurrencyCode: string;
  /** How far a quotation gets: raised → sent → accepted → invoiced. */
  funnel: { raised: number; sent: number; accepted: number; converted: number };
}

export interface RecentDocument {
  type: 'QUOTATION' | 'INVOICE';
  id: string;
  number: string;
  status: string;
  customerName: string;
  documentDate: string;
  currencyCode: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
  grandTotal: string;
  /** Invoices only: past its due date and not settled. */
  isOverdue?: boolean;
  updatedAt: string;
}

export interface SearchHit {
  type: 'QUOTATION' | 'INVOICE' | 'CUSTOMER' | 'ITEM';
  id: string;
  title: string;
  subtitle: string;
  /** Where the app should navigate when the hit is chosen. */
  path: string;
}

export interface SearchResults {
  query: string;
  hits: SearchHit[];
  /** True when more matched than were returned. */
  truncated: boolean;
}

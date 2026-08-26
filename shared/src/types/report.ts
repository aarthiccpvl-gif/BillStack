/**
 * Report shapes.
 *
 * A report is a table plus the totals that belong under it. Both are computed on
 * the server from the same query, so the figure at the bottom of the screen and
 * the figure at the bottom of the exported file are the same number arrived at
 * the same way.
 *
 * Totals are per currency, never summed across them (decision Q3).
 */

export interface ReportColumn {
  key: string;
  label: string;
  /** Right-aligned, tabular figures, and formatted as money in the exports. */
  numeric?: boolean;
  /**
   * Holds an ISO date-only string. It travels raw, exactly as money does, and
   * each renderer decides how to show it: the screen and the PDF format it for
   * a reader, CSV and XLSX keep the ISO so a spreadsheet can still sort it.
   */
  date?: boolean;
  /** Hidden on small screens; still present in every export. */
  secondary?: boolean;
}

export interface ReportTotalsRow {
  currencyCode: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
  /** Keyed by column: only the numeric columns appear. */
  values: Record<string, string>;
  count: number;
}

export interface ReportResult {
  kind: string;
  title: string;
  columns: ReportColumn[];
  /** Cell values, already formatted as strings by the server. */
  rows: Record<string, string>[];
  totals: ReportTotalsRow[];
  meta: {
    generatedAt: string;
    rowCount: number;
    /** True when the response was capped; the export still carries everything. */
    truncated: boolean;
    filtersApplied: { label: string; value: string }[];
  };
}

export interface AuditLogRow {
  id: string;
  createdAt: string;
  userName: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  requestId: string | null;
  ip: string | null;
  summary: string;
}

export interface AuditLogEntry extends AuditLogRow {
  previousData: unknown;
  newData: unknown;
  metadata: unknown;
}

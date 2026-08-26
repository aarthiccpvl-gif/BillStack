import { renderToStaticMarkup } from 'react-dom/server';
import {
  formatMoney,
  type CurrencyFormat,
  type ReportColumn,
  type ReportFilters,
} from '@app/shared';

import { formatDate } from '../../render/blocks';
import { fontFaceCss } from '../../render/fonts';

/**
 * The printable report.
 *
 * Rendered with the same React-to-static-markup approach the documents use, and
 * self-contained for the same reason: Chromium loads no network resources, so a
 * PDF produced today and one produced next year are identical.
 *
 * Landscape is set in the page's own CSS rather than passed to Puppeteer, because
 * `preferCSSPageSize` means the document decides its own shape — which is what
 * lets a wide report be wide without every other PDF changing.
 */

export interface ReportPdfInput {
  title: string;
  companyName: string;
  generatedOn: string;
  columns: ReportColumn[];
  rows: Record<string, string>[];
  totals: {
    currencyCode: string;
    count: number;
    values: Record<string, string>;
  }[];
  rowCount: number;
  /** Set when the table was cut short, so the page can say so. */
  capped: number | null;
  filters: ReportFilters;
  /** Grouping rules per currency code; money arrives raw and is formatted here. */
  currencies: Record<string, CurrencyFormat>;
}

const CSS = `
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 10mm;
  font-family: 'Poppins', 'Liberation Sans', Arial, Helvetica, sans-serif;
  font-size: 8.5pt;
  color: #131c17;
}
header { border-bottom: 1.5pt solid #1b5e40; padding-bottom: 4mm; margin-bottom: 4mm; }
h1 { font-size: 14pt; margin: 0 0 1mm; color: #1b5e40; }
.meta { font-size: 8pt; color: #6b7770; }
.filters { margin-top: 2mm; font-size: 8pt; color: #6b7770; }
.filters span { display: inline-block; margin-right: 6mm; }
.filters b { color: #131c17; font-weight: 600; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
th, td { padding: 1.6mm 2mm; text-align: left; vertical-align: top; }
th {
  background: #1b5e40;
  color: #fff;
  font-size: 7.5pt;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
tbody tr { break-inside: avoid; }
tbody tr:nth-child(even) { background: #f3f5f2; }
td.numeric, th.numeric { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
tfoot td { font-weight: 600; border-top: 1pt solid #1b5e40; background: #edf3e7; }
.note { margin-top: 4mm; font-size: 8pt; color: #b26a10; }
.empty { padding: 10mm; text-align: center; color: #6b7770; }
`;

const FILTER_LABELS: Record<string, string> = {
  dateFrom: 'From',
  dateTo: 'To',
  customerId: 'Customer',
  currencyCode: 'Currency',
  status: 'Status',
  financialYearId: 'Financial year',
  createdById: 'Raised by',
  search: 'Search',
  outstandingOnly: 'Unpaid only',
};

export const renderReportHtml = (input: ReportPdfInput): string => {
  const applied = Object.entries(input.filters).filter(
    ([, value]) => value !== undefined && value !== '' && value !== false,
  );

  /*
   * Money and dates arrive raw. ₹1,23,900 and $123,900 group differently, so the
   * row says which it is; dates are formatted with the same string-only routine
   * the documents use, which never touches a locale or a timezone and so cannot
   * make the PDF depend on the machine that produced it.
   */
  const show = (value: string | undefined, column: ReportColumn, code?: string): string => {
    if (!value) return '';
    if (column.date) return formatDate(value, 'dd-MMM-yyyy');
    if (!column.numeric || !/^-?\d+(\.\d+)?$/.test(value)) return value;
    const currency = input.currencies[code ?? ''];
    return currency ? formatMoney(value, currency, { omitSymbol: true }) : value;
  };

  const body = renderToStaticMarkup(
    <>
      <header>
        <h1>{input.title}</h1>
        <div className="meta">
          {input.companyName} · generated {input.generatedOn} · {input.rowCount} row
          {input.rowCount === 1 ? '' : 's'}
        </div>
        {applied.length > 0 && (
          <div className="filters">
            {applied.map(([key, value]) => (
              <span key={key}>
                <b>{FILTER_LABELS[key] ?? key}:</b> {String(value)}
              </span>
            ))}
          </div>
        )}
      </header>

      {input.rows.length === 0 ? (
        <div className="empty">Nothing matched these filters.</div>
      ) : (
        <table>
          <thead>
            <tr>
              {input.columns.map((column) => (
                <th key={column.key} className={column.numeric ? 'numeric' : undefined}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {input.rows.map((row, index) => (
              <tr key={index}>
                {input.columns.map((column) => (
                  <td key={column.key} className={column.numeric ? 'numeric' : undefined}>
                    {show(row[column.key], column, row.currencyCode)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {input.totals.length > 0 && (
            <tfoot>
              {input.totals.map((total) => (
                <tr key={total.currencyCode}>
                  {input.columns.map((column, index) => (
                    <td key={column.key} className={column.numeric ? 'numeric' : undefined}>
                      {index === 0
                        ? `Total (${total.currencyCode}, ${total.count})`
                        : show(total.values[column.key], column, total.currencyCode)}
                    </td>
                  ))}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      )}

      {input.capped !== null && (
        <p className="note">
          This PDF shows the first {input.capped} of {input.rowCount} rows. Export as CSV or XLSX
          for the complete set — those formats have no limit.
        </p>
      )}
    </>,
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${input.title}</title>
<style>${fontFaceCss('poppins')}${CSS}</style>
</head>
<body>${body}</body>
</html>`;
};

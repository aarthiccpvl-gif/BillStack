import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet, FileText, Search } from 'lucide-react';
import {
  PERMISSIONS,
  QUOTATION_STATUSES,
  STATUS_LABELS,
  formatMoney,
  STORED_INVOICE_STATUSES,
  type ReportColumn,
  type ReportKind,
} from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthProvider';
import { useFinancialYear } from '@/app/FinancialYearProvider';
import { ApiError } from '@/services/api-client';
import { reportKeys, reportsApi, type ReportParams } from '@/services/reports-api';
import { useCustomerOptions } from '@/hooks/useLookups';
import { useCurrencies, useCurrencyFormatter } from '@/hooks/useMasters';
import { formatDate, saveBlob } from '@/utils/format';

/**
 * Reports.
 *
 * The screen shows the first few hundred rows and says so; every export carries
 * the whole filtered set, because both read the same definition on the server.
 * That is why the export buttons sit next to the filters rather than under a
 * separate "export" screen — they are the same query, in a different container.
 */

const TABS: { kind: ReportKind; label: string; blurb: string }[] = [
  {
    kind: 'invoices',
    label: 'Invoices',
    blurb: 'What was billed, what came in, what is still owed.',
  },
  { kind: 'quotations', label: 'Quotations', blurb: 'Everything quoted, and what became of it.' },
  { kind: 'customers', label: 'Customers', blurb: 'One line per customer, in their own currency.' },
  { kind: 'summary', label: 'Monthly summary', blurb: 'Month by month, per currency.' },
];

export const ReportsPage = () => {
  const toast = useToast();
  const { hasPermission } = useAuth();
  const { financialYearId, label: yearLabel, isLoading: yearsLoading } = useFinancialYear();
  const { data: customers } = useCustomerOptions();
  const { data: currencies } = useCurrencies(true);

  const canExport = hasPermission(PERMISSIONS.REPORT_EXPORT);
  const currencyFormat = useCurrencyFormatter();

  /**
   * The API sends money and dates raw so every export can decide for itself; the
   * screen formats both for reading — money grouped by the row's own currency
   * (₹ and $ do not group the same way), dates as "22 Aug 2026" rather than as
   * an ISO string that wraps across two lines in a narrow column.
   */
  /** A date must not wrap: "Aug 22, 2026" over three lines is unreadable. */
  const cellClass = (column: ReportColumn): string =>
    [
      column.numeric ? 'text-numeric' : '',
      column.date ? 'text-nowrap' : '',
      column.secondary ? 'd-none d-xl-table-cell' : '',
    ]
      .filter(Boolean)
      .join(' ');

  const show = (value: string | undefined, column: ReportColumn, currencyCode?: string): string => {
    if (!value) return value ?? '';
    if (column.date) return formatDate(value, '');
    if (!column.numeric) return value;
    if (!/^-?\d+(\.\d+)?$/.test(value)) return value;
    return formatMoney(value, currencyFormat({ currencyCode: currencyCode ?? 'INR' }), {
      omitSymbol: true,
    });
  };

  const [kind, setKind] = useState<ReportKind>('invoices');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const params: ReportParams = {
    ...(financialYearId ? { financialYearId } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(customerId ? { customerId: Number(customerId) } : {}),
    ...(currencyCode ? { currencyCode } : {}),
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
    ...(kind === 'invoices' && outstandingOnly ? { outstandingOnly: 'true' } : {}),
  };

  const query = useQuery({
    queryKey: reportKeys.report(kind, params),
    queryFn: () => reportsApi.run(kind, params),
    enabled: !yearsLoading,
  });

  const report = query.data;

  const download = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setExporting(format);
    try {
      const { blob, fileName } = await reportsApi.export(kind, format, params);
      saveBlob(blob, fileName);
      toast.success(`${fileName} downloaded`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not build the export.');
    } finally {
      setExporting(null);
    }
  };

  const statuses =
    kind === 'invoices' ? STORED_INVOICE_STATUSES : kind === 'quotations' ? QUOTATION_STATUSES : [];

  const showFilter = {
    status: statuses.length > 0,
    customer: kind !== 'summary',
    outstanding: kind === 'invoices',
    search: kind !== 'summary',
  };

  const reset = (next: ReportKind) => {
    setKind(next);
    setStatus('');
    setOutstandingOnly(false);
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description={`Filter the book, read it here, take it away in whichever format the next person needs. · ${yearLabel}`}
        breadcrumbs={[{ label: 'Reports' }]}
        actions={
          canExport ? (
            <>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={exporting !== null}
                onClick={() => void download('csv')}
              >
                <FileText size={14} className="me-1" aria-hidden />
                {exporting === 'csv' ? 'Building…' : 'CSV'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={exporting !== null}
                onClick={() => void download('xlsx')}
              >
                <FileSpreadsheet size={14} className="me-1" aria-hidden />
                {exporting === 'xlsx' ? 'Building…' : 'Excel'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={exporting !== null}
                onClick={() => void download('pdf')}
              >
                <FileDown size={14} className="me-1" aria-hidden />
                {exporting === 'pdf' ? 'Building…' : 'PDF'}
              </button>
            </>
          ) : undefined
        }
      />

      <ul className="nav nav-tabs mb-3">
        {TABS.map((tab) => (
          <li className="nav-item" key={tab.kind}>
            <button
              type="button"
              className={`nav-link${kind === tab.kind ? ' active' : ''}`}
              aria-current={kind === tab.kind ? 'page' : undefined}
              onClick={() => reset(tab.kind)}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="card">
        <div className="card-header bg-white">
          <div className="row g-2 align-items-end">
            <div className="col-12 col-lg-3">
              <span className="form-label small text-secondary mb-1 d-block">Date range</span>
              <div className="input-group input-group-sm">
                <input
                  type="date"
                  className="form-control"
                  aria-label="From date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
                <span className="input-group-text">to</span>
                <input
                  type="date"
                  className="form-control"
                  aria-label="To date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </div>
            </div>

            {showFilter.customer && (
              <div className="col-6 col-lg-2">
                <label className="form-label small text-secondary mb-1" htmlFor="report-customer">
                  Customer
                </label>
                <select
                  id="report-customer"
                  className="form-select form-select-sm"
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  <option value="">All</option>
                  {customers?.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="col-6 col-lg-1">
              <label className="form-label small text-secondary mb-1" htmlFor="report-currency">
                Currency
              </label>
              <select
                id="report-currency"
                className="form-select form-select-sm"
                value={currencyCode}
                onChange={(event) => setCurrencyCode(event.target.value)}
              >
                <option value="">All</option>
                {currencies?.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code}
                  </option>
                ))}
              </select>
            </div>

            {showFilter.status && (
              <div className="col-6 col-lg-2">
                <label className="form-label small text-secondary mb-1" htmlFor="report-status">
                  Status
                </label>
                <select
                  id="report-status"
                  className="form-select form-select-sm"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">All</option>
                  {statuses.map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABELS[value]}
                    </option>
                  ))}
                  {kind === 'invoices' && <option value="OVERDUE">Overdue</option>}
                </select>
              </div>
            )}

            {showFilter.search && (
              <div className="col-12 col-lg-3">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setSearch(searchInput.trim());
                  }}
                >
                  <label className="form-label small text-secondary mb-1" htmlFor="report-search">
                    Search
                  </label>
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-white border-end-0">
                      <Search size={14} aria-hidden />
                    </span>
                    <input
                      id="report-search"
                      className="form-control border-start-0"
                      placeholder="Number, reference or customer"
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                    />
                    <button type="submit" className="btn btn-outline-secondary">
                      Apply
                    </button>
                  </div>
                </form>
              </div>
            )}

            {showFilter.outstanding && (
              <div className="col-6 col-lg-2">
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="outstanding-only"
                    checked={outstandingOnly}
                    onChange={(event) => setOutstandingOnly(event.target.checked)}
                  />
                  <label className="form-check-label small" htmlFor="outstanding-only">
                    Unpaid only
                  </label>
                </div>
              </div>
            )}
          </div>

          <p className="small text-secondary mb-0 mt-2">
            {TABS.find((tab) => tab.kind === kind)?.blurb}
            {report && ` · ${report.meta.rowCount} row${report.meta.rowCount === 1 ? '' : 's'}`}
            {report?.meta.truncated &&
              ` · showing the first ${report.rows.length}; every export carries all of them`}
          </p>
        </div>

        <div className="table-scroll">
          <table className="table table-sm table-hover align-middle mb-0">
            <thead>
              <tr>
                {(report?.columns ?? []).map((column) => (
                  <th key={column.key} scope="col" className={cellClass(column)}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.isLoading && <TableSkeleton columns={report?.columns.length ?? 6} />}

              {!query.isLoading &&
                (report?.rows ?? []).map((row, index) => (
                  <tr key={index}>
                    {(report?.columns ?? []).map((column) => (
                      <td key={column.key} className={cellClass(column)}>
                        {show(row[column.key], column, row.currencyCode)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>

            {(report?.totals.length ?? 0) > 0 && (
              <tfoot>
                {(report?.totals ?? []).map((total) => (
                  <tr key={total.currencyCode} className="fw-semibold border-top">
                    {(report?.columns ?? []).map((column, index) => (
                      <td key={column.key} className={cellClass(column)}>
                        {index === 0
                          ? `Total · ${total.currencyCode} · ${total.count}`
                          : show(total.values[column.key], column, total.currencyCode)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
        </div>

        {query.isError && (
          <ErrorState
            message={query.error instanceof ApiError ? query.error.message : 'Unexpected error.'}
            onRetry={() => void query.refetch()}
          />
        )}

        {!query.isLoading && !query.isError && (report?.rows.length ?? 0) === 0 && (
          <EmptyState
            title="Nothing matches these filters"
            description="Widen the dates, or clear a filter."
          />
        )}
      </div>
    </>
  );
};

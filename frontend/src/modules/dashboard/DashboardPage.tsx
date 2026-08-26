import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Banknote, FileText, ReceiptText } from 'lucide-react';
import {
  STATUS_LABELS,
  formatMoney,
  formatPercent,
  type CurrencyFormat,
  type DashboardSummary,
  type RecentDocument,
} from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/states';
import { ApiError } from '@/services/api-client';
import { dashboardApi, dashboardKeys } from '@/services/dashboard-api';
import { useCurrencies, useCurrencyFormatter } from '@/hooks/useMasters';
import { formatDate } from '@/utils/format';
import { MonthlyChart } from './MonthlyChart';

/**
 * The dashboard.
 *
 * Every headline figure is a roll-up into the base currency using the rate each
 * document recorded when it was raised. That is a reporting convenience, not a
 * fact about money, so when more than one currency is in play the page says so
 * and shows the per-currency breakdown underneath — where the figures are exact.
 */

const Kpi = ({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  to,
  feature = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'danger' | 'success';
  icon: typeof FileText;
  to?: string;
  /** The one headline figure on the screen, set on the dark card. */
  feature?: boolean;
}) => {
  const body = (
    <div className={`card h-100${feature ? ' card--feature' : ''}`}>
      <div className="card-body">
        <div className="d-flex align-items-center gap-2 label-caps mb-1">
          <Icon size={14} aria-hidden />
          {label}
        </div>
        <div className={`kpi-value${tone ? ` text-${tone}` : ''}`}>{value}</div>
        {hint && <div className={`small mt-1${feature ? '' : ' text-secondary'}`}>{hint}</div>}
      </div>
    </div>
  );

  return to ? (
    <Link to={to} className="text-decoration-none text-reset d-block h-100">
      {body}
    </Link>
  ) : (
    body
  );
};

const Funnel = ({
  funnel,
}: {
  funnel: { raised: number; sent: number; accepted: number; converted: number };
}) => {
  const stages = [
    { label: 'Raised', value: funnel.raised },
    { label: 'Sent', value: funnel.sent },
    { label: 'Accepted', value: funnel.accepted },
    { label: 'Invoiced', value: funnel.converted },
  ];

  const widest = Math.max(funnel.raised, 1);

  return (
    <ul className="list-unstyled mb-0">
      {stages.map((stage, index) => (
        <li key={stage.label} className="mb-2">
          <div className="d-flex justify-content-between small">
            <span>{stage.label}</span>
            <span className="text-numeric">
              {stage.value}
              {index > 0 && stages[index - 1]?.value ? (
                <span className="text-secondary ms-2">
                  {formatPercent(
                    ((stage.value / (stages[index - 1]?.value || 1)) * 100).toFixed(1),
                    0,
                  )}
                </span>
              ) : null}
            </span>
          </div>
          <div className="progress" style={{ height: '0.5rem' }}>
            <div
              className="progress-bar"
              style={{ width: `${(stage.value / widest) * 100}%` }}
              role="presentation"
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

const RecentRow = ({
  document,
  format,
}: {
  document: RecentDocument;
  format: (row: {
    currencyCode: string;
    currencySymbol: string;
    currencyDecimalPlaces: number;
  }) => CurrencyFormat;
}) => {
  const currency = format(document);

  const path = document.type === 'QUOTATION' ? '/quotations' : '/invoices';

  return (
    <tr>
      <td>
        <Link to={`${path}/${document.id}`} className="text-mono text-decoration-none">
          {document.number}
        </Link>
      </td>
      <td>{document.customerName}</td>
      <td className="d-none d-md-table-cell">{formatDate(document.documentDate)}</td>
      <td>
        <StatusBadge status={document.status as never} overdue={document.isOverdue ?? false} />
      </td>
      <td className="text-numeric">{formatMoney(document.grandTotal, currency)}</td>
    </tr>
  );
};

export const DashboardPage = () => {
  const [range, setRange] = useState<'FY' | '12M'>('FY');
  const { data: currencies } = useCurrencies(true);
  const formatCurrency = useCurrencyFormatter();

  const summaryQuery = useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: () => dashboardApi.summary(),
  });

  const chartsQuery = useQuery({
    queryKey: dashboardKeys.charts(range),
    queryFn: () => dashboardApi.charts(range),
  });

  const recentQuery = useQuery({
    queryKey: dashboardKeys.recent(8),
    queryFn: () => dashboardApi.recent(8),
  });

  const summary: DashboardSummary | undefined = summaryQuery.data;

  const baseCurrency: CurrencyFormat = {
    code: summary?.baseCurrencyCode ?? 'INR',
    symbol: summary?.baseCurrencySymbol ?? '₹',
    decimalPlaces: summary?.baseCurrencyDecimalPlaces ?? 2,
    symbolPosition:
      currencies?.find((entry) => entry.code === summary?.baseCurrencyCode)?.symbolPosition ??
      'PREFIX',
    separatorStyle:
      currencies?.find((entry) => entry.code === summary?.baseCurrencyCode)?.separatorStyle ??
      'INDIAN',
  };

  if (summaryQuery.isError) {
    return (
      <ErrorState
        message={
          summaryQuery.error instanceof ApiError ? summaryQuery.error.message : 'Unexpected error.'
        }
        onRetry={() => void summaryQuery.refetch()}
      />
    );
  }

  const money = (amount: string | undefined) => formatMoney(amount ?? '0', baseCurrency);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          summary
            ? `Financial year ${summary.financialYear.code} · ${formatDate(summary.financialYear.startDate)} to ${formatDate(summary.financialYear.endDate)}`
            : undefined
        }
      />

      {summary?.mixedCurrencies && (
        <div className="alert alert-light border py-2 small" role="note">
          More than one currency is in play. The headline figures are converted to{' '}
          {summary.baseCurrencyCode} at the rate each document recorded when it was raised; the
          exact amounts are in the per-currency table below.
        </div>
      )}

      <div className="row g-3 mb-3">
        <div className="col-6 col-xl-3">
          <Kpi
            label="Outstanding"
            value={money(summary?.invoices.outstandingBase)}
            hint={`${summary?.invoices.total ?? 0} invoice${summary?.invoices.total === 1 ? '' : 's'} this year`}
            icon={Banknote}
            to="/invoices"
            feature
          />
        </div>
        <div className="col-6 col-xl-3">
          <Kpi
            label="Overdue"
            value={money(summary?.invoices.overdueBase)}
            hint={
              summary?.invoices.overdueCount
                ? `${summary.invoices.overdueCount} invoice${summary.invoices.overdueCount === 1 ? '' : 's'} past due`
                : 'Nothing is late'
            }
            tone={summary?.invoices.overdueCount ? 'danger' : undefined}
            icon={AlertTriangle}
            to="/invoices"
          />
        </div>
        <div className="col-6 col-xl-3">
          <Kpi
            label="Billed"
            value={money(summary?.invoices.billedBase)}
            hint={`${money(summary?.invoices.receivedBase)} received`}
            icon={ReceiptText}
            to="/invoices"
          />
        </div>
        <div className="col-6 col-xl-3">
          <Kpi
            label="Quotations in play"
            value={money(summary?.quotations.openValueBase)}
            hint={`${summary?.quotations.openCount ?? 0} open · ${formatPercent(summary?.quotations.winRatePercent ?? '0', 0)} won`}
            icon={FileText}
            to="/quotations"
          />
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-12 col-xl-8">
          <div className="card h-100">
            <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <span className="label-caps">Month by month</span>
              <div className="btn-group btn-group-sm">
                <button
                  type="button"
                  className={`btn btn-outline-secondary${range === 'FY' ? ' active' : ''}`}
                  onClick={() => setRange('FY')}
                >
                  This financial year
                </button>
                <button
                  type="button"
                  className={`btn btn-outline-secondary${range === '12M' ? ' active' : ''}`}
                  onClick={() => setRange('12M')}
                >
                  Last 12 months
                </button>
              </div>
            </div>
            <div className="card-body">
              {chartsQuery.data ? (
                <MonthlyChart months={chartsQuery.data.months} currency={baseCurrency} />
              ) : (
                <div className="placeholder-glow">
                  <span className="placeholder col-12" style={{ height: '10rem' }} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <div className="card h-100">
            <div className="card-header bg-white">
              <span className="label-caps">Quotation funnel</span>
            </div>
            <div className="card-body">
              {chartsQuery.data ? (
                <Funnel funnel={chartsQuery.data.funnel} />
              ) : (
                <div className="placeholder-glow">
                  <span className="placeholder col-12" style={{ height: '6rem' }} />
                </div>
              )}
              <p className="small text-secondary mb-0 mt-2">
                How far a quotation gets. Cancelled ones are left out — they never reached anyone.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-xl-7">
          <div className="card h-100">
            <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <span className="label-caps">Recently touched</span>
              <Link to="/invoices" className="small text-decoration-none">
                All invoices <ArrowRight size={12} aria-hidden />
              </Link>
            </div>
            <div className="table-scroll">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th scope="col">Number</th>
                    <th scope="col">Customer</th>
                    <th scope="col" className="d-none d-md-table-cell">
                      Date
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col" className="text-numeric">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(recentQuery.data ?? []).map((document) => (
                    <RecentRow
                      key={`${document.type}-${document.id}`}
                      document={document}
                      format={formatCurrency}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {recentQuery.data?.length === 0 && (
              <div className="card-body text-center text-secondary small">
                Nothing yet. Raise a quotation and it will appear here.
              </div>
            )}
          </div>
        </div>

        <div className="col-12 col-xl-5">
          <div className="card h-100">
            <div className="card-header bg-white">
              <span className="label-caps">By currency</span>
            </div>
            <div className="table-scroll">
              <table className="table table-sm mb-0">
                <thead>
                  <tr>
                    <th scope="col">Currency</th>
                    <th scope="col" className="text-numeric">
                      Billed
                    </th>
                    <th scope="col" className="text-numeric">
                      Received
                    </th>
                    <th scope="col" className="text-numeric">
                      Outstanding
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(summary?.byCurrency ?? []).map((row) => {
                    const rowCurrency = formatCurrency(row);

                    return (
                      <tr key={row.currencyCode}>
                        <th scope="row" className="fw-normal">
                          {row.currencyCode}
                          <span className="small text-secondary ms-2">
                            {row.invoiceCount} invoice{row.invoiceCount === 1 ? '' : 's'}
                          </span>
                        </th>
                        <td className="text-numeric">
                          {formatMoney(row.invoiceBilled, rowCurrency)}
                        </td>
                        <td className="text-numeric">
                          {formatMoney(row.invoiceReceived, rowCurrency)}
                        </td>
                        <td className="text-numeric">
                          {formatMoney(row.invoiceOutstanding, rowCurrency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {summary?.byCurrency.length === 0 && (
              <div className="card-body text-center text-secondary small">
                No invoices have been issued this financial year.
              </div>
            )}
            <div className="card-footer bg-white small text-secondary">
              Exact figures, never added across currencies.
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mt-0">
        <div className="col-12">
          <div className="card">
            <div className="card-header bg-white">
              <span className="label-caps">Where things stand</span>
            </div>
            <div className="card-body d-flex flex-wrap gap-3">
              {Object.entries(summary?.quotations.byStatus ?? {})
                .filter(([, count]) => count > 0)
                .map(([status, count]) => (
                  <Link
                    key={`q-${status}`}
                    to={`/quotations?status=${status}`}
                    className="text-decoration-none text-reset"
                  >
                    <span className="badge text-bg-light border">
                      {count} quotation{count === 1 ? '' : 's'} ·{' '}
                      {STATUS_LABELS[status as keyof typeof STATUS_LABELS]}
                    </span>
                  </Link>
                ))}

              {Object.entries(summary?.invoices.byStatus ?? {})
                .filter(([, count]) => count > 0)
                .map(([status, count]) => (
                  <Link
                    key={`i-${status}`}
                    to={`/invoices?status=${status}`}
                    className="text-decoration-none text-reset"
                  >
                    <span className="badge text-bg-light border">
                      {count} invoice{count === 1 ? '' : 's'} ·{' '}
                      {STATUS_LABELS[status as keyof typeof STATUS_LABELS]}
                    </span>
                  </Link>
                ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

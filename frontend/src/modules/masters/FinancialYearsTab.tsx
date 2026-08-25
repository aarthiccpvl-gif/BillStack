import type { FinancialYearRecord } from '@app/shared';
import { DataTable, type Column } from '@/components/DataTable';
import { ApiError } from '@/services/api-client';
import { useFinancialYears } from '@/hooks/useMasters';

const formatDate = (value: string): string =>
  new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * Financial years.
 *
 * A year is created automatically the first time a document is dated into it, so
 * 1 April never fails because nobody remembered to add the new year.
 */
export const FinancialYearsTab = () => {
  const query = useFinancialYears();

  const columns: Column<FinancialYearRecord>[] = [
    {
      key: 'code',
      header: 'Financial year',
      render: (year) => (
        <>
          <span className="fw-medium text-mono">{year.code}</span>
          {year.isCurrent && <span className="badge text-bg-primary ms-2">Current</span>}
        </>
      ),
    },
    { key: 'startDate', header: 'From', render: (year) => formatDate(year.startDate) },
    { key: 'endDate', header: 'To', render: (year) => formatDate(year.endDate) },
    {
      key: 'quotations',
      header: 'Quotations',
      numeric: true,
      render: (year) => year.documentCounts?.quotations ?? 0,
    },
    {
      key: 'invoices',
      header: 'Invoices',
      numeric: true,
      render: (year) => year.documentCounts?.invoices ?? 0,
    },
    {
      key: 'status',
      header: 'Status',
      render: (year) => (
        <span
          className={`badge ${year.status === 'OPEN' ? 'text-bg-success' : 'text-bg-secondary'}`}
        >
          {year.status === 'OPEN' ? 'Open' : 'Closed'}
        </span>
      ),
    },
  ];

  return (
    <div className="card">
      <div className="card-header bg-white">
        <span className="label-caps">Financial years</span>
        <span className="small text-secondary ms-2">
          Created automatically from the first document dated into them
        </span>
      </div>

      <DataTable
        columns={columns}
        rows={query.data ?? []}
        rowKey={(year) => year.id}
        isLoading={query.isLoading}
        error={
          query.isError
            ? query.error instanceof ApiError
              ? query.error.message
              : 'Unexpected error.'
            : null
        }
        onRetry={() => void query.refetch()}
        emptyTitle="No financial years"
      />
    </div>
  );
};

import { formatPercent, type TaxGroupRecord, type TaxRateRecord } from '@app/shared';
import { DataTable, type Column } from '@/components/DataTable';
import { ApiError } from '@/services/api-client';
import { useTaxGroups, useTaxRates } from '@/hooks/useMasters';

const SCOPE_LABELS: Record<string, string> = {
  INTRA_STATE: 'Same state',
  INTER_STATE: 'Other state',
  UNION_TERRITORY: 'Union territory',
  NONE: 'No tax',
};

/**
 * Tax rates and groups.
 *
 * A group is what a user picks on a document line; the engine expands it into its
 * component rates, which is how one choice produces CGST 9% + SGST 9%.
 */
export const TaxesTab = () => {
  const groupsQuery = useTaxGroups(true);
  const ratesQuery = useTaxRates(true);

  const groupColumns: Column<TaxGroupRecord>[] = [
    {
      key: 'name',
      header: 'Tax',
      render: (group) => <span className="fw-medium">{group.name}</span>,
    },
    {
      key: 'scope',
      header: 'Applies when',
      render: (group) => SCOPE_LABELS[group.scope] ?? group.scope,
    },
    {
      key: 'components',
      header: 'Expands into',
      render: (group) =>
        group.rates.length ? (
          <span className="small">
            {group.rates
              .map((rate) => `${rate.taxTypeKey} ${formatPercent(rate.rate)}`)
              .join('  +  ')}
          </span>
        ) : (
          <span className="text-secondary">—</span>
        ),
    },
    {
      key: 'totalRate',
      header: 'Total',
      numeric: true,
      render: (group) => formatPercent(group.totalRate),
    },
    {
      key: 'status',
      header: 'Status',
      render: (group) => (
        <span className={`badge ${group.isActive ? 'text-bg-success' : 'text-bg-secondary'}`}>
          {group.isActive ? 'Active' : 'Disabled'}
        </span>
      ),
    },
  ];

  const rateColumns: Column<TaxRateRecord>[] = [
    {
      key: 'name',
      header: 'Rate',
      render: (rate) => <span className="fw-medium">{rate.name}</span>,
    },
    {
      key: 'taxTypeKey',
      header: 'Type',
      render: (rate) => <span className="text-mono small">{rate.taxTypeKey}</span>,
    },
    {
      key: 'rate',
      header: 'Percentage',
      numeric: true,
      render: (rate) => formatPercent(rate.rate),
    },
    {
      key: 'effective',
      header: 'Effective',
      render: (rate) =>
        rate.effectiveFrom || rate.effectiveTo ? (
          <span className="small">
            {rate.effectiveFrom ?? '—'} → {rate.effectiveTo ?? 'ongoing'}
          </span>
        ) : (
          <span className="text-secondary">Always</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (rate) => (
        <span className={`badge ${rate.isActive ? 'text-bg-success' : 'text-bg-secondary'}`}>
          {rate.isActive ? 'Active' : 'Disabled'}
        </span>
      ),
    },
  ];

  const errorOf = (query: { isError: boolean; error: unknown }) =>
    query.isError
      ? query.error instanceof ApiError
        ? query.error.message
        : 'Unexpected error.'
      : null;

  return (
    <>
      <div className="card mb-3">
        <div className="card-header bg-white">
          <span className="label-caps">Tax groups</span>
          <span className="small text-secondary ms-2">What a user selects on a document line</span>
        </div>
        <DataTable
          columns={groupColumns}
          rows={groupsQuery.data ?? []}
          rowKey={(group) => group.id}
          isLoading={groupsQuery.isLoading}
          error={errorOf(groupsQuery)}
          onRetry={() => void groupsQuery.refetch()}
          emptyTitle="No tax groups"
        />
      </div>

      <div className="card">
        <div className="card-header bg-white">
          <span className="label-caps">Component rates</span>
          <span className="small text-secondary ms-2">
            A rate already used on a document cannot have its percentage changed
          </span>
        </div>
        <DataTable
          columns={rateColumns}
          rows={ratesQuery.data ?? []}
          rowKey={(rate) => rate.id}
          isLoading={ratesQuery.isLoading}
          error={errorOf(ratesQuery)}
          onRetry={() => void ratesQuery.refetch()}
          emptyTitle="No tax rates"
        />
      </div>
    </>
  );
};

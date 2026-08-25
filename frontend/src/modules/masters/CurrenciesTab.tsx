import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatMoney, type CurrencyRecord } from '@app/shared';
import { DataTable, type Column } from '@/components/DataTable';
import { useToast } from '@/components/Toast';
import { ApiError } from '@/services/api-client';
import { masterKeys, mastersApi } from '@/services/masters-api';
import { useCurrencies } from '@/hooks/useMasters';

/**
 * Currencies.
 *
 * The sample column is rendered with the same `formatMoney` the documents and PDFs
 * use, so what is shown here is exactly how an amount will print.
 */
export const CurrenciesTab = ({ canManage }: { canManage: boolean }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useCurrencies(true);

  const toggle = useMutation({
    mutationFn: ({ code, isActive }: { code: string; isActive: boolean }) =>
      mastersApi.updateCurrency(code, { isActive }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: masterKeys.all });
      toast.success(`${variables.code} ${variables.isActive ? 'enabled' : 'disabled'}`);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not update the currency.'),
  });

  const columns: Column<CurrencyRecord>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (currency) => <span className="text-mono fw-medium">{currency.code}</span>,
    },
    { key: 'name', header: 'Name', render: (currency) => currency.name },
    { key: 'symbol', header: 'Symbol', render: (currency) => currency.symbol },
    {
      key: 'decimalPlaces',
      header: 'Decimals',
      numeric: true,
      render: (currency) => currency.decimalPlaces,
    },
    {
      key: 'grouping',
      header: 'Grouping',
      render: (currency) => (currency.separatorStyle === 'INDIAN' ? 'Indian (lakh)' : 'Western'),
    },
    {
      key: 'sample',
      header: 'Sample',
      numeric: true,
      render: (currency) => formatMoney('125000', currency),
    },
    {
      key: 'status',
      header: 'Status',
      render: (currency) => (
        <>
          <span className={`badge ${currency.isActive ? 'text-bg-success' : 'text-bg-secondary'}`}>
            {currency.isActive ? 'Active' : 'Disabled'}
          </span>
          {currency.inUse && <span className="badge text-bg-light ms-2">In use</span>}
        </>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: 'Actions',
            render: (currency: CurrencyRecord) => (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate({ code: currency.code, isActive: !currency.isActive })}
              >
                {currency.isActive ? 'Disable' : 'Enable'}
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="card">
      <div className="card-header bg-white">
        <span className="label-caps">Currencies</span>
        <span className="small text-secondary ms-2">
          A currency in use cannot have its decimal precision changed — stored totals were rounded
          to it.
        </span>
      </div>

      <DataTable
        columns={columns}
        rows={query.data ?? []}
        rowKey={(currency) => currency.code}
        isLoading={query.isLoading}
        error={
          query.isError
            ? query.error instanceof ApiError
              ? query.error.message
              : 'Unexpected error.'
            : null
        }
        onRetry={() => void query.refetch()}
        emptyTitle="No currencies"
      />
    </div>
  );
};

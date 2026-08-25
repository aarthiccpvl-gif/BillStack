import type { ItemCategoryRecord, UnitRecord } from '@app/shared';
import { DataTable, type Column } from '@/components/DataTable';
import { ApiError } from '@/services/api-client';
import { useItemCategories, useUnits } from '@/hooks/useMasters';

/** Units of measure and item categories — small lists that keep item data tidy. */
export const UnitsTab = () => {
  const unitsQuery = useUnits(true);
  const categoriesQuery = useItemCategories();

  const unitColumns: Column<UnitRecord>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (unit) => <span className="text-mono fw-medium">{unit.code}</span>,
    },
    { key: 'name', header: 'Name', render: (unit) => unit.name },
    {
      key: 'status',
      header: 'Status',
      render: (unit) => (
        <span className={`badge ${unit.isActive ? 'text-bg-success' : 'text-bg-secondary'}`}>
          {unit.isActive ? 'Active' : 'Disabled'}
        </span>
      ),
    },
  ];

  const categoryColumns: Column<ItemCategoryRecord>[] = [
    {
      key: 'name',
      header: 'Category',
      render: (category) => <span className="fw-medium">{category.name}</span>,
    },
    {
      key: 'itemCount',
      header: 'Items',
      numeric: true,
      render: (category) => category.itemCount ?? 0,
    },
  ];

  const errorOf = (query: { isError: boolean; error: unknown }) =>
    query.isError
      ? query.error instanceof ApiError
        ? query.error.message
        : 'Unexpected error.'
      : null;

  return (
    <div className="row g-3">
      <div className="col-12 col-lg-6">
        <div className="card h-100">
          <div className="card-header bg-white">
            <span className="label-caps">Units of measure</span>
          </div>
          <DataTable
            columns={unitColumns}
            rows={unitsQuery.data ?? []}
            rowKey={(unit) => unit.id}
            isLoading={unitsQuery.isLoading}
            error={errorOf(unitsQuery)}
            onRetry={() => void unitsQuery.refetch()}
            emptyTitle="No units"
          />
        </div>
      </div>

      <div className="col-12 col-lg-6">
        <div className="card h-100">
          <div className="card-header bg-white">
            <span className="label-caps">Item categories</span>
          </div>
          <DataTable
            columns={categoryColumns}
            rows={categoriesQuery.data ?? []}
            rowKey={(category) => category.id}
            isLoading={categoriesQuery.isLoading}
            error={errorOf(categoriesQuery)}
            onRetry={() => void categoriesQuery.refetch()}
            emptyTitle="No categories"
          />
        </div>
      </div>
    </div>
  );
};

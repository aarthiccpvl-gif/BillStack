import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil, Plus, Search } from 'lucide-react';
import { ITEM_TYPE_LABELS, PERMISSIONS, formatMoney, type ItemRecord } from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type Column } from '@/components/DataTable';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { itemKeys, itemsApi } from '@/services/business-api';
import { useCurrencies } from '@/hooks/useMasters';
import { ItemFormModal } from './ItemFormModal';

export const ItemsPage = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const { data: currencies } = useCurrencies(true);

  const canCreate = hasPermission(PERMISSIONS.ITEM_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.ITEM_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.ITEM_ARCHIVE);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState('name');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ItemRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const params = {
    page,
    pageSize: 25,
    sort,
    search: search || undefined,
    ...(showArchived ? { status: 'ARCHIVED' } : {}),
  };

  const query = useQuery({ queryKey: itemKeys.list(params), queryFn: () => itemsApi.list(params) });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archive }: { id: number; archive: boolean }) =>
      itemsApi.archive(id, archive),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: itemKeys.all });
      toast.success(updated.status === 'ARCHIVED' ? 'Item archived' : 'Item restored');
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not change the status.'),
  });

  const formatFor = (code: string) =>
    currencies?.find((currency) => currency.code === code) ?? {
      code,
      symbol: code,
      decimalPlaces: 2,
      symbolPosition: 'PREFIX' as const,
      separatorStyle: 'WESTERN' as const,
    };

  const columns: Column<ItemRecord>[] = [
    {
      key: 'itemCode',
      header: 'Code',
      sortable: true,
      width: '9rem',
      render: (item) => <span className="text-mono small">{item.itemCode}</span>,
    },
    {
      key: 'name',
      header: 'Item',
      sortable: true,
      render: (item) => (
        <>
          <span className="fw-medium">{item.name}</span>
          {item.description && (
            <div className="small text-secondary text-truncate" style={{ maxWidth: '32rem' }}>
              {item.description}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (item) => <span className="badge text-bg-light">{ITEM_TYPE_LABELS[item.type]}</span>,
    },
    {
      key: 'hsnSacCode',
      header: 'HSN/SAC',
      render: (item) =>
        item.hsnSacCode ? (
          <span className="text-mono small">{item.hsnSacCode}</span>
        ) : (
          <span className="text-secondary">—</span>
        ),
    },
    {
      key: 'defaultRate',
      header: 'Rate',
      numeric: true,
      sortable: true,
      render: (item) => formatMoney(item.defaultRate, formatFor(item.currencyCode)),
    },
    { key: 'unitCode', header: 'Unit', render: (item) => item.unitCode ?? '—' },
    {
      key: 'tax',
      header: 'Default tax',
      render: (item) => item.defaultTaxGroupName ?? <span className="text-secondary">Not set</span>,
    },
    ...(canUpdate || canArchive
      ? [
          {
            key: 'actions',
            header: 'Actions',
            render: (item: ItemRecord) => (
              <div className="btn-group btn-group-sm">
                {canUpdate && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    title="Edit"
                    onClick={() => {
                      setEditing(item);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil size={14} aria-hidden />
                    <span className="visually-hidden">Edit {item.name}</span>
                  </button>
                )}
                {canArchive && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    title={item.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
                    disabled={archiveMutation.isPending}
                    onClick={() =>
                      archiveMutation.mutate({
                        id: item.id,
                        archive: item.status !== 'ARCHIVED',
                      })
                    }
                  >
                    {item.status === 'ARCHIVED' ? (
                      <ArchiveRestore size={14} aria-hidden />
                    ) : (
                      <Archive size={14} aria-hidden />
                    )}
                    <span className="visually-hidden">
                      {item.status === 'ARCHIVED' ? 'Restore' : 'Archive'} {item.name}
                    </span>
                  </button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Products & Services"
        description="Reusable lines for quotations and invoices. Editing a rate here never changes a document already saved."
        breadcrumbs={[{ label: 'Masters' }, { label: 'Products & Services' }]}
        actions={
          canCreate ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus size={15} className="me-1" aria-hidden />
              New item
            </button>
          ) : undefined
        }
      />

      <div className="card">
        <div className="card-header bg-white">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <form
              className="d-flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setSearch(searchInput.trim());
              }}
            >
              <div className="input-group input-group-sm" style={{ maxWidth: '24rem' }}>
                <span className="input-group-text bg-white border-end-0">
                  <Search size={14} aria-hidden />
                </span>
                <input
                  className="form-control border-start-0"
                  placeholder="Name, code, description or HSN"
                  aria-label="Search items"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-sm btn-outline-secondary">
                Search
              </button>
              {search && (
                <button
                  type="button"
                  className="btn btn-sm btn-link"
                  onClick={() => {
                    setSearchInput('');
                    setSearch('');
                    setPage(1);
                  }}
                >
                  Clear
                </button>
              )}
            </form>

            <div className="form-check form-switch ms-auto">
              <input
                className="form-check-input"
                type="checkbox"
                id="showArchivedItems"
                checked={showArchived}
                onChange={(event) => {
                  setShowArchived(event.target.checked);
                  setPage(1);
                }}
              />
              <label className="form-check-label small" htmlFor="showArchivedItems">
                Show archived
              </label>
            </div>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(item) => item.id}
          isLoading={query.isLoading}
          error={
            query.isError
              ? query.error instanceof ApiError
                ? query.error.message
                : 'Unexpected error.'
              : null
          }
          onRetry={() => void query.refetch()}
          meta={query.data?.meta}
          onPageChange={setPage}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          emptyTitle={search ? 'No items match that search' : 'No products or services yet'}
          emptyDescription={
            search
              ? 'Try a different name, code or HSN.'
              : 'Add the services you bill for so document lines can be picked rather than typed.'
          }
        />
      </div>

      <ItemFormModal open={formOpen} item={editing} onClose={() => setFormOpen(false)} />
    </>
  );
};

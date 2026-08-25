import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { PERMISSIONS, TAX_TREATMENT_LABELS, type CustomerRecord } from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type Column } from '@/components/DataTable';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { customerKeys, customersApi } from '@/services/business-api';
import { CustomerFormModal } from './CustomerFormModal';

export const CustomersPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.CUSTOMER_CREATE);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState('name');
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const params = {
    page,
    pageSize: 25,
    sort,
    search: search || undefined,
    ...(showArchived ? { status: 'ARCHIVED' } : {}),
  };

  const query = useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () => customersApi.list(params),
  });

  const columns: Column<CustomerRecord>[] = [
    {
      key: 'customerCode',
      header: 'Code',
      sortable: true,
      width: '9rem',
      render: (customer) => <span className="text-mono small">{customer.customerCode}</span>,
    },
    {
      key: 'name',
      header: 'Customer',
      sortable: true,
      render: (customer) => (
        <>
          <span className="fw-medium">{customer.name}</span>
          {customer.companyName && customer.companyName !== customer.name && (
            <div className="small text-secondary">{customer.companyName}</div>
          )}
        </>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (customer) => (
        <div className="small">
          {customer.email && <div>{customer.email}</div>}
          {customer.phone && <div className="text-secondary">{customer.phone}</div>}
          {!customer.email && !customer.phone && <span className="text-secondary">—</span>}
        </div>
      ),
    },
    {
      key: 'gstin',
      header: 'GSTIN',
      render: (customer) =>
        customer.gstin ? (
          <span className="text-mono small">{customer.gstin}</span>
        ) : (
          <span className="badge text-bg-light">{TAX_TREATMENT_LABELS[customer.taxTreatment]}</span>
        ),
    },
    {
      key: 'defaultCurrencyCode',
      header: 'Currency',
      render: (customer) => customer.defaultCurrencyCode,
    },
    {
      key: 'paymentTermsDays',
      header: 'Terms',
      numeric: true,
      render: (customer) => `${customer.paymentTermsDays} days`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (customer) => (
        <span
          className={`badge ${customer.status === 'ACTIVE' ? 'text-bg-success' : 'text-bg-secondary'}`}
        >
          {customer.status === 'ACTIVE' ? 'Active' : 'Archived'}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Who you bill. Each document copies these details at the moment it is saved."
        breadcrumbs={[{ label: 'Masters' }, { label: 'Customers' }]}
        actions={
          canCreate ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setFormOpen(true)}
            >
              <Plus size={15} className="me-1" aria-hidden />
              New customer
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
                  placeholder="Name, code, email, phone or GSTIN"
                  aria-label="Search customers"
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
                id="showArchived"
                checked={showArchived}
                onChange={(event) => {
                  setShowArchived(event.target.checked);
                  setPage(1);
                }}
              />
              <label className="form-check-label small" htmlFor="showArchived">
                Show archived
              </label>
            </div>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(customer) => customer.id}
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
          onRowClick={(customer) => navigate(`/customers/${customer.id}`)}
          emptyTitle={search ? 'No customers match that search' : 'No customers yet'}
          emptyDescription={
            search
              ? 'Try a different name, code or GSTIN.'
              : 'Add the first customer to start raising quotations.'
          }
        />
      </div>

      <CustomerFormModal open={formOpen} customer={null} onClose={() => setFormOpen(false)} />
    </>
  );
};

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import {
  PERMISSIONS,
  STATUS_LABELS,
  STORED_INVOICE_STATUSES,
  formatMoney,
  type InvoiceListRow,
} from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type Column } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { invoiceKeys, invoicesApi } from '@/services/invoices-api';
import { useCurrencies } from '@/hooks/useMasters';
import { useCustomerOptions } from '@/hooks/useLookups';
import { formatDate } from '@/utils/format';

/**
 * The invoice list.
 *
 * Two columns a quotation list does not need: what is still owed, and how late it
 * is. "Overdue" is offered as a filter even though no row stores it — the server
 * answers it the same way it derives the flag, from the due date and the money.
 */
export const InvoicesPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { data: currencies } = useCurrencies(true);
  const { data: customers } = useCustomerOptions();

  const canCreate = hasPermission(PERMISSIONS.INVOICE_CREATE);

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('-documentDate');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const params = {
    page,
    pageSize: 25,
    sort,
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
    ...(customerId ? { customerId: Number(customerId) } : {}),
    ...(currencyCode ? { currencyCode } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };

  const query = useQuery({
    queryKey: invoiceKeys.list(params),
    queryFn: () => invoicesApi.list(params),
  });

  const hasFilters = Boolean(search || status || customerId || currencyCode || dateFrom || dateTo);

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setCustomerId('');
    setCurrencyCode('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  /* Each row carries its own currency metadata, so the list can mix currencies. */
  const formatFor = (row: InvoiceListRow) => ({
    code: row.currencyCode,
    symbol: row.currencySymbol,
    decimalPlaces: row.currencyDecimalPlaces,
    symbolPosition:
      currencies?.find((currency) => currency.code === row.currencyCode)?.symbolPosition ??
      ('PREFIX' as const),
    separatorStyle:
      currencies?.find((currency) => currency.code === row.currencyCode)?.separatorStyle ??
      ('WESTERN' as const),
  });

  const columns: Column<InvoiceListRow>[] = [
    {
      key: 'number',
      header: 'Number',
      sortable: true,
      width: '12rem',
      render: (row) => (
        <Link
          to={`/invoices/${row.id}`}
          className="text-mono text-decoration-none"
          onClick={(event) => event.stopPropagation()}
        >
          {row.number}
        </Link>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (row) => (
        <>
          <span className="fw-medium">{row.customerName}</span>
          {row.quotationNumber && (
            <div className="small text-secondary">From {row.quotationNumber}</div>
          )}
        </>
      ),
    },
    {
      key: 'documentDate',
      header: 'Date',
      sortable: true,
      width: '8rem',
      render: (row) => formatDate(row.documentDate),
    },
    {
      key: 'dueDate',
      header: 'Due',
      sortable: true,
      width: '10rem',
      render: (row) => (
        <>
          {formatDate(row.dueDate)}
          {row.isOverdue && (
            <div className="small text-danger">
              {row.daysOverdue} day{row.daysOverdue === 1 ? '' : 's'} late
            </div>
          )}
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '11rem',
      render: (row) => <StatusBadge status={row.status} overdue={row.isOverdue} />,
    },
    {
      key: 'grandTotal',
      header: 'Total',
      numeric: true,
      sortable: true,
      width: '9rem',
      render: (row) => formatMoney(row.grandTotal, formatFor(row)),
    },
    {
      key: 'amountOutstanding',
      header: 'Outstanding',
      numeric: true,
      width: '9rem',
      render: (row) =>
        Number(row.amountOutstanding) === 0 ? (
          <span className="text-secondary">—</span>
        ) : (
          <span className={row.isOverdue ? 'text-danger' : undefined}>
            {formatMoney(row.amountOutstanding, formatFor(row))}
          </span>
        ),
    },
    {
      key: 'createdByName',
      header: 'Created by',
      width: '9rem',
      render: (row) => <span className="small text-secondary">{row.createdByName}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Invoices"
        description="What has been billed, what has been paid, and what is late."
        breadcrumbs={[{ label: 'Sales' }, { label: 'Invoices' }]}
        actions={
          canCreate ? (
            <Link to="/invoices/new" className="btn btn-sm btn-primary">
              <Plus size={15} className="me-1" aria-hidden />
              New invoice
            </Link>
          ) : undefined
        }
      />

      <div className="card">
        <div className="card-header bg-white">
          <div className="row g-2 align-items-end">
            <div className="col-12 col-lg-4">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setPage(1);
                  setSearch(searchInput.trim());
                }}
              >
                <label className="form-label small text-secondary mb-1" htmlFor="invoice-search">
                  Search
                </label>
                <div className="input-group input-group-sm">
                  <span className="input-group-text bg-white border-end-0">
                    <Search size={14} aria-hidden />
                  </span>
                  <input
                    id="invoice-search"
                    className="form-control border-start-0"
                    placeholder="Number, reference, subject or customer"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                  <button type="submit" className="btn btn-outline-secondary">
                    Search
                  </button>
                </div>
              </form>
            </div>

            <div className="col-6 col-lg-2">
              <label className="form-label small text-secondary mb-1" htmlFor="filter-status">
                Status
              </label>
              <select
                id="filter-status"
                className="form-select form-select-sm"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {STORED_INVOICE_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </option>
                ))}
                <option value="OVERDUE">Overdue</option>
              </select>
            </div>

            <div className="col-6 col-lg-2">
              <label className="form-label small text-secondary mb-1" htmlFor="filter-customer">
                Customer
              </label>
              <select
                id="filter-customer"
                className="form-select form-select-sm"
                value={customerId}
                onChange={(event) => {
                  setCustomerId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {customers?.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-6 col-lg-1">
              <label className="form-label small text-secondary mb-1" htmlFor="filter-currency">
                Currency
              </label>
              <select
                id="filter-currency"
                className="form-select form-select-sm"
                value={currencyCode}
                onChange={(event) => {
                  setCurrencyCode(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {currencies?.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-6 col-lg-3">
              <span className="form-label small text-secondary mb-1 d-block">Date range</span>
              <div className="input-group input-group-sm">
                <input
                  type="date"
                  className="form-control"
                  aria-label="From date"
                  value={dateFrom}
                  onChange={(event) => {
                    setDateFrom(event.target.value);
                    setPage(1);
                  }}
                />
                <span className="input-group-text">to</span>
                <input
                  type="date"
                  className="form-control"
                  aria-label="To date"
                  value={dateTo}
                  onChange={(event) => {
                    setDateTo(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          </div>

          {hasFilters && (
            <button type="button" className="btn btn-sm btn-link ps-0 mt-1" onClick={resetFilters}>
              Clear filters
            </button>
          )}
        </div>

        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(row) => row.id}
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
          onRowClick={(row) => navigate(`/invoices/${row.id}`)}
          emptyTitle={hasFilters ? 'No invoices match these filters' : 'No invoices yet'}
          emptyDescription={
            hasFilters
              ? 'Widen the date range or clear a filter.'
              : 'Raise one directly, or convert an accepted quotation.'
          }
          emptyAction={
            canCreate && !hasFilters ? (
              <Link to="/invoices/new" className="btn btn-sm btn-primary">
                New invoice
              </Link>
            ) : undefined
          }
        />
      </div>
    </>
  );
};

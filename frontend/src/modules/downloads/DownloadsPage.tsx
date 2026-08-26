import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, FileDown, Search } from 'lucide-react';
import {
  PERMISSIONS,
  QUOTATION_STATUSES,
  STATUS_LABELS,
  STORED_INVOICE_STATUSES,
  formatMoney,
} from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Pagination } from '@/components/Pagination';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { downloadsApi } from '@/services/dashboard-api';
import { quotationKeys, quotationsApi } from '@/services/quotations-api';
import { invoiceKeys, invoicesApi } from '@/services/invoices-api';
import { useCurrencyFormatter } from '@/hooks/useMasters';
import { useCustomerOptions } from '@/hooks/useLookups';
import { formatDate, saveBlob } from '@/utils/format';

/**
 * The downloads workspace.
 *
 * Filter, tick, take away. It exists because the alternative — opening fifty
 * invoices and pressing Download on each — is how a month-end reconciliation
 * actually gets done today, and it is the one job a Finance Viewer needs the
 * application to be good at.
 *
 * Selection is scoped to the page you are looking at, and the count is shown next
 * to the button, so nobody presses Download expecting the whole filtered set and
 * receives one page of it.
 */

const PAGE_SIZE = 25;
const MAX_PER_ARCHIVE = 100;

type DocType = 'QUOTATION' | 'INVOICE';

interface Row {
  id: string;
  number: string;
  status: string;
  customerName: string;
  documentDate: string;
  currencyCode: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
  grandTotal: string;
  isOverdue?: boolean;
}

export const DownloadsPage = () => {
  const toast = useToast();
  const { hasPermission } = useAuth();
  const { data: customers } = useCustomerOptions();

  const [type, setType] = useState<DocType>('INVOICE');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const canBulk = hasPermission(PERMISSIONS.DOCUMENT_BULK_DOWNLOAD);
  const formatFor = useCurrencyFormatter();

  const params = {
    page,
    pageSize: PAGE_SIZE,
    sort: '-documentDate',
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
    ...(customerId ? { customerId: Number(customerId) } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };

  const query = useQuery({
    queryKey: type === 'INVOICE' ? invoiceKeys.list(params) : quotationKeys.list(params),
    queryFn: () =>
      type === 'INVOICE'
        ? invoicesApi.list(params).then((page) => ({ ...page, items: page.items as Row[] }))
        : quotationsApi.list(params).then((page) => ({ ...page, items: page.items as Row[] })),
  });

  const rows = query.data?.items ?? [];
  const pageIds = rows.map((row) => row.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const reset = (next: DocType) => {
    setType(next);
    setSelected(new Set());
    setStatus('');
    setPage(1);
  };

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const download = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;

    setDownloading(true);
    try {
      const { blob, fileName } = await downloadsApi.bulkPdf(type, ids);
      saveBlob(blob, fileName);
      toast.success(`${ids.length} document${ids.length === 1 ? '' : 's'} downloaded`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not build the archive.');
    } finally {
      setDownloading(false);
    }
  };

  const statuses = type === 'INVOICE' ? STORED_INVOICE_STATUSES : QUOTATION_STATUSES;

  return (
    <>
      <PageHeader
        title="Downloads"
        description="Filter a set of documents and take them away as one archive."
        breadcrumbs={[{ label: 'Downloads' }]}
        actions={
          canBulk ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={selected.size === 0 || downloading}
              onClick={() => void download()}
            >
              <Archive size={15} className="me-1" aria-hidden />
              {downloading
                ? 'Building the archive…'
                : selected.size === 0
                  ? 'Download selected'
                  : `Download ${selected.size} ${selected.size === 1 ? 'document' : 'documents'}`}
            </button>
          ) : undefined
        }
      />

      {selected.size > MAX_PER_ARCHIVE && (
        <div className="alert alert-warning py-2 small" role="alert">
          {selected.size} documents selected. One archive carries {MAX_PER_ARCHIVE} at most — narrow
          the filter, or download in batches.
        </div>
      )}

      <div className="card">
        <div className="card-header bg-white">
          <div className="row g-2 align-items-end">
            <div className="col-6 col-lg-2">
              <label className="form-label small text-secondary mb-1" htmlFor="download-type">
                Document type
              </label>
              <select
                id="download-type"
                className="form-select form-select-sm"
                value={type}
                onChange={(event) => reset(event.target.value as DocType)}
              >
                <option value="INVOICE">Invoices</option>
                <option value="QUOTATION">Quotations</option>
              </select>
            </div>

            <div className="col-12 col-lg-3">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setPage(1);
                  setSearch(searchInput.trim());
                }}
              >
                <label className="form-label small text-secondary mb-1" htmlFor="download-search">
                  Search
                </label>
                <div className="input-group input-group-sm">
                  <span className="input-group-text bg-white border-end-0">
                    <Search size={14} aria-hidden />
                  </span>
                  <input
                    id="download-search"
                    className="form-control border-start-0"
                    placeholder="Number, reference or customer"
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
              <label className="form-label small text-secondary mb-1" htmlFor="download-status">
                Status
              </label>
              <select
                id="download-status"
                className="form-select form-select-sm"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </option>
                ))}
                {type === 'INVOICE' && <option value="OVERDUE">Overdue</option>}
              </select>
            </div>

            <div className="col-6 col-lg-2">
              <label className="form-label small text-secondary mb-1" htmlFor="download-customer">
                Customer
              </label>
              <select
                id="download-customer"
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

            <div className="col-12 col-lg-3">
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

          {selected.size > 0 && (
            <div className="d-flex align-items-center gap-3 mt-2 small">
              <span>{selected.size} selected across every page of this filter</span>
              <button
                type="button"
                className="btn btn-sm btn-link p-0"
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </button>
            </div>
          )}
        </div>

        <div className="table-scroll">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th scope="col" style={{ width: '2.5rem' }}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    aria-label="Select every document on this page"
                    checked={allOnPageSelected}
                    onChange={toggleAllOnPage}
                    disabled={rows.length === 0}
                  />
                </th>
                <th scope="col">Number</th>
                <th scope="col">Customer</th>
                <th scope="col">Date</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-numeric">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && <TableSkeleton columns={6} />}

              {!query.isLoading &&
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        aria-label={`Select ${row.number}`}
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                      />
                    </td>
                    <td className="text-mono small">{row.number}</td>
                    <td>{row.customerName}</td>
                    <td>{formatDate(row.documentDate)}</td>
                    <td>
                      <StatusBadge status={row.status as never} overdue={row.isOverdue ?? false} />
                    </td>
                    <td className="text-numeric">{formatMoney(row.grandTotal, formatFor(row))}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {query.isError && (
          <ErrorState
            message={query.error instanceof ApiError ? query.error.message : 'Unexpected error.'}
            onRetry={() => void query.refetch()}
          />
        )}

        {!query.isLoading && !query.isError && rows.length === 0 && (
          <EmptyState
            title="Nothing matches this filter"
            description="Widen the dates, or switch between invoices and quotations."
          />
        )}

        {query.data?.meta && rows.length > 0 && (
          <div className="card-footer bg-white d-flex justify-content-between align-items-center">
            <Pagination meta={query.data.meta} onPageChange={setPage} />
            {canBulk && (
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                disabled={selected.size === 0 || downloading}
                onClick={() => void download()}
              >
                <FileDown size={14} className="me-1" aria-hidden />
                Download selected
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
};

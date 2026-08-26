import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileText, Search } from 'lucide-react';
import { PERMISSIONS, type AuditLogRow } from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { auditApi, auditKeys, reportsApi } from '@/services/reports-api';
import { formatDateTime, saveBlob } from '@/utils/format';

/**
 * The audit log viewer.
 *
 * The table is append-only and the application has no path that changes it, so
 * this screen only reads. Each line is a sentence rather than an enum, and any
 * row can be opened to see exactly what changed — the before and after the
 * service recorded, not a re-derivation of it.
 */

const ACTIONS = [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'PASSWORD_CHANGED',
  'USER_CREATED',
  'USER_UPDATED',
  'COMPANY_UPDATED',
  'CUSTOMER_CREATED',
  'CUSTOMER_UPDATED',
  'ITEM_CREATED',
  'TEMPLATE_VERSION_PUBLISHED',
  'QUOTATION_CREATED',
  'QUOTATION_UPDATED',
  'QUOTATION_STATUS_CHANGED',
  'QUOTATION_CONVERTED',
  'INVOICE_CREATED',
  'INVOICE_UPDATED',
  'INVOICE_STATUS_CHANGED',
  'INVOICE_CANCELLED',
  'INVOICE_VOIDED',
  'PAYMENT_STATUS_CHANGED',
  'DOCUMENT_PDF_GENERATED',
  'DOCUMENT_DOWNLOADED',
  'DOCUMENT_SHARED',
  'SHARE_REVOKED',
  'REPORT_EXPORTED',
  'BULK_DOWNLOAD',
];

const ENTITY_TYPES = ['QUOTATION', 'INVOICE', 'CUSTOMER', 'ITEM', 'TEMPLATE', 'USER', 'COMPANY'];

const DOCUMENT_PATHS: Record<string, string> = {
  QUOTATION: '/quotations',
  INVOICE: '/invoices',
  CUSTOMER: '/customers',
};

const Detail = ({ label, value }: { label: string; value: unknown }) =>
  value === null || value === undefined ? null : (
    <div className="col-md-4 mb-2">
      <div className="label-caps">{label}</div>
      <pre className="small mb-0 text-wrap">{JSON.stringify(value, null, 1)}</pre>
    </div>
  );

const Row = ({ row }: { row: AuditLogRow }) => {
  const [open, setOpen] = useState(false);

  const entry = useQuery({
    queryKey: auditKeys.entry(row.id),
    queryFn: () => auditApi.entry(row.id),
    enabled: open,
  });

  const path = row.entityId ? DOCUMENT_PATHS[row.entityType] : undefined;

  return (
    <>
      <tr>
        <td style={{ width: '2rem' }}>
          <button
            type="button"
            className="btn btn-sm btn-link p-0 text-secondary"
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} the detail of this entry`}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
          </button>
        </td>
        <td className="text-nowrap small">{formatDateTime(row.createdAt)}</td>
        <td>
          {row.userName}
          <div className="small text-secondary d-none d-lg-block">{row.userEmail}</div>
        </td>
        <td>
          {row.summary}
          {path && (
            <Link to={`${path}/${row.entityId}`} className="ms-2 small text-decoration-none">
              open
            </Link>
          )}
        </td>
        <td className="d-none d-xl-table-cell small text-secondary text-mono">{row.action}</td>
      </tr>

      {open && (
        <tr>
          <td colSpan={5} className="bg-light">
            {entry.isLoading && <div className="small text-secondary">Loading…</div>}
            {entry.data && (
              <div className="row">
                <Detail label="Before" value={entry.data.previousData} />
                <Detail label="After" value={entry.data.newData} />
                <Detail label="Context" value={entry.data.metadata} />
                <div className="col-12 small text-secondary">
                  {entry.data.ip && <>IP {entry.data.ip} · </>}
                  {entry.data.requestId && <>request {entry.data.requestId}</>}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
};

export const AuditLogPage = () => {
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canExport = hasPermission(PERMISSIONS.REPORT_EXPORT);

  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const params = {
    page,
    pageSize: 50,
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(search ? { search } : {}),
  };

  const query = useQuery({
    queryKey: auditKeys.list(params),
    queryFn: () => auditApi.list(params),
  });

  const download = async () => {
    setExporting(true);
    try {
      /* The audit trail exports through the same report pipeline; its filters map
         onto the shared shape, which is why `action` travels as `status`. */
      const { blob, fileName } = await reportsApi.export('audit', 'csv', {
        ...(action ? { status: action } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
        ...(search ? { search } : {}),
      });
      saveBlob(blob, fileName);
      toast.success(`${fileName} downloaded`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not export the trail.');
    } finally {
      setExporting(false);
    }
  };

  const rows = query.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="Every action the application recorded, in the order it happened. Nothing here can be edited or removed."
        breadcrumbs={[{ label: 'Audit Logs' }]}
        actions={
          canExport ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={exporting}
              onClick={() => void download()}
            >
              <FileText size={14} className="me-1" aria-hidden />
              {exporting ? 'Building…' : 'Export CSV'}
            </button>
          ) : undefined
        }
      />

      <div className="card">
        <div className="card-header bg-white">
          <div className="row g-2 align-items-end">
            <div className="col-6 col-lg-3">
              <label className="form-label small text-secondary mb-1" htmlFor="audit-action">
                Action
              </label>
              <select
                id="audit-action"
                className="form-select form-select-sm"
                value={action}
                onChange={(event) => {
                  setAction(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {ACTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value.toLowerCase().replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-6 col-lg-2">
              <label className="form-label small text-secondary mb-1" htmlFor="audit-entity">
                Record type
              </label>
              <select
                id="audit-entity"
                className="form-select form-select-sm"
                value={entityType}
                onChange={(event) => {
                  setEntityType(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {ENTITY_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value.toLowerCase()}
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

            <div className="col-12 col-lg-4">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setPage(1);
                  setSearch(searchInput.trim());
                }}
              >
                <label className="form-label small text-secondary mb-1" htmlFor="audit-search">
                  Search
                </label>
                <div className="input-group input-group-sm">
                  <span className="input-group-text bg-white border-end-0">
                    <Search size={14} aria-hidden />
                  </span>
                  <input
                    id="audit-search"
                    className="form-control border-start-0"
                    placeholder="Document number, email or request id"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                  <button type="submit" className="btn btn-outline-secondary">
                    Apply
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="table-scroll">
          <table className="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">What happened</th>
                <th scope="col" className="d-none d-xl-table-cell">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && <TableSkeleton columns={5} />}
              {!query.isLoading && rows.map((row) => <Row key={row.id} row={row} />)}
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
            title="Nothing recorded for these filters"
            description="Widen the dates, or clear the action filter."
          />
        )}

        {query.data?.meta && rows.length > 0 && (
          <div className="card-footer bg-white">
            <Pagination meta={query.data.meta} onPageChange={setPage} />
          </div>
        )}
      </div>
    </>
  );
};

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, FileDown, Pencil, ReceiptText, Trash2 } from 'lucide-react';
import {
  PERMISSIONS,
  STATUS_LABELS,
  formatMoney,
  quotationActions,
  type QuotationRecord,
  type QuotationStatus,
} from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/states';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { quotationKeys, quotationsApi } from '@/services/quotations-api';
import { invoiceKeys } from '@/services/invoices-api';
import { useCurrencyFormat } from '@/hooks/useMasters';
import { formatDate, formatDateTime, saveBlob } from '@/utils/format';
import { DocumentPreviewCard } from '@/modules/documents/DocumentPreviewCard';
import { ShareLinksPanel } from '@/modules/documents/ShareLinksPanel';
import { RevisionHistoryPanel } from '@/modules/documents/RevisionHistoryPanel';

/**
 * A single quotation.
 *
 * The page shows the rendered document rather than a re-typeset copy of it, so
 * what is on screen is what the customer receives. Everything around it — the
 * timeline, the share links, the revision history — answers "what has happened to
 * this document", which is the question this page exists for.
 */

/** Statuses whose change is worth asking a reason for before it is recorded. */
const REASON_STATUSES: QuotationStatus[] = ['CANCELLED', 'DECLINED'];

const ACTION_LABELS: Partial<Record<QuotationStatus, string>> = {
  SENT: 'Mark as sent',
  VIEWED: 'Mark as viewed',
  ACCEPTED: 'Mark as accepted',
  DECLINED: 'Mark as declined',
  EXPIRED: 'Mark as expired',
  CANCELLED: 'Cancel quotation',
};

const Detail = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="col-6 mb-3">
    <div className="label-caps">{label}</div>
    <div>{value || <span className="text-secondary">—</span>}</div>
  </div>
);

const TimelineRow = ({ label, at }: { label: string; at: string | null }) =>
  at ? (
    <li className="d-flex justify-content-between border-top py-2 small">
      <span>{label}</span>
      <span className="text-secondary">{formatDateTime(at)}</span>
    </li>
  ) : null;

export const QuotationDetailPage = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { hasPermission } = useAuth();

  const [pendingStatus, setPendingStatus] = useState<QuotationStatus | null>(null);
  const [reason, setReason] = useState('');
  const [downloading, setDownloading] = useState(false);

  const query = useQuery({
    queryKey: quotationKeys.detail(id),
    queryFn: () => quotationsApi.get(id),
    enabled: id !== '',
  });

  const quotation: QuotationRecord | undefined = query.data;
  const currency = useCurrencyFormat(quotation?.currencyCode ?? 'INR');

  const statusMutation = useMutation({
    mutationFn: ({ status, note }: { status: QuotationStatus; note?: string }) =>
      quotationsApi.changeStatus(id, {
        status: status as Exclude<QuotationStatus, 'DRAFT' | 'CONVERTED'>,
        ...(note ? { reason: note } : {}),
      }),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: quotationKeys.all });
      setPendingStatus(null);
      setReason('');
      toast.success(`${updated.number} is now ${STATUS_LABELS[updated.status].toLowerCase()}`);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not change the status.'),
  });

  /**
   * Conversion.
   *
   * One call: the invoice is created, the quotation becomes CONVERTED and the two
   * are linked, all inside a single transaction on the server. The user lands on
   * the invoice, because that is the document they now have to act on.
   */
  const convertMutation = useMutation({
    mutationFn: () => quotationsApi.convert(id, {}),
    onSuccess: async (invoice) => {
      await queryClient.invalidateQueries({ queryKey: quotationKeys.all });
      await queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      toast.success(`${invoice.number} raised from ${quotation?.number ?? 'this quotation'}`);
      navigate(`/invoices/${invoice.id}`);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not convert this quotation.'),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => quotationsApi.duplicate(id),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: quotationKeys.all });
      toast.success(`Copied to ${created.number}`);
      navigate(`/quotations/${created.id}/edit`);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not duplicate.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => quotationsApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: quotationKeys.all });
      toast.success('Draft deleted — the number stays used, nothing is reissued');
      navigate('/quotations');
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not delete the draft.'),
  });

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const { blob, fileName } = await quotationsApi.downloadPdf(id);
      saveBlob(blob, fileName);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not produce the PDF.');
    } finally {
      setDownloading(false);
    }
  };

  if (query.isError) {
    return (
      <ErrorState
        message={query.error instanceof ApiError ? query.error.message : 'Unexpected error.'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const canUpdate = hasPermission(PERMISSIONS.QUOTATION_UPDATE);
  const canChangeStatus = hasPermission(PERMISSIONS.QUOTATION_UPDATE_STATUS);
  const canCreate = hasPermission(PERMISSIONS.QUOTATION_CREATE);
  const canConvert = hasPermission(PERMISSIONS.QUOTATION_CONVERT);
  const canDelete = hasPermission(PERMISSIONS.QUOTATION_DELETE);
  const canDownload = hasPermission(PERMISSIONS.QUOTATION_DOWNLOAD);

  const locked = quotation?.status === 'CONVERTED' || quotation?.status === 'CANCELLED';
  const actions = quotation ? quotationActions(quotation.status) : [];

  return (
    <>
      <PageHeader
        title={quotation?.number ?? 'Quotation'}
        description={
          quotation
            ? `${quotation.customerSnapshot.name} · ${formatDate(quotation.documentDate)} · ${formatMoney(quotation.grandTotal, currency)}`
            : undefined
        }
        breadcrumbs={[
          { label: 'Sales' },
          { label: 'Quotations', to: '/quotations' },
          { label: quotation?.number ?? '' },
        ]}
        actions={
          quotation && (
            <>
              {canChangeStatus &&
                actions.map((next) => (
                  <button
                    key={next}
                    type="button"
                    className={`btn btn-sm ${next === 'CANCELLED' ? 'btn-outline-danger' : 'btn-outline-secondary'}`}
                    disabled={statusMutation.isPending}
                    onClick={() => {
                      if (REASON_STATUSES.includes(next)) setPendingStatus(next);
                      else statusMutation.mutate({ status: next });
                    }}
                  >
                    {ACTION_LABELS[next] ?? STATUS_LABELS[next]}
                  </button>
                ))}

              {canDownload && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={downloading}
                  onClick={() => void downloadPdf()}
                >
                  <FileDown size={14} className="me-1" aria-hidden />
                  {downloading ? 'Preparing…' : 'Download PDF'}
                </button>
              )}

              {canConvert && quotation.status === 'ACCEPTED' && (
                <button
                  type="button"
                  className="btn btn-sm btn-success"
                  disabled={convertMutation.isPending}
                  onClick={() => convertMutation.mutate()}
                >
                  <ReceiptText size={14} className="me-1" aria-hidden />
                  {convertMutation.isPending ? 'Converting…' : 'Convert to invoice'}
                </button>
              )}

              {canCreate && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={duplicateMutation.isPending}
                  onClick={() => duplicateMutation.mutate()}
                >
                  <Copy size={14} className="me-1" aria-hidden />
                  Duplicate
                </button>
              )}

              {canDelete && quotation.status === 'DRAFT' && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete draft ${quotation.number}? This cannot be undone.`))
                      deleteMutation.mutate();
                  }}
                >
                  <Trash2 size={14} className="me-1" aria-hidden />
                  Delete draft
                </button>
              )}

              {canUpdate && !locked && (
                <Link to={`/quotations/${id}/edit`} className="btn btn-sm btn-primary">
                  <Pencil size={14} className="me-1" aria-hidden />
                  Edit
                </Link>
              )}
            </>
          )
        }
      />

      {pendingStatus && (
        <div className="card border-warning mb-3">
          <div className="card-body">
            <label className="form-label" htmlFor="status-reason">
              Reason for marking this {ACTION_LABELS[pendingStatus]?.toLowerCase() ?? 'change'}
            </label>
            <div className="d-flex gap-2">
              <input
                id="status-reason"
                className="form-control"
                autoFocus
                placeholder="Recorded against the document and in the audit log"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={statusMutation.isPending}
                onClick={() =>
                  statusMutation.mutate({
                    status: pendingStatus,
                    note: reason.trim() || undefined,
                  })
                }
              >
                Confirm
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  setPendingStatus(null);
                  setReason('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {quotation?.convertedInvoiceId && (
        <div className="alert alert-success py-2 small" role="status">
          Converted to invoice{' '}
          <Link to={`/invoices/${quotation.convertedInvoiceId}`}>
            {quotation.convertedInvoiceNumber}
          </Link>
          .
        </div>
      )}

      <div className="row g-3">
        <div className="col-12 col-xxl-7">
          <DocumentPreviewCard
            cacheKey={[...quotationKeys.detail(id), 'preview']}
            fetchHtml={() => quotationsApi.previewHtml(id)}
            enabled={Boolean(quotation)}
            placeholder="Loading…"
            onDownloadPdf={canDownload ? () => void downloadPdf() : undefined}
            downloading={downloading}
          />
        </div>

        <div className="col-12 col-xxl-5">
          <div className="card mb-3">
            <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <span className="label-caps">Summary</span>
              {quotation && <StatusBadge status={quotation.status} expired={quotation.isExpired} />}
            </div>
            <div className="card-body">
              {quotation ? (
                <div className="row">
                  <Detail
                    label="Customer"
                    value={
                      <Link to={`/customers/${quotation.customerId}`}>
                        {quotation.customerSnapshot.name}
                      </Link>
                    }
                  />
                  <Detail label="Customer code" value={quotation.customerSnapshot.customerCode} />
                  <Detail label="Quotation date" value={formatDate(quotation.documentDate)} />
                  <Detail label="Valid until" value={formatDate(quotation.expiryDate)} />
                  <Detail label="Reference" value={quotation.referenceNumber} />
                  <Detail label="Subject" value={quotation.subject} />
                  <Detail label="Financial year" value={quotation.financialYearCode} />
                  <Detail
                    label="Currency"
                    value={
                      quotation.currencyCode === quotation.baseCurrencyCode
                        ? quotation.currencyCode
                        : `${quotation.currencyCode} @ ${quotation.exchangeRateToBase} ${quotation.baseCurrencyCode}`
                    }
                  />
                  <Detail label="GSTIN" value={quotation.customerSnapshot.gstin} />
                  <Detail label="Place of supply" value={quotation.placeOfSupplyStateCode} />
                  <Detail label="Template" value={quotation.templateName} />
                  <Detail
                    label="Document version"
                    value={
                      quotation.currentVersion > 1
                        ? `Version ${quotation.currentVersion}`
                        : 'Version 1 — never revised'
                    }
                  />
                  <Detail label="Created by" value={quotation.createdByName} />

                  <div className="col-12">
                    <div className="d-flex justify-content-between border-top pt-2">
                      <span className="text-secondary">Taxable value</span>
                      <span className="text-numeric">
                        {formatMoney(quotation.taxableTotal, currency)}
                      </span>
                    </div>
                    {quotation.taxSummary.byComponent.map((row) => (
                      <div
                        key={`${row.label}-${row.ratePercent ?? ''}`}
                        className="d-flex justify-content-between"
                      >
                        <span className="text-secondary">{row.label}</span>
                        <span className="text-numeric">{formatMoney(row.taxAmount, currency)}</span>
                      </div>
                    ))}
                    <div className="d-flex justify-content-between fw-semibold border-top mt-1 pt-1">
                      <span>Total</span>
                      <span className="text-numeric">
                        {formatMoney(quotation.grandTotal, currency)}
                      </span>
                    </div>
                    <div className="small text-secondary mt-1">
                      {quotation.taxSummary.amountInWords}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="placeholder-glow">
                  <span className="placeholder col-12 mb-2" />
                  <span className="placeholder col-8" />
                </div>
              )}
            </div>
          </div>

          {quotation && (
            <div className="card mb-3">
              <div className="card-header bg-white">
                <span className="label-caps">Timeline</span>
              </div>
              <div className="card-body py-0">
                <ul className="list-unstyled mb-0">
                  <li className="d-flex justify-content-between py-2 small">
                    <span>Created</span>
                    <span className="text-secondary">{formatDateTime(quotation.createdAt)}</span>
                  </li>
                  <TimelineRow label="Sent" at={quotation.sentAt} />
                  <TimelineRow label="First viewed" at={quotation.firstViewedAt} />
                  <TimelineRow label="Accepted" at={quotation.acceptedAt} />
                  <TimelineRow label="Declined" at={quotation.declinedAt} />
                  <TimelineRow label="Cancelled" at={quotation.cancelledAt} />
                  {quotation.cancelReason && (
                    <li className="border-top py-2 small text-secondary">
                      Reason: {quotation.cancelReason}
                    </li>
                  )}
                  <li className="d-flex justify-content-between border-top py-2 small">
                    <span>Last updated</span>
                    <span className="text-secondary">{formatDateTime(quotation.updatedAt)}</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          <div className="mb-3">
            <ShareLinksPanel
              documentId={id}
              api={quotationsApi}
              sharesKey={quotationKeys.shares(id)}
              sharePermission={PERMISSIONS.QUOTATION_SHARE}
            />
          </div>

          <RevisionHistoryPanel
            documentId={id}
            historyKey={quotationKeys.history(id)}
            fetchHistory={quotationsApi.history}
          />
        </div>
      </div>
    </>
  );
};

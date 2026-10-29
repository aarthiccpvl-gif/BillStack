import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Copy, FileCheck2, FileDown, Pencil, Send, Trash2 } from 'lucide-react';
import { PERMISSIONS, formatMoney, type InvoiceRecord } from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/states';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { invoiceKeys, invoicesApi } from '@/services/invoices-api';
import { useCurrencyFormat } from '@/hooks/useMasters';
import { formatDate, formatDateTime, saveBlob } from '@/utils/format';
import { AttachmentsPanel } from '@/modules/documents/AttachmentsPanel';
import { DocumentPreviewCard } from '@/modules/documents/DocumentPreviewCard';
import { ShareLinksPanel } from '@/modules/documents/ShareLinksPanel';
import { RevisionHistoryPanel } from '@/modules/documents/RevisionHistoryPanel';
import { PaymentPanel } from './PaymentPanel';

/**
 * A single invoice.
 *
 * The page shows the rendered document rather than a re-typeset copy of it, so
 * what is on screen is what the customer receives. Around it sit the three
 * questions an invoice actually raises: has it been issued, has it been paid, and
 * what has been done to it since.
 */

type EndAction = 'cancel' | 'void';

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

export const InvoiceDetailPage = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { hasPermission } = useAuth();

  const [ending, setEnding] = useState<EndAction | null>(null);
  const [reason, setReason] = useState('');
  const [downloading, setDownloading] = useState(false);

  const query = useQuery({
    queryKey: invoiceKeys.detail(id),
    queryFn: () => invoicesApi.get(id),
    enabled: id !== '',
  });

  const invoice: InvoiceRecord | undefined = query.data;
  const currency = useCurrencyFormat(invoice?.currencyCode ?? 'INR');

  const afterChange = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    setEnding(null);
    setReason('');
    toast.success(message);
  };

  const failed = (fallback: string) => (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : fallback);

  const issueMutation = useMutation({
    mutationFn: () => invoicesApi.issue(id),
    onSuccess: (updated) => afterChange(`${updated.number} issued`),
    onError: failed('Could not issue the invoice.'),
  });

  const sentMutation = useMutation({
    mutationFn: () => invoicesApi.changeStatus(id, { status: 'SENT' }),
    onSuccess: (updated) => afterChange(`${updated.number} marked as sent`),
    onError: failed('Could not change the status.'),
  });

  const endMutation = useMutation({
    mutationFn: ({ action, note }: { action: EndAction; note: string }) =>
      action === 'cancel' ? invoicesApi.cancel(id, note) : invoicesApi.void(id, note),
    onSuccess: (updated) =>
      afterChange(
        updated.status === 'CANCELLED'
          ? `${updated.number} cancelled — the number stays used`
          : `${updated.number} voided — the figures are kept as they were`,
      ),
    onError: failed('Could not complete that.'),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => invoicesApi.duplicate(id),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      toast.success(`Copied to ${created.number}`);
      navigate(`/invoices/${created.id}/edit`);
    },
    onError: failed('Could not duplicate.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => invoicesApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      toast.success('Draft deleted — the number stays used, nothing is reissued');
      navigate('/invoices');
    },
    onError: failed('Could not delete the draft.'),
  });

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const { blob, fileName } = await invoicesApi.downloadPdf(id);
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

  const canUpdate = hasPermission(PERMISSIONS.INVOICE_UPDATE);
  const canChangeStatus = hasPermission(PERMISSIONS.INVOICE_UPDATE_STATUS);
  const canCreate = hasPermission(PERMISSIONS.INVOICE_CREATE);
  const canDelete = hasPermission(PERMISSIONS.INVOICE_DELETE);
  const canDownload = hasPermission(PERMISSIONS.INVOICE_DOWNLOAD);
  const canCancel = hasPermission(PERMISSIONS.INVOICE_CANCEL);
  const canVoid = hasPermission(PERMISSIONS.INVOICE_VOID);

  const closed = invoice?.status === 'CANCELLED' || invoice?.status === 'VOID';
  const isDraft = invoice?.status === 'DRAFT';

  return (
    <>
      <PageHeader
        title={invoice?.number ?? 'Invoice'}
        description={
          invoice
            ? `${invoice.customerSnapshot.name} · ${formatDate(invoice.documentDate)} · ${formatMoney(invoice.grandTotal, currency)}`
            : undefined
        }
        breadcrumbs={[
          { label: 'Sales' },
          { label: 'Invoices', to: '/invoices' },
          { label: invoice?.number ?? '' },
        ]}
        actions={
          invoice && (
            <>
              {canChangeStatus && isDraft && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={issueMutation.isPending}
                  onClick={() => issueMutation.mutate()}
                >
                  <FileCheck2 size={14} className="me-1" aria-hidden />
                  {issueMutation.isPending ? 'Issuing…' : 'Issue'}
                </button>
              )}

              {canChangeStatus && invoice.status === 'ISSUED' && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={sentMutation.isPending}
                  onClick={() => sentMutation.mutate()}
                >
                  <Send size={14} className="me-1" aria-hidden />
                  Mark as sent
                </button>
              )}

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

              {canCancel && !closed && Number(invoice.amountPaid) === 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => setEnding('cancel')}
                >
                  Cancel invoice
                </button>
              )}

              {canVoid && !closed && !isDraft && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => setEnding('void')}
                >
                  <Ban size={14} className="me-1" aria-hidden />
                  Void
                </button>
              )}

              {canDelete && isDraft && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete draft ${invoice.number}? This cannot be undone.`))
                      deleteMutation.mutate();
                  }}
                >
                  <Trash2 size={14} className="me-1" aria-hidden />
                  Delete draft
                </button>
              )}

              {canUpdate && !closed && (
                <Link to={`/invoices/${id}/edit`} className="btn btn-sm btn-outline-primary">
                  <Pencil size={14} className="me-1" aria-hidden />
                  Edit
                </Link>
              )}
            </>
          )
        }
      />

      {ending && (
        <div className="card border-danger mb-3">
          <div className="card-body">
            <label className="form-label" htmlFor="end-reason">
              {ending === 'cancel'
                ? 'Why is this invoice being cancelled?'
                : 'Why is this invoice being voided?'}
            </label>
            <p className="small text-secondary">
              {ending === 'cancel'
                ? 'The number stays used and the record is kept, so the gap in the sequence stays explainable.'
                : 'The figures are kept exactly as they are; only the status says the document no longer stands.'}
            </p>
            <div className="d-flex gap-2">
              <input
                id="end-reason"
                className="form-control"
                autoFocus
                placeholder="Recorded against the document and in the audit log"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-danger"
                disabled={reason.trim().length < 3 || endMutation.isPending}
                onClick={() => endMutation.mutate({ action: ending, note: reason.trim() })}
              >
                Confirm
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  setEnding(null);
                  setReason('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {invoice?.quotationId && (
        <div className="alert alert-light border py-2 small" role="status">
          Raised from quotation{' '}
          <Link to={`/quotations/${invoice.quotationId}`}>{invoice.quotationNumber}</Link>.
        </div>
      )}

      {closed && invoice?.cancelReason && (
        <div className="alert alert-warning py-2 small" role="status">
          {invoice.status === 'CANCELLED' ? 'Cancelled' : 'Voided'}: {invoice.cancelReason}
        </div>
      )}

      <div className="row g-3">
        <div className="col-12 col-xxl-7">
          <DocumentPreviewCard
            cacheKey={[...invoiceKeys.detail(id), 'preview']}
            fetchHtml={() => invoicesApi.previewHtml(id)}
            enabled={Boolean(invoice)}
            placeholder="Loading…"
            onDownloadPdf={canDownload ? () => void downloadPdf() : undefined}
            downloading={downloading}
          />
        </div>

        <div className="col-12 col-xxl-5">
          <div className="card mb-3">
            <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <span className="label-caps">Summary</span>
              {invoice && <StatusBadge status={invoice.status} overdue={invoice.isOverdue} />}
            </div>
            <div className="card-body">
              {invoice ? (
                <div className="row">
                  <Detail
                    label="Customer"
                    value={
                      <Link to={`/customers/${invoice.customerId}`}>
                        {invoice.customerSnapshot.name}
                      </Link>
                    }
                  />
                  <Detail label="Customer code" value={invoice.customerSnapshot.customerCode} />
                  <Detail label="Invoice date" value={formatDate(invoice.documentDate)} />
                  <Detail
                    label="Due"
                    value={`${formatDate(invoice.dueDate)} (${invoice.paymentTermsDays} days)`}
                  />
                  <Detail label="Reference" value={invoice.referenceNumber} />
                  <Detail label="Subject" value={invoice.subject} />
                  <Detail label="Financial year" value={invoice.financialYearCode} />
                  <Detail
                    label="Currency"
                    value={
                      invoice.currencyCode === invoice.baseCurrencyCode
                        ? invoice.currencyCode
                        : `${invoice.currencyCode} @ ${invoice.exchangeRateToBase} ${invoice.baseCurrencyCode}`
                    }
                  />
                  <Detail label="GSTIN" value={invoice.customerSnapshot.gstin} />
                  <Detail label="Place of supply" value={invoice.placeOfSupplyStateCode} />
                  <Detail label="Template" value={invoice.templateName} />
                  <Detail
                    label="Document version"
                    value={
                      invoice.currentVersion > 1
                        ? `Version ${invoice.currentVersion}`
                        : 'Version 1 — never revised'
                    }
                  />

                  <div className="col-12">
                    <div className="d-flex justify-content-between border-top pt-2">
                      <span className="text-secondary">Taxable value</span>
                      <span className="text-numeric">
                        {formatMoney(invoice.taxableTotal, currency)}
                      </span>
                    </div>
                    {invoice.taxSummary.byComponent.map((row) => (
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
                        {formatMoney(invoice.grandTotal, currency)}
                      </span>
                    </div>
                    <div className="small text-secondary mt-1">
                      {invoice.taxSummary.amountInWords}
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

          {invoice && (
            <div className="mb-3">
              <PaymentPanel invoice={invoice} currency={currency} />
            </div>
          )}

          {invoice && (
            <div className="card mb-3">
              <div className="card-header bg-white">
                <span className="label-caps">Timeline</span>
              </div>
              <div className="card-body py-0">
                <ul className="list-unstyled mb-0">
                  <li className="d-flex justify-content-between py-2 small">
                    <span>Created</span>
                    <span className="text-secondary">{formatDateTime(invoice.createdAt)}</span>
                  </li>
                  <TimelineRow label="Issued" at={invoice.issuedAt} />
                  <TimelineRow label="Sent" at={invoice.sentAt} />
                  <TimelineRow label="First viewed" at={invoice.firstViewedAt} />
                  <TimelineRow label="Paid" at={invoice.paidAt} />
                  <TimelineRow label="Cancelled" at={invoice.cancelledAt} />
                  <TimelineRow label="Voided" at={invoice.voidedAt} />
                  <li className="d-flex justify-content-between border-top py-2 small">
                    <span>Last updated</span>
                    <span className="text-secondary">{formatDateTime(invoice.updatedAt)}</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          <div className="mb-3">
            <AttachmentsPanel
              documentId={id}
              api={invoicesApi}
              attachmentsKey={invoiceKeys.attachments(id)}
              writePermission={PERMISSIONS.INVOICE_UPDATE}
            />
          </div>

          <div className="mb-3">
            <ShareLinksPanel
              documentId={id}
              api={invoicesApi}
              sharesKey={invoiceKeys.shares(id)}
              sharePermission={PERMISSIONS.INVOICE_SHARE}
            />
          </div>

          <RevisionHistoryPanel
            documentId={id}
            historyKey={invoiceKeys.history(id)}
            fetchHistory={invoicesApi.history}
          />
        </div>
      </div>
    </>
  );
};

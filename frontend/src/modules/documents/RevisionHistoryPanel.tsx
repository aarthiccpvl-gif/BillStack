import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import type { DocumentRevisionRecord } from '@app/shared';
import { formatDateTime } from '@/utils/format';

/**
 * Revision history, for quotations and invoices alike.
 *
 * An issued document can be changed (PRD §22) — what must never happen is the
 * change going unrecorded. Every version keeps who changed it, when, why and
 * which fields moved; nothing is deleted, so the earlier figures remain provable.
 */

/** Field names as the document snapshot spells them, in the words a user reads. */
const FIELD_LABELS: Record<string, string> = {
  customerId: 'customer',
  documentDate: 'document date',
  expiryDate: 'valid until',
  dueDate: 'due date',
  paymentTermsDays: 'payment terms',
  amountPaid: 'amount received',
  referenceNumber: 'reference',
  subject: 'subject',
  currencyCode: 'currency',
  exchangeRateToBase: 'exchange rate',
  placeOfSupplyStateCode: 'place of supply',
  discountMode: 'discount type',
  discountValue: 'discount',
  subtotal: 'subtotal',
  discountTotal: 'total discount',
  taxableTotal: 'taxable value',
  taxTotal: 'tax',
  adjustment: 'adjustment',
  roundOff: 'round-off',
  roundOffEnabled: 'round-off setting',
  grandTotal: 'total',
  notes: 'notes',
  terms: 'terms',
  customerMessage: 'customer message',
  paymentInstructions: 'payment instructions',
  bankAccountId: 'bank account',
  showBankDetails: 'bank details visibility',
  templateVersionId: 'template version',
  status: 'status',
  items: 'items',
};

const label = (field: string): string => FIELD_LABELS[field] ?? field;

export const RevisionHistoryPanel = ({
  documentId,
  historyKey,
  fetchHistory,
}: {
  documentId: string;
  historyKey: readonly unknown[];
  fetchHistory: (id: string) => Promise<DocumentRevisionRecord[]>;
}) => {
  const query = useQuery({
    queryKey: historyKey,
    queryFn: () => fetchHistory(documentId),
  });

  const revisions = query.data ?? [];

  return (
    <div className="card">
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <span className="label-caps">Revision history</span>
        {revisions.length > 0 && (
          <span className="badge text-bg-light border">{revisions.length}</span>
        )}
      </div>

      <div className="card-body">
        {query.isLoading && <div className="small text-secondary">Loading…</div>}

        {!query.isLoading && revisions.length === 0 && (
          <p className="small text-secondary mb-0">
            No revisions. A draft can be edited freely; once the document is issued, every change is
            recorded here with its reason.
          </p>
        )}

        <ol className="list-unstyled mb-0">
          {revisions.map((revision) => (
            <li key={revision.id} className="border-top py-2">
              <div className="d-flex justify-content-between align-items-baseline gap-2">
                <span className="fw-medium">
                  <History size={13} className="me-1 text-secondary" aria-hidden />
                  Version {revision.version}
                </span>
                <span className="small text-secondary">{formatDateTime(revision.createdAt)}</span>
              </div>

              <div className="small text-secondary">by {revision.changedByName}</div>

              {revision.changeReason && <div className="small mt-1">“{revision.changeReason}”</div>}

              {revision.changedFields.length > 0 && (
                <div className="small text-secondary mt-1">
                  Changed: {revision.changedFields.map(label).join(', ')}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

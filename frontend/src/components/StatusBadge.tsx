import {
  STATUS_LABELS,
  STATUS_TONES,
  type InvoiceStatus,
  type QuotationStatus,
  type StatusTone,
} from '@app/shared';

/**
 * A document status badge.
 *
 * Colour never carries the meaning on its own — the label is always written out,
 * so the status survives a greyscale print and a colour-blind reader.
 *
 * Expired and overdue arrive as separate flags because neither is a stored
 * status: both are derived from a date on every read, and both sit *beside* the
 * real status rather than replacing it. A sent quotation that lapsed is still
 * sent; an unpaid invoice that is late is still issued.
 */

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'text-bg-light border',
  info: 'text-bg-info',
  progress: 'text-bg-primary',
  success: 'text-bg-success',
  warning: 'text-bg-warning',
  danger: 'text-bg-danger',
};

export const StatusBadge = ({
  status,
  expired = false,
  overdue = false,
}: {
  status: QuotationStatus | InvoiceStatus;
  /** Derived on read: a sent quotation past its expiry date reads as expired. */
  expired?: boolean;
  /** Derived on read: an unpaid invoice past its due date reads as overdue. */
  overdue?: boolean;
}) => (
  <span className="d-inline-flex align-items-center gap-1 flex-wrap">
    <span className={`badge ${TONE_CLASS[STATUS_TONES[status]]}`}>{STATUS_LABELS[status]}</span>
    {expired && status !== 'EXPIRED' && (
      <span className="badge text-bg-warning" title="Past its expiry date">
        Expired
      </span>
    )}
    {overdue && (
      <span className="badge text-bg-danger" title="Past its due date and not settled">
        Overdue
      </span>
    )}
  </span>
);

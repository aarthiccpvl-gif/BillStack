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
}: {
  status: QuotationStatus | InvoiceStatus;
  /** Derived on read: a sent quotation past its expiry date reads as expired. */
  expired?: boolean;
}) => (
  <span className="d-inline-flex align-items-center gap-1">
    <span className={`badge ${TONE_CLASS[STATUS_TONES[status]]}`}>{STATUS_LABELS[status]}</span>
    {expired && status !== 'EXPIRED' && (
      <span className="badge text-bg-warning" title="Past its expiry date">
        Expired
      </span>
    )}
  </span>
);

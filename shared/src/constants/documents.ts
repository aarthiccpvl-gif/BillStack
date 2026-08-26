/**
 * Document vocabulary. Statuses are declared here so the badge colours in the UI,
 * the status machine in the service layer and the database enums cannot drift
 * apart. The transition rules themselves belong to the backend (Phase 5/6).
 */

export const DOC_TYPES = {
  QUOTATION: 'QUOTATION',
  INVOICE: 'INVOICE',
} as const;

export type DocType = (typeof DOC_TYPES)[keyof typeof DOC_TYPES];

export const QUOTATION_STATUSES = [
  'DRAFT',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CONVERTED',
  'CANCELLED',
] as const;

export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const INVOICE_STATUSES = [
  'DRAFT',
  'ISSUED',
  'SENT',
  'VIEWED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'VOID',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * The quotation status machine.
 *
 * Declared here rather than in the service so the buttons the UI offers and the
 * transitions the API accepts are the same list. The API still enforces it — this
 * is what the user is shown, not what they are trusted with.
 */
export const QUOTATION_TRANSITIONS: Record<QuotationStatus, readonly QuotationStatus[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'],
  VIEWED: ['ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'],
  ACCEPTED: ['CONVERTED', 'CANCELLED'],
  DECLINED: ['SENT', 'CANCELLED'],
  EXPIRED: ['SENT', 'CANCELLED'],
  CONVERTED: [],
  CANCELLED: [],
};

/** Transitions a user can ask for directly; CONVERTED happens by conversion. */
export const quotationActions = (status: QuotationStatus): readonly QuotationStatus[] =>
  QUOTATION_TRANSITIONS[status].filter((next) => next !== 'CONVERTED');

/**
 * The invoice status machine.
 *
 * `OVERDUE` is absent on purpose: it is derived from the due date on every read,
 * never written, so it cannot go stale in a row nobody has touched since.
 *
 * Cancel and void both keep the number and the record — nothing is ever deleted.
 * The difference is when: cancel is for an invoice that should not have been
 * raised, void is for one that was raised correctly and is being nullified after
 * money was already in play.
 */
export type StoredInvoiceStatus = Exclude<InvoiceStatus, 'OVERDUE'>;

export const STORED_INVOICE_STATUSES = INVOICE_STATUSES.filter(
  (status): status is StoredInvoiceStatus => status !== 'OVERDUE',
);

export const INVOICE_TRANSITIONS: Record<StoredInvoiceStatus, readonly StoredInvoiceStatus[]> = {
  DRAFT: ['ISSUED', 'CANCELLED'],
  ISSUED: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'VOID'],
  SENT: ['VIEWED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'VOID'],
  VIEWED: ['PARTIALLY_PAID', 'PAID', 'CANCELLED', 'VOID'],
  PARTIALLY_PAID: ['PAID', 'VOID'],
  PAID: ['VOID'],
  CANCELLED: [],
  VOID: [],
};

/** Statuses against which money may be recorded — an unissued invoice is not one. */
export const PAYABLE_INVOICE_STATUSES: readonly StoredInvoiceStatus[] = [
  'ISSUED',
  'SENT',
  'VIEWED',
  'PARTIALLY_PAID',
  'PAID',
];

/** True once an invoice is settled or written off, so it stops chasing a due date. */
export const isInvoiceClosed = (status: StoredInvoiceStatus): boolean =>
  status === 'PAID' || status === 'CANCELLED' || status === 'VOID' || status === 'DRAFT';

/** Visual tone for a status badge. Never colour alone — the label always shows. */
export type StatusTone = 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger';

export const STATUS_TONES: Record<QuotationStatus | InvoiceStatus, StatusTone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  VIEWED: 'info',
  ISSUED: 'progress',
  ACCEPTED: 'success',
  CONVERTED: 'success',
  PAID: 'success',
  PARTIALLY_PAID: 'progress',
  DECLINED: 'danger',
  EXPIRED: 'warning',
  OVERDUE: 'danger',
  CANCELLED: 'danger',
  VOID: 'danger',
};

export const STATUS_LABELS: Record<QuotationStatus | InvoiceStatus, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  VIEWED: 'Viewed',
  ISSUED: 'Issued',
  ACCEPTED: 'Accepted',
  CONVERTED: 'Converted',
  PAID: 'Paid',
  PARTIALLY_PAID: 'Partially paid',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled',
  VOID: 'Void',
};

/** Statuses after which an edit must record a revision with a reason. */
export const POST_DRAFT_STATUSES: readonly string[] = [
  'SENT',
  'VIEWED',
  'ISSUED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
];

export const requiresChangeReason = (status: string): boolean =>
  POST_DRAFT_STATUSES.includes(status);

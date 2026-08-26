import { Prisma } from '@prisma/client';
import type { StoredInvoiceStatus } from '@app/shared';
import { toDateOnlyString } from '@app/shared';

/**
 * What money makes an invoice.
 *
 * Decision Q2 put payment recording in an admin's hands rather than in a ledger,
 * which makes it all the more important that the *consequences* of a figure are
 * derived rather than typed. An invoice cannot be marked paid with nothing
 * received, and it cannot be shown as outstanding once it has been settled,
 * because neither is a separate field anyone can set.
 */

/** grandTotal − amountPaid, floored at zero: an overpayment is not a negative debt. */
export const outstandingOf = (invoice: {
  grandTotal: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
}): Prisma.Decimal => {
  const outstanding = invoice.grandTotal.minus(invoice.amountPaid);
  return outstanding.isNegative() ? new Prisma.Decimal(0) : outstanding;
};

/**
 * The status a recorded amount implies.
 *
 * Only ever moves within the paid/unpaid axis — an invoice that was SENT stays
 * SENT until money arrives, and returns to its issued state if the amount is
 * corrected back down to zero.
 */
export const statusForPayment = (
  current: StoredInvoiceStatus,
  grandTotal: Prisma.Decimal,
  amountPaid: Prisma.Decimal,
): StoredInvoiceStatus => {
  if (amountPaid.greaterThanOrEqualTo(grandTotal) && grandTotal.greaterThan(0)) return 'PAID';
  if (amountPaid.greaterThan(0)) return 'PARTIALLY_PAID';

  /* Back to zero: whatever it was before money was recorded, minus the payment
     statuses themselves. ISSUED is the honest resting place. */
  return current === 'PAID' || current === 'PARTIALLY_PAID' ? 'ISSUED' : current;
};

/**
 * Whether an invoice is past its due date — computed on every read, never stored,
 * so a row nobody has touched since Friday still tells the truth on Monday.
 */
export const overdueOf = (invoice: {
  status: StoredInvoiceStatus;
  dueDate: Date | null;
  grandTotal: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
}): { isOverdue: boolean; daysOverdue: number } => {
  const settled =
    invoice.status === 'PAID' ||
    invoice.status === 'CANCELLED' ||
    invoice.status === 'VOID' ||
    invoice.status === 'DRAFT';

  if (settled || !invoice.dueDate) return { isOverdue: false, daysOverdue: 0 };

  const due = toDateOnlyString(invoice.dueDate);
  const today = toDateOnlyString(new Date());
  if (due >= today) return { isOverdue: false, daysOverdue: 0 };

  const days = Math.floor(
    (Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${due}T00:00:00.000Z`)) / 86_400_000,
  );

  return { isOverdue: true, daysOverdue: days };
};

/** `days` after a date, as a date — used when a due date is derived from terms. */
export const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * 86_400_000);

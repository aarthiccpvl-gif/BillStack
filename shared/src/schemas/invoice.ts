import { z } from 'zod';
import { decimalString } from './item';
import { optionalText } from './common';
import { dateOnly, documentBase } from './document';

/**
 * Invoice input.
 *
 * The same document as a quotation with two differences that matter: it has a due
 * date rather than an expiry date, and money can be recorded against it.
 */

export const createInvoiceSchema = z
  .object({
    ...documentBase,
    /** Left out and it is derived from `paymentTermsDays` (PRD §20). */
    dueDate: dateOnly.nullable().optional(),
    /** Defaults to the customer's own terms when omitted. */
    paymentTermsDays: z.coerce.number().int().min(0).max(365).optional(),
  })
  .refine((data) => !data.dueDate || data.dueDate >= data.documentDate, {
    path: ['dueDate'],
    message: 'The due date cannot be before the invoice date',
  });

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const updateInvoiceSchema = createInvoiceSchema
  .innerType()
  .partial()
  .extend({
    changeReason: z.string().trim().max(500).optional(),
  });

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

/**
 * The statuses a user sets directly.
 *
 * Issuing, cancelling, voiding and recording payment each have their own endpoint,
 * because each does more than move a label: they stamp a time, demand a reason or
 * touch money.
 */
export const INVOICE_STATUS_ACTIONS = ['SENT', 'VIEWED'] as const;

export const invoiceStatusSchema = z.object({
  status: z.enum(INVOICE_STATUS_ACTIONS),
  reason: z.string().trim().max(255).optional(),
});

export type InvoiceStatusInput = z.infer<typeof invoiceStatusSchema>;

/**
 * Payment (decision Q2 — a recorded figure, not a ledger).
 *
 * The client sends what has been received; the server decides what that makes the
 * invoice. Sending the status as well would allow "PAID, ₹0 received", which is
 * precisely the disagreement a finance system must not be able to record.
 */
export const paymentUpdateSchema = z.object({
  amountPaid: decimalString(4, 'Amount paid'),
  paymentReference: optionalText(120),
  paidOn: dateOnly.nullable().optional(),
});

export type PaymentUpdateInput = z.infer<typeof paymentUpdateSchema>;

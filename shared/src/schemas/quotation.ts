import { z } from 'zod';
import { dateOnly, documentBase } from './document';

/**
 * Quotation input.
 *
 * Everything shared with invoices lives in `./document`; what remains here is what
 * makes a quotation a quotation — an expiry date and its own status actions.
 */

export const createQuotationSchema = z
  .object({
    ...documentBase,
    expiryDate: dateOnly.nullable().optional(),
  })
  .refine((data) => !data.expiryDate || data.expiryDate >= data.documentDate, {
    path: ['expiryDate'],
    message: 'The expiry date cannot be before the quotation date',
  });

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

/**
 * Update.
 *
 * `changeReason` is required once the document has left DRAFT — the API rejects
 * an edit to an issued document without one.
 */
export const updateQuotationSchema = createQuotationSchema
  .innerType()
  .partial()
  .extend({
    changeReason: z.string().trim().max(500).optional(),
  });

export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;

export const QUOTATION_STATUS_ACTIONS = [
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
] as const;

export const quotationStatusSchema = z.object({
  status: z.enum(QUOTATION_STATUS_ACTIONS),
  reason: z.string().trim().max(255).optional(),
});

export type QuotationStatusInput = z.infer<typeof quotationStatusSchema>;

/**
 * Conversion to an invoice.
 *
 * Everything is copied from the quotation; only the dates that belong to the
 * invoice can be chosen, because they are the two facts the quotation cannot know.
 */
export const convertQuotationSchema = z.object({
  documentDate: dateOnly.optional(),
  dueDate: dateOnly.nullable().optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).optional(),
});

export type ConvertQuotationInput = z.infer<typeof convertQuotationSchema>;

import { z } from 'zod';
import { optionalId, optionalText } from './common';
import { decimalString, hsnSacSchema } from './item';

/**
 * Quotation input.
 *
 * Note what is **absent**: `number`, `subtotal`, `taxTotal`, `grandTotal`,
 * `status`, `financialYearId` and the tax summary. They are not merely ignored —
 * they cannot be expressed, so a client cannot even attempt to set them. The
 * server derives every one of them.
 */

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');

export const DISCOUNT_MODES = ['NONE', 'PERCENT', 'AMOUNT'] as const;
export type DiscountModeInput = (typeof DISCOUNT_MODES)[number];

export const documentLineSchema = z
  .object({
    /** Set when the line came from the item master; null for an ad-hoc line. */
    itemId: optionalId,
    name: z.string().trim().min(1, 'A description is required').max(200),
    description: optionalText(2000),
    hsnSacCode: hsnSacSchema,
    unitCode: optionalText(20),
    quantity: decimalString(3, 'Quantity').refine(
      (value) => Number(value) > 0,
      'Quantity must be greater than zero',
    ),
    rate: decimalString(4, 'Rate'),
    discountMode: z.enum(DISCOUNT_MODES).default('NONE'),
    discountValue: decimalString(4, 'Discount').default('0'),
    /** One selection that expands into its component rates on the server. */
    taxGroupId: optionalId,
    isTaxExempt: z.boolean().default(false),
    exemptReason: optionalText(120),
  })
  .refine((line) => line.discountMode !== 'PERCENT' || Number(line.discountValue) <= 100, {
    path: ['discountValue'],
    message: 'A percentage discount cannot exceed 100%',
  });

export type DocumentLineInput = z.infer<typeof documentLineSchema>;

const documentBase = {
  customerId: z.coerce.number().int().positive('Choose a customer'),
  documentDate: dateOnly,
  referenceNumber: optionalText(80),
  subject: optionalText(255),

  currencyCode: z.string().trim().length(3).toUpperCase(),
  /** Captured per document so a historical figure never re-converts (decision Q3). */
  exchangeRateToBase: decimalString(8, 'Exchange rate').default('1'),

  placeOfSupplyStateCode: optionalText(4),
  billingAddressId: optionalId,
  shippingAddressId: optionalId,

  templateId: optionalId,
  bankAccountId: optionalId,
  showBankDetails: z.boolean().default(true),

  discountMode: z.enum(DISCOUNT_MODES).default('NONE'),
  discountValue: decimalString(4, 'Discount').default('0'),
  adjustment: z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .refine((value) => /^-?\d+(\.\d{1,4})?$/.test(value), 'Adjustment must be a number')
    .default('0'),
  roundOffEnabled: z.boolean().default(true),

  notes: optionalText(5000),
  terms: optionalText(5000),
  customerMessage: optionalText(2000),
  paymentInstructions: optionalText(2000),
  customFields: z
    .array(z.object({ label: z.string().trim().max(60), value: z.string().trim().max(200) }))
    .max(10)
    .default([]),

  items: z.array(documentLineSchema).min(1, 'Add at least one line'),
};

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

export const documentFiltersSchema = z.object({
  status: z.string().trim().max(20).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  currencyCode: z.string().trim().length(3).toUpperCase().optional(),
  financialYearId: z.coerce.number().int().positive().optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
  createdById: z.coerce.number().int().positive().optional(),
});

export type DocumentFilters = z.infer<typeof documentFiltersSchema>;

export const shareLinkSchema = z.object({
  /** Days until the link stops working; defaults to the configured 30 (Q9). */
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});

export type ShareLinkInput = z.infer<typeof shareLinkSchema>;

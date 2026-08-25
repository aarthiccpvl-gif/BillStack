import { z } from 'zod';

/**
 * Product / service master.
 *
 * `defaultRate` arrives as a string and stays one all the way to the database —
 * money never becomes a float, not even on a master record.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : (value ?? null)));

export const ITEM_TYPES = ['PRODUCT', 'SERVICE'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  PRODUCT: 'Product',
  SERVICE: 'Service',
};

/** A decimal string with at most `scale` decimal places, and never negative. */
export const decimalString = (scale: number, label = 'value') =>
  z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .refine((value) => value !== '', `${label} is required`)
    .refine((value) => /^\d+(\.\d+)?$/.test(value), `${label} must be a positive number`)
    .refine(
      (value) => (value.split('.')[1]?.length ?? 0) <= scale,
      `${label} allows at most ${scale} decimal places`,
    );

/** HSN codes are 4, 6 or 8 digits; SAC codes are 6. */
export const hsnSacSchema = z
  .string()
  .trim()
  .regex(/^\d{4}$|^\d{6}$|^\d{8}$/, 'HSN/SAC must be 4, 6 or 8 digits')
  .optional()
  .or(z.literal(''))
  .transform((value) => (value === '' ? null : (value ?? null)));

export const createItemSchema = z.object({
  itemCode: optionalText(40),
  name: z.string().trim().min(2, 'Name is required').max(200),
  description: optionalText(5000),
  type: z.enum(ITEM_TYPES).default('SERVICE'),
  unitId: z.coerce.number().int().positive().nullable().optional(),
  defaultRate: decimalString(4, 'Rate').default('0'),
  currencyCode: z.string().trim().length(3).toUpperCase().default('INR'),
  defaultTaxGroupId: z.coerce.number().int().positive().nullable().optional(),
  hsnSacCode: hsnSacSchema,
  categoryId: z.coerce.number().int().positive().nullable().optional(),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = createItemSchema.partial();
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const itemFiltersSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  type: z.enum(ITEM_TYPES).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
});

export type ItemFilters = z.infer<typeof itemFiltersSchema>;

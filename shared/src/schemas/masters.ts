import { z } from 'zod';
import { decimalString } from './item';

/**
 * Master data.
 *
 * Currencies, tax rates, units and the numbering format are all data rather than
 * code — that is the whole point of these tables — so each one gets a schema and
 * a management endpoint rather than living in a constants file.
 */

export const currencySchema = z.object({
  code: z.string().trim().length(3, 'Use the 3-letter ISO code').toUpperCase(),
  name: z.string().trim().min(2).max(80),
  symbol: z.string().trim().min(1).max(8),
  decimalPlaces: z.coerce.number().int().min(0).max(4).default(2),
  symbolPosition: z.enum(['PREFIX', 'SUFFIX']).default('PREFIX'),
  separatorStyle: z.enum(['WESTERN', 'INDIAN']).default('WESTERN'),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export type CurrencyInput = z.infer<typeof currencySchema>;
export const updateCurrencySchema = currencySchema.omit({ code: true }).partial();
export type UpdateCurrencyInput = z.infer<typeof updateCurrencySchema>;

export const TAX_SCOPES = ['INTRA_STATE', 'INTER_STATE', 'UNION_TERRITORY', 'NONE'] as const;

export const taxRateSchema = z.object({
  taxTypeId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2).max(80),
  rate: decimalString(4, 'Rate'),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .nullable()
    .optional(),
  effectiveTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .nullable()
    .optional(),
  isActive: z.boolean().default(true),
});

export type TaxRateInput = z.infer<typeof taxRateSchema>;
export const updateTaxRateSchema = taxRateSchema.partial();
export type UpdateTaxRateInput = z.infer<typeof updateTaxRateSchema>;

export const taxGroupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  scope: z.enum(TAX_SCOPES).default('NONE'),
  /** The component rates this group expands into on a document line. */
  taxRateIds: z.array(z.coerce.number().int().positive()).min(1, 'Choose at least one tax rate'),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export type TaxGroupInput = z.infer<typeof taxGroupSchema>;
export const updateTaxGroupSchema = taxGroupSchema.partial();
export type UpdateTaxGroupInput = z.infer<typeof updateTaxGroupSchema>;

export const unitSchema = z.object({
  code: z.string().trim().min(1).max(20).toUpperCase(),
  name: z.string().trim().min(1).max(60),
  isActive: z.boolean().default(true),
});

export type UnitInput = z.infer<typeof unitSchema>;
export const updateUnitSchema = unitSchema.omit({ code: true }).partial();

export const itemCategorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  parentId: z.coerce.number().int().positive().nullable().optional(),
});

export type ItemCategoryInput = z.infer<typeof itemCategorySchema>;

export const financialYearSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
});

export type FinancialYearInput = z.infer<typeof financialYearSchema>;

/**
 * Numbering format. The pattern is validated for tokens the formatter actually
 * understands, so a typo cannot silently produce a literal "{SEQ}" in a number.
 */
export const numberingSeriesSchema = z.object({
  prefix: z.string().trim().min(1, 'A prefix is required').max(20),
  pattern: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((value) => value.includes('{SEQ}') || /\{SEQ:\d{1,2}\}/.test(value), {
      message: 'The pattern must contain {SEQ}, otherwise every number would be identical',
    })
    .refine(
      (value) => {
        const tokens = value.match(/\{[^}]+\}/g) ?? [];
        const known = new Set([
          '{PREFIX}',
          '{SEQ}',
          '{FY_LONG}',
          '{FY_FULL}',
          '{FY_SHORT}',
          '{FY_START}',
          '{FY_END}',
          '{YYYY}',
          '{YY}',
          '{MM}',
        ]);
        return tokens.every((token) => known.has(token) || /^\{SEQ:\d{1,2}\}$/.test(token));
      },
      { message: 'The pattern contains a token this system does not recognise' },
    ),
  padding: z.coerce.number().int().min(1).max(10).default(3),
  startNumber: z.coerce.number().int().min(1).default(1),
  resetPolicy: z.enum(['FINANCIAL_YEAR', 'NEVER']).default('FINANCIAL_YEAR'),
  isActive: z.boolean().default(true),
});

export type NumberingSeriesInput = z.infer<typeof numberingSeriesSchema>;
export const updateNumberingSeriesSchema = numberingSeriesSchema.partial();
export type UpdateNumberingSeriesInput = z.infer<typeof updateNumberingSeriesSchema>;

export const exchangeRateSchema = z.object({
  fromCurrency: z.string().trim().length(3).toUpperCase(),
  toCurrency: z.string().trim().length(3).toUpperCase(),
  rate: decimalString(8, 'Rate'),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
});

export type ExchangeRateInput = z.infer<typeof exchangeRateSchema>;

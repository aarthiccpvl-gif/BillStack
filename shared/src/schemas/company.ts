import { z } from 'zod';

/**
 * Company profile and branding.
 *
 * Every field is optional on update so the settings screen can save one tab at a
 * time, but the values that documents depend on — company name, state code —
 * are validated whenever they are present.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : (value ?? null)));

/** 15 characters: 2 state + 10 PAN + 1 entity + 1 'Z' + 1 checksum. */
export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    'That is not a valid 15-character GSTIN',
  );

export const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'That is not a valid 10-character PAN');

export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex colour such as #0F5477');

export const updateCompanySchema = z.object({
  companyName: z.string().trim().min(2, 'Company name is required').max(200).optional(),
  legalName: optionalText(200),
  addressLine1: optionalText(255),
  addressLine2: optionalText(255),
  city: optionalText(100),
  state: optionalText(100),
  /** Drives the CGST+SGST vs IGST decision, so it is worth getting right. */
  stateCode: z
    .string()
    .trim()
    .max(4)
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : (value ?? null))),
  country: optionalText(100),
  postalCode: optionalText(20),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .email('Enter a valid email address')
    .max(190)
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : (value ?? null))),
  website: optionalText(190),
  gstin: gstinSchema
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : (v ?? null))),
  pan: panSchema
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : (v ?? null))),
  cin: optionalText(30),
  primaryColor: hexColorSchema.optional(),
  secondaryColor: hexColorSchema.optional(),
  /* NOT NULL columns with defaults: optional to send, but never null. */
  defaultFont: z.string().trim().min(1).max(60).optional(),
  signatureLabel: optionalText(120),
  baseCurrencyCode: z.string().trim().length(3).toUpperCase().optional(),
  financialYearStartMonth: z.coerce.number().int().min(1).max(12).optional(),
  defaultTermsInvoice: optionalText(5000),
  defaultTermsQuotation: optionalText(5000),
  defaultNotes: optionalText(5000),
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const bankAccountSchema = z.object({
  bankName: z.string().trim().min(2, 'Bank name is required').max(150),
  accountName: z.string().trim().min(2, 'Account name is required').max(150),
  accountNumber: z.string().trim().min(4, 'Account number is required').max(60),
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'That is not a valid IFSC code')
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : (value ?? null))),
  swift: optionalText(20),
  branch: optionalText(150),
  /** Set when an account should only be offered for one currency. */
  currencyCode: z
    .string()
    .trim()
    .length(3)
    .toUpperCase()
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : (value ?? null))),
  paymentInstructions: optionalText(2000),
  isDefault: z.boolean().default(false),
});

export type BankAccountInput = z.infer<typeof bankAccountSchema>;

export const updateBankAccountSchema = bankAccountSchema.partial();
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;

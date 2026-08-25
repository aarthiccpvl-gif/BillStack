import { z } from 'zod';
import { gstinSchema, panSchema } from './company';

/**
 * Customer master.
 *
 * Note what is deliberately absent from the create payload: `customerCode` is
 * optional, and when omitted the backend allocates it from the same numbering
 * mechanism documents use — the client never invents an identifier.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : (value ?? null)));

export const TAX_TREATMENTS = [
  'REGISTERED',
  'UNREGISTERED',
  'COMPOSITION',
  'OVERSEAS',
  'SEZ',
] as const;

export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

export const TAX_TREATMENT_LABELS: Record<TaxTreatment, string> = {
  REGISTERED: 'Registered business',
  UNREGISTERED: 'Unregistered business',
  COMPOSITION: 'Composition scheme',
  OVERSEAS: 'Overseas (export)',
  SEZ: 'SEZ',
};

export const ADDRESS_TYPES = ['BILLING', 'SHIPPING', 'OTHER'] as const;

export const customerAddressSchema = z.object({
  type: z.enum(ADDRESS_TYPES),
  label: optionalText(60),
  line1: optionalText(255),
  line2: optionalText(255),
  city: optionalText(100),
  state: optionalText(100),
  stateCode: optionalText(4),
  country: optionalText(100),
  postalCode: optionalText(20),
  isDefault: z.boolean().default(false),
});

export type CustomerAddressInput = z.infer<typeof customerAddressSchema>;

export const customerContactSchema = z.object({
  name: z.string().trim().min(2, 'Contact name is required').max(150),
  designation: optionalText(100),
  email: z
    .string()
    .trim()
    .email('Enter a valid email address')
    .max(190)
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : (value ?? null))),
  phone: optionalText(40),
  isPrimary: z.boolean().default(false),
});

export type CustomerContactInput = z.infer<typeof customerContactSchema>;

export const createCustomerSchema = z
  .object({
    /** Omit to have the backend allocate the next code. */
    customerCode: optionalText(40),
    name: z.string().trim().min(2, 'Customer name is required').max(200),
    companyName: optionalText(200),
    contactPerson: optionalText(150),
    email: z
      .string()
      .trim()
      .email('Enter a valid email address')
      .max(190)
      .optional()
      .or(z.literal(''))
      .transform((value) => (value === '' ? null : (value ?? null))),
    phone: optionalText(40),
    altPhone: optionalText(40),
    gstin: gstinSchema
      .optional()
      .or(z.literal(''))
      .transform((v) => (v === '' ? null : (v ?? null))),
    pan: panSchema
      .optional()
      .or(z.literal(''))
      .transform((v) => (v === '' ? null : (v ?? null))),
    otherTaxId: optionalText(40),
    taxTreatment: z.enum(TAX_TREATMENTS).default('REGISTERED'),
    placeOfSupplyStateCode: optionalText(4),
    defaultCurrencyCode: z.string().trim().length(3).toUpperCase().default('INR'),
    paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
    notes: optionalText(5000),
    addresses: z.array(customerAddressSchema).max(10).default([]),
    contacts: z.array(customerContactSchema).max(10).default([]),
  })
  .refine((data) => data.taxTreatment !== 'REGISTERED' || data.gstin !== null, {
    path: ['gstin'],
    message: 'A registered business needs a GSTIN',
  });

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

/* Partial for PATCH. The refine above cannot apply to a partial update, so the
   same rule is enforced in the service against the merged record. */
export const updateCustomerSchema = createCustomerSchema.innerType().partial();

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const customerFiltersSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  currencyCode: z.string().trim().length(3).toUpperCase().optional(),
  taxTreatment: z.enum(TAX_TREATMENTS).optional(),
});

export type CustomerFilters = z.infer<typeof customerFiltersSchema>;

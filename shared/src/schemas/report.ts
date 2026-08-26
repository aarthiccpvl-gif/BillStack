import { z } from 'zod';
import { dateOnly } from './document';

/**
 * Reports and exports.
 *
 * One filter shape for both: the export endpoints take exactly the same query the
 * report endpoint takes, which is what makes "the export contains what the screen
 * showed" a property of the design rather than a promise in a comment.
 */

export const REPORT_KINDS = ['quotations', 'invoices', 'customers', 'summary'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const EXPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const reportFiltersSchema = z.object({
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
  financialYearId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  currencyCode: z.string().trim().length(3).toUpperCase().optional(),
  status: z.string().trim().max(20).optional(),
  createdById: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(120).optional(),
  /** Invoices only: just the ones with something still owed. */
  outstandingOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export const exportQuerySchema = reportFiltersSchema.extend({
  format: z.enum(EXPORT_FORMATS).default('csv'),
});

export type ExportQuery = z.infer<typeof exportQuerySchema>;

/** Audit log filters — the same idea, over a different table. */
export const auditFiltersSchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  action: z.string().trim().max(40).optional(),
  entityType: z.string().trim().max(20).optional(),
  entityId: z.string().regex(/^\d+$/).optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
  search: z.string().trim().max(120).optional(),
});

export type AuditFilters = z.infer<typeof auditFiltersSchema>;

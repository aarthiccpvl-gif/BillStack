import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  REPORT_KINDS,
  auditFiltersSchema,
  exportQuerySchema,
  paginationQuerySchema,
  reportFiltersSchema,
} from '@app/shared';
import { asyncHandler, paginationMeta, sendSuccess } from '../../utils/http';
import {
  parsedParams,
  parsedQuery,
  validateParams,
  validateQuery,
} from '../../middleware/validate';
import { requirePermission } from '../../middleware/authorize';
import { runReport } from './reports.service';
import { streamCsv, streamReportPdf, streamXlsx } from './export.service';
import { getAuditEntry, listAuditLogs, listForEntity } from '../audit/audit-log.service';

/**
 * Reports, exports and the audit trail.
 *
 * Everything here is a read, so a Finance Viewer reaches all of it — which is the
 * point: their job is to look at the book and take copies away.
 */
export const reportsRouter = Router();

const kindParamSchema = z.object({ kind: z.enum(REPORT_KINDS) });

reportsRouter.get(
  '/:kind',
  requirePermission(PERMISSIONS.REPORT_READ),
  validateParams(kindParamSchema),
  validateQuery(reportFiltersSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const { kind } = parsedParams(res, kindParamSchema);
    sendSuccess(res, await runReport(kind, parsedQuery(res, reportFiltersSchema)));
  }),
);

/* --- exports -------------------------------------------------------------- */

export const exportsRouter = Router();

/** Includes `audit`, which is a report definition like any other. */
const exportKindSchema = z.object({
  kind: z.enum([...REPORT_KINDS, 'audit'] as const),
});

exportsRouter.get(
  '/:kind',
  requirePermission(PERMISSIONS.REPORT_EXPORT),
  validateParams(exportKindSchema),
  validateQuery(exportQuerySchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const { kind } = parsedParams(res, exportKindSchema);
    const { format, ...filters } = parsedQuery(res, exportQuerySchema);

    if (format === 'xlsx') return streamXlsx(kind, filters, res);
    if (format === 'pdf') return streamReportPdf(kind, filters, res);
    return streamCsv(kind, filters, res);
  }),
);

/* --- audit trail ---------------------------------------------------------- */

export const auditRouter = Router();

const auditListSchema = paginationQuerySchema.merge(auditFiltersSchema);

auditRouter.get(
  '/',
  requirePermission(PERMISSIONS.AUDIT_READ),
  validateQuery(auditListSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const query = parsedQuery(res, auditListSchema);
    const { items, total } = await listAuditLogs(query);
    sendSuccess(res, items, { meta: paginationMeta(query.page, query.pageSize, total) });
  }),
);

const entryParamSchema = z.object({ id: z.string().regex(/^\d+$/) });

auditRouter.get(
  '/entry/:id',
  requirePermission(PERMISSIONS.AUDIT_READ),
  validateParams(entryParamSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await getAuditEntry(parsedParams(res, entryParamSchema).id));
  }),
);

const entityParamSchema = z.object({
  entityType: z.string().trim().max(20),
  entityId: z.string().regex(/^\d+$/),
});

/** Everything ever recorded about one document — the story of that record. */
auditRouter.get(
  '/:entityType/:entityId',
  requirePermission(PERMISSIONS.AUDIT_READ),
  validateParams(entityParamSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const { entityType, entityId } = parsedParams(res, entityParamSchema);
    sendSuccess(res, await listForEntity(entityType.toUpperCase(), entityId));
  }),
);

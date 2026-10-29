import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@app/shared';
import { asyncHandler, sendSuccess } from '../../utils/http';
import { parsedQuery, validateQuery } from '../../middleware/validate';
import { getAuth } from '../../middleware/authenticate';
import { authenticatedOnly, requirePermission } from '../../middleware/authorize';
import * as service from './dashboard.service';
import { search } from './search.service';

/**
 * The dashboard and global search.
 *
 * Every route here is a read, which is why a Finance Viewer reaches all of them —
 * this is the surface their whole job runs on.
 */
export const dashboardRouter = Router();

/** `financialYearId=all` is explicit; omitting it keeps the current year. */
const financialYearSelectionSchema = z.object({
  financialYearId: z.union([z.literal('all'), z.coerce.number().int().positive()]).optional(),
});

const selectionOf = (query: { financialYearId?: 'all' | number }) =>
  query.financialYearId === 'all' ? ('ALL' as const) : query.financialYearId;

dashboardRouter.get(
  '/summary',
  requirePermission(PERMISSIONS.DASHBOARD_READ),
  validateQuery(financialYearSelectionSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const query = parsedQuery(res, financialYearSelectionSchema);
    sendSuccess(res, await service.getSummary(selectionOf(query)));
  }),
);

const chartQuerySchema = financialYearSelectionSchema.extend({
  range: z.enum(['FY', '12M']).default('FY'),
});

dashboardRouter.get(
  '/charts',
  requirePermission(PERMISSIONS.DASHBOARD_READ),
  validateQuery(chartQuerySchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const query = parsedQuery(res, chartQuerySchema);
    sendSuccess(res, await service.getCharts(query.range, selectionOf(query)));
  }),
);

const recentQuerySchema = financialYearSelectionSchema.extend({
  limit: z.coerce.number().int().min(1).max(25).default(8),
});

dashboardRouter.get(
  '/recent-documents',
  requirePermission(PERMISSIONS.DASHBOARD_READ),
  validateQuery(recentQuerySchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const query = parsedQuery(res, recentQuerySchema);
    sendSuccess(res, await service.getRecentDocuments(query.limit, selectionOf(query)));
  }),
);

/* --- search --------------------------------------------------------------- */

export const searchRouter = Router();

const searchQuerySchema = z.object({ q: z.string().trim().max(120).default('') });

/**
 * Any signed-in user may search; what they find is filtered by what they may read,
 * inside the service. Guarding the route on a single permission would be wrong —
 * a role that can read customers but not items should still get customers.
 */
searchRouter.get(
  '/',
  authenticatedOnly(),
  validateQuery(searchQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { q } = parsedQuery(res, searchQuerySchema);
    sendSuccess(res, await search(q, auth.permissions));
  }),
);

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

dashboardRouter.get(
  '/summary',
  requirePermission(PERMISSIONS.DASHBOARD_READ),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.getSummary());
  }),
);

const chartQuerySchema = z.object({ range: z.enum(['FY', '12M']).default('FY') });

dashboardRouter.get(
  '/charts',
  requirePermission(PERMISSIONS.DASHBOARD_READ),
  validateQuery(chartQuerySchema),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.getCharts(parsedQuery(res, chartQuerySchema).range));
  }),
);

const recentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(8),
});

dashboardRouter.get(
  '/recent-documents',
  requirePermission(PERMISSIONS.DASHBOARD_READ),
  validateQuery(recentQuerySchema),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.getRecentDocuments(parsedQuery(res, recentQuerySchema).limit));
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

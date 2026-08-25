import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  createItemSchema,
  idParamSchema,
  itemFiltersSchema,
  paginationQuerySchema,
  updateItemSchema,
} from '@app/shared';
import { asyncHandler, paginationMeta, sendSuccess } from '../../utils/http';
import {
  parsedBody,
  parsedParams,
  parsedQuery,
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate';
import { getAuth } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import * as service from './items.service';

export const itemsRouter = Router();

const listQuerySchema = paginationQuerySchema.merge(itemFiltersSchema);

itemsRouter.get(
  '/',
  requirePermission(PERMISSIONS.ITEM_READ),
  validateQuery(listQuerySchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const query = parsedQuery(res, listQuerySchema);
    const { items, total } = await service.listItems(query);
    sendSuccess(res, items, { meta: paginationMeta(query.page, query.pageSize, total) });
  }),
);

itemsRouter.post(
  '/',
  requirePermission(PERMISSIONS.ITEM_CREATE),
  validateBody(createItemSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    sendSuccess(res, await service.createItem(parsedBody(req, createItemSchema), auth.userId), {
      status: 201,
    });
  }),
);

itemsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.ITEM_READ),
  validateParams(idParamSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.getItem(parsedParams(res, idParamSchema).id));
  }),
);

itemsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.ITEM_UPDATE),
  validateParams(idParamSchema),
  validateBody(updateItemSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parsedParams(res, idParamSchema);
    sendSuccess(res, await service.updateItem(id, parsedBody(req, updateItemSchema)));
  }),
);

const archiveSchema = z.object({ archive: z.boolean().default(true) });

itemsRouter.post(
  '/:id/archive',
  requirePermission(PERMISSIONS.ITEM_ARCHIVE),
  validateParams(idParamSchema),
  validateBody(archiveSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parsedParams(res, idParamSchema);
    const { archive } = parsedBody(req, archiveSchema);
    sendSuccess(res, await service.archiveItem(id, archive));
  }),
);

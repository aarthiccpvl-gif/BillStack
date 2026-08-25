import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  createCustomerSchema,
  customerFiltersSchema,
  idParamSchema,
  paginationQuerySchema,
  updateCustomerSchema,
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
import * as service from './customers.service';

export const customersRouter = Router();

const listQuerySchema = paginationQuerySchema.merge(customerFiltersSchema);

customersRouter.get(
  '/',
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validateQuery(listQuerySchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const query = parsedQuery(res, listQuerySchema);
    const { items, total } = await service.listCustomers(query);
    sendSuccess(res, items, { meta: paginationMeta(query.page, query.pageSize, total) });
  }),
);

customersRouter.post(
  '/',
  requirePermission(PERMISSIONS.CUSTOMER_CREATE),
  validateBody(createCustomerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    sendSuccess(
      res,
      await service.createCustomer(parsedBody(req, createCustomerSchema), auth.userId),
      {
        status: 201,
      },
    );
  }),
);

customersRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validateParams(idParamSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.getCustomer(parsedParams(res, idParamSchema).id));
  }),
);

customersRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMER_UPDATE),
  validateParams(idParamSchema),
  validateBody(updateCustomerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parsedParams(res, idParamSchema);
    sendSuccess(res, await service.updateCustomer(id, parsedBody(req, updateCustomerSchema)));
  }),
);

const archiveSchema = z.object({ archive: z.boolean().default(true) });

customersRouter.post(
  '/:id/archive',
  requirePermission(PERMISSIONS.CUSTOMER_ARCHIVE),
  validateParams(idParamSchema),
  validateBody(archiveSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parsedParams(res, idParamSchema);
    const { archive } = parsedBody(req, archiveSchema);
    sendSuccess(res, await service.archiveCustomer(id, archive));
  }),
);

customersRouter.get(
  '/:id/summary',
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validateParams(idParamSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.getCustomerSummary(parsedParams(res, idParamSchema).id));
  }),
);

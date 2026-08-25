import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  createUserSchema,
  idParamSchema,
  paginationQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
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
import * as service from './users.service';

export const usersRouter = Router();

usersRouter.get(
  '/',
  requirePermission(PERMISSIONS.USER_READ),
  validateQuery(paginationQuerySchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const query = parsedQuery(res, paginationQuerySchema);
    const { items, total } = await service.listUsers(query);
    sendSuccess(res, items, { meta: paginationMeta(query.page, query.pageSize, total) });
  }),
);

usersRouter.post(
  '/',
  requirePermission(PERMISSIONS.USER_CREATE),
  validateBody(createUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const user = await service.createUser(parsedBody(req, createUserSchema), auth.userId);
    sendSuccess(res, user, { status: 201 });
  }),
);

usersRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.USER_READ),
  validateParams(idParamSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.getUser(parsedParams(res, idParamSchema).id));
  }),
);

usersRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.USER_UPDATE),
  validateParams(idParamSchema),
  validateBody(updateUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parsedParams(res, idParamSchema);
    sendSuccess(res, await service.updateUser(id, parsedBody(req, updateUserSchema)));
  }),
);

usersRouter.post(
  '/:id/reset-password',
  requirePermission(PERMISSIONS.USER_UPDATE),
  validateParams(idParamSchema),
  validateBody(resetPasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parsedParams(res, idParamSchema);
    await service.resetPassword(id, parsedBody(req, resetPasswordSchema));
    sendSuccess(res, { passwordReset: true });
  }),
);

// ------------------------------------------------------------------ roles ---

export const rolesRouter = Router();

rolesRouter.get(
  '/',
  requirePermission(PERMISSIONS.ROLE_READ),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.listRoles());
  }),
);

const updateRolePermissionsSchema = z.object({
  permissions: z
    .array(z.enum(ALL_PERMISSIONS as [string, ...string[]]))
    .max(ALL_PERMISSIONS.length),
});

rolesRouter.patch(
  '/:id/permissions',
  requirePermission(PERMISSIONS.ROLE_UPDATE),
  validateParams(idParamSchema),
  validateBody(updateRolePermissionsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parsedParams(res, idParamSchema);
    const body = parsedBody(req, updateRolePermissionsSchema);
    sendSuccess(
      res,
      await service.updateRolePermissions(
        id,
        body.permissions as Parameters<typeof service.updateRolePermissions>[1],
      ),
    );
  }),
);

// ------------------------------------------------------------ permissions ---

export const permissionsRouter = Router();

permissionsRouter.get(
  '/',
  requirePermission(PERMISSIONS.ROLE_READ),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.listPermissions());
  }),
);

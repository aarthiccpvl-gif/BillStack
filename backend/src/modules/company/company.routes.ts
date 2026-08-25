import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  bankAccountSchema,
  idParamSchema,
  updateBankAccountSchema,
  updateCompanySchema,
} from '@app/shared';
import { asyncHandler, sendSuccess } from '../../utils/http';
import { parsedBody, parsedParams, validateBody, validateParams } from '../../middleware/validate';
import { getAuth } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { IMAGE_RULES, singleFile, validateUpload } from '../../middleware/upload';
import { env } from '../../config/env';
import * as service from './company.service';

export const companyRouter = Router();

companyRouter.get(
  '/',
  requirePermission(PERMISSIONS.COMPANY_READ),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.getCompany());
  }),
);

companyRouter.patch(
  '/',
  requirePermission(PERMISSIONS.COMPANY_UPDATE),
  validateBody(updateCompanySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    sendSuccess(
      res,
      await service.updateCompany(parsedBody(req, updateCompanySchema), auth.userId),
    );
  }),
);

/* --- branding assets: logo, favicon, signature, seal (decision Q13) --- */

const assetParamSchema = z.object({
  kind: z.enum(['logo', 'favicon', 'signature', 'seal']),
});

companyRouter.post(
  '/assets/:kind',
  requirePermission(PERMISSIONS.COMPANY_UPDATE),
  validateParams(assetParamSchema),
  singleFile('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { kind } = parsedParams(res, assetParamSchema);
    const file = validateUpload(req.file, IMAGE_RULES, env.UPLOAD_MAX_MB);
    sendSuccess(res, await service.setCompanyAsset(kind, file, auth.userId));
  }),
);

companyRouter.delete(
  '/assets/:kind',
  requirePermission(PERMISSIONS.COMPANY_UPDATE),
  validateParams(assetParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { kind } = parsedParams(res, assetParamSchema);
    sendSuccess(res, await service.removeCompanyAsset(kind, auth.userId));
  }),
);

/* --- bank accounts --- */

companyRouter.get(
  '/bank-accounts',
  requirePermission(PERMISSIONS.COMPANY_READ),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.listBankAccounts());
  }),
);

companyRouter.post(
  '/bank-accounts',
  requirePermission(PERMISSIONS.COMPANY_UPDATE),
  validateBody(bankAccountSchema),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await service.createBankAccount(parsedBody(req, bankAccountSchema)), {
      status: 201,
    });
  }),
);

companyRouter.patch(
  '/bank-accounts/:id',
  requirePermission(PERMISSIONS.COMPANY_UPDATE),
  validateParams(idParamSchema),
  validateBody(updateBankAccountSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parsedParams(res, idParamSchema);
    sendSuccess(res, await service.updateBankAccount(id, parsedBody(req, updateBankAccountSchema)));
  }),
);

companyRouter.delete(
  '/bank-accounts/:id',
  requirePermission(PERMISSIONS.COMPANY_UPDATE),
  validateParams(idParamSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const { id } = parsedParams(res, idParamSchema);
    await service.archiveBankAccount(id);
    sendSuccess(res, { archived: true });
  }),
);

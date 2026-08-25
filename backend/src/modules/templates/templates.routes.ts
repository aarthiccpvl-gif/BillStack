import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { PERMISSIONS, idParamSchema, templateConfigSchema } from '@app/shared';
import { asyncHandler, sendSuccess } from '../../utils/http';
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
import * as service from './templates.service';

export const templatesRouter = Router();

const docTypeSchema = z.enum(['QUOTATION', 'INVOICE']);

templatesRouter.get(
  '/',
  requirePermission(PERMISSIONS.TEMPLATE_READ),
  validateQuery(z.object({ docType: docTypeSchema.optional() })),
  asyncHandler(async (_req: Request, res: Response) => {
    const { docType } = parsedQuery(res, z.object({ docType: docTypeSchema.optional() }));
    sendSuccess(res, await service.listTemplates(docType));
  }),
);

templatesRouter.get(
  '/layouts',
  requirePermission(PERMISSIONS.TEMPLATE_READ),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, service.availableLayouts());
  }),
);

/**
 * Preview.
 *
 * A read operation — it renders sample figures and writes nothing — so the
 * Finance Viewer can use it too. It accepts either a saved version or an unsaved
 * config from the editor, which is what makes the live preview possible.
 */
const previewSchema = z.object({
  templateId: z.coerce.number().int().positive().optional(),
  version: z.coerce.number().int().positive().optional(),
  engineKey: z.string().trim().max(40).optional(),
  config: z.unknown().optional(),
  docType: docTypeSchema,
  lineCount: z.coerce.number().int().min(1).max(60).optional(),
});

templatesRouter.post(
  '/preview',
  requirePermission(PERMISSIONS.TEMPLATE_READ),
  validateBody(previewSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const input = parsedBody(req, previewSchema);
    const html = await service.previewHtml(input);
    res.type('html').send(html);
  }),
);

templatesRouter.post(
  '/preview.pdf',
  requirePermission(PERMISSIONS.TEMPLATE_READ),
  validateBody(previewSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const input = parsedBody(req, previewSchema);
    const pdf = await service.previewPdf(input);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(pdf.byteLength));
    res.setHeader('Content-Disposition', 'inline; filename="template-preview.pdf"');
    res.end(pdf);
  }),
);

templatesRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.TEMPLATE_READ),
  validateParams(idParamSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.getTemplate(parsedParams(res, idParamSchema).id));
  }),
);

const versionParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  version: z.coerce.number().int().positive(),
});

templatesRouter.get(
  '/:id/versions/:version/config',
  requirePermission(PERMISSIONS.TEMPLATE_READ),
  validateParams(versionParamSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const { id, version } = parsedParams(res, versionParamSchema);
    sendSuccess(res, await service.getVersionConfig(id, version));
  }),
);

const createTemplateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  docType: docTypeSchema,
  engineKey: z.string().trim().min(1).max(40),
  description: z.string().trim().max(255).optional().nullable(),
});

templatesRouter.post(
  '/',
  requirePermission(PERMISSIONS.TEMPLATE_CREATE),
  validateBody(createTemplateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    sendSuccess(
      res,
      await service.createTemplate(parsedBody(req, createTemplateSchema), auth.userId),
      {
        status: 201,
      },
    );
  }),
);

templatesRouter.post(
  '/:id/duplicate',
  requirePermission(PERMISSIONS.TEMPLATE_CREATE),
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { id } = parsedParams(res, idParamSchema);
    sendSuccess(res, await service.duplicateTemplate(id, auth.userId), { status: 201 });
  }),
);

templatesRouter.post(
  '/:id/set-default',
  requirePermission(PERMISSIONS.TEMPLATE_UPDATE),
  validateParams(idParamSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const { id } = parsedParams(res, idParamSchema);
    sendSuccess(res, await service.setDefaultTemplate(id));
  }),
);

const draftSchema = z.object({ changeNote: z.string().trim().max(255).optional().nullable() });

templatesRouter.post(
  '/:id/versions',
  requirePermission(PERMISSIONS.TEMPLATE_UPDATE),
  validateParams(idParamSchema),
  validateBody(draftSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { id } = parsedParams(res, idParamSchema);
    const { changeNote } = parsedBody(req, draftSchema);
    sendSuccess(res, await service.createDraftVersion(id, auth.userId, changeNote), {
      status: 201,
    });
  }),
);

templatesRouter.patch(
  '/:id/versions/:version',
  requirePermission(PERMISSIONS.TEMPLATE_UPDATE),
  validateParams(versionParamSchema),
  validateBody(templateConfigSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id, version } = parsedParams(res, versionParamSchema);
    sendSuccess(res, await service.updateVersionConfig(id, version, req.body));
  }),
);

templatesRouter.post(
  '/:id/versions/:version/publish',
  requirePermission(PERMISSIONS.TEMPLATE_PUBLISH),
  validateParams(versionParamSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const { id, version } = parsedParams(res, versionParamSchema);
    sendSuccess(res, await service.publishVersion(id, version));
  }),
);

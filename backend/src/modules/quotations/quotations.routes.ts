import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  createQuotationSchema,
  documentFiltersSchema,
  documentIdParamSchema,
  paginationQuerySchema,
  quotationStatusSchema,
  shareLinkSchema,
  updateQuotationSchema,
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
import { recordAudit } from '../../services/audit.service';
import { createShareLink, listShareLinks, revokeShareLink } from '../../services/share.service';
import { getStorage } from '../../storage/storage.service';
import * as service from './quotations.service';
import * as lifecycle from './quotations.lifecycle';

export const quotationsRouter = Router();

const listQuerySchema = paginationQuerySchema.merge(documentFiltersSchema);

quotationsRouter.get(
  '/',
  requirePermission(PERMISSIONS.QUOTATION_READ),
  validateQuery(listQuerySchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const query = parsedQuery(res, listQuerySchema);
    const { items, total } = await service.listQuotations(query);
    sendSuccess(res, items, { meta: paginationMeta(query.page, query.pageSize, total) });
  }),
);

quotationsRouter.post(
  '/',
  requirePermission(PERMISSIONS.QUOTATION_CREATE),
  validateBody(createQuotationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const created = await service.createQuotation(parsedBody(req, createQuotationSchema), auth.userId);
    sendSuccess(res, created, { status: 201 });
  }),
);

const idParam = documentIdParamSchema;
const idOf = (res: Response): bigint => BigInt(parsedParams(res, idParam).id);

quotationsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.QUOTATION_READ),
  validateParams(idParam),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.getQuotation(idOf(res)));
  }),
);

quotationsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.QUOTATION_UPDATE),
  validateParams(idParam),
  validateBody(updateQuotationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    sendSuccess(
      res,
      await service.updateQuotation(idOf(res), parsedBody(req, updateQuotationSchema), auth.userId),
    );
  }),
);

quotationsRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.QUOTATION_DELETE),
  validateParams(idParam),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    await lifecycle.deleteDraft(idOf(res), auth.userId);
    sendSuccess(res, { deleted: true });
  }),
);

quotationsRouter.post(
  '/:id/status',
  requirePermission(PERMISSIONS.QUOTATION_UPDATE_STATUS),
  validateParams(idParam),
  validateBody(quotationStatusSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    sendSuccess(
      res,
      await lifecycle.changeStatus(idOf(res), parsedBody(req, quotationStatusSchema), auth.userId),
    );
  }),
);

quotationsRouter.post(
  '/:id/duplicate',
  requirePermission(PERMISSIONS.QUOTATION_CREATE),
  validateParams(idParam),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    sendSuccess(res, await lifecycle.duplicateQuotation(idOf(res), auth.userId), { status: 201 });
  }),
);

/* --- rendering ---------------------------------------------------------- */

quotationsRouter.get(
  '/:id/preview',
  requirePermission(PERMISSIONS.QUOTATION_READ),
  validateParams(idParam),
  asyncHandler(async (_req: Request, res: Response) => {
    res.type('html').send(await lifecycle.previewQuotationHtml(idOf(res)));
  }),
);

quotationsRouter.post(
  '/:id/pdf',
  requirePermission(PERMISSIONS.QUOTATION_READ),
  validateParams(idParam),
  validateQuery(z.object({ force: z.enum(['true', 'false']).optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const force = parsedQuery(res, z.object({ force: z.enum(['true', 'false']).optional() }));
    sendSuccess(res, await lifecycle.generatePdf(idOf(res), auth.userId, force.force === 'true'));
  }),
);

quotationsRouter.get(
  '/:id/pdf',
  requirePermission(PERMISSIONS.QUOTATION_DOWNLOAD),
  validateParams(idParam),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const id = idOf(res);

    const pdf = await lifecycle.generatePdf(id, auth.userId);
    const quotation = await service.findQuotation(id);

    await recordAudit({
      action: 'DOCUMENT_DOWNLOADED',
      entityType: 'QUOTATION',
      entityId: id,
      entityLabel: quotation.number,
      metadata: { fileName: pdf.fileName, documentVersion: quotation.currentVersion },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(pdf.sizeBytes));
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.fileName}"`);

    const stream = await getStorage().getStream(pdf.storageKey);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }),
);

/* --- history ------------------------------------------------------------ */

quotationsRouter.get(
  '/:id/history',
  requirePermission(PERMISSIONS.QUOTATION_READ),
  validateParams(idParam),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await lifecycle.listRevisions(idOf(res)));
  }),
);

quotationsRouter.get(
  '/:id/versions/:version',
  requirePermission(PERMISSIONS.QUOTATION_READ),
  validateParams(idParam.extend({ version: z.coerce.number().int().positive() })),
  asyncHandler(async (_req: Request, res: Response) => {
    const params = parsedParams(
      res,
      idParam.extend({ version: z.coerce.number().int().positive() }),
    );
    sendSuccess(res, await lifecycle.getRevisionSnapshot(BigInt(params.id), params.version));
  }),
);

/* --- sharing (decision Q14: link and download, never email) -------------- */

quotationsRouter.get(
  '/:id/share-links',
  requirePermission(PERMISSIONS.QUOTATION_READ),
  validateParams(idParam),
  asyncHandler(async (_req: Request, res: Response) => {
    const id = idOf(res);
    const quotation = await service.findQuotation(id);
    sendSuccess(res, await listShareLinks('QUOTATION', id, quotation.number));
  }),
);

quotationsRouter.post(
  '/:id/share-links',
  requirePermission(PERMISSIONS.QUOTATION_SHARE),
  validateParams(idParam),
  validateBody(shareLinkSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const id = idOf(res);
    const quotation = await service.findQuotation(id);
    const { expiresInDays } = parsedBody(req, shareLinkSchema);

    /* The link streams a stored PDF, so make sure one exists first. */
    await lifecycle.generatePdf(id, auth.userId);

    sendSuccess(
      res,
      await createShareLink('QUOTATION', id, quotation.number, auth.userId, expiresInDays),
      { status: 201 },
    );
  }),
);

quotationsRouter.delete(
  '/:id/share-links/:shareId',
  requirePermission(PERMISSIONS.QUOTATION_SHARE),
  validateParams(idParam.extend({ shareId: z.string().regex(/^\d+$/) })),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const params = parsedParams(res, idParam.extend({ shareId: z.string().regex(/^\d+$/) }));
    await revokeShareLink(BigInt(params.shareId), auth.userId);
    sendSuccess(res, { revoked: true });
  }),
);

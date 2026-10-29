import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  createInvoiceSchema,
  documentFiltersSchema,
  documentIdParamSchema,
  invoiceStatusSchema,
  paginationQuerySchema,
  paymentUpdateSchema,
  requiredReasonSchema,
  shareLinkSchema,
  updateInvoiceSchema,
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
import { registerAttachmentRoutes } from '../documents/attachments.routes';
import * as service from './invoices.service';
import * as lifecycle from './invoices.lifecycle';

export const invoicesRouter = Router();

const listQuerySchema = paginationQuerySchema.merge(documentFiltersSchema);

invoicesRouter.get(
  '/',
  requirePermission(PERMISSIONS.INVOICE_READ),
  validateQuery(listQuerySchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const query = parsedQuery(res, listQuerySchema);
    const { items, total } = await service.listInvoices(query);
    sendSuccess(res, items, { meta: paginationMeta(query.page, query.pageSize, total) });
  }),
);

invoicesRouter.post(
  '/',
  requirePermission(PERMISSIONS.INVOICE_CREATE),
  validateBody(createInvoiceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const created = await service.createInvoice(parsedBody(req, createInvoiceSchema), auth.userId);
    sendSuccess(res, created, { status: 201 });
  }),
);

const idParam = documentIdParamSchema;
const idOf = (res: Response): bigint => BigInt(parsedParams(res, idParam).id);

registerAttachmentRoutes(invoicesRouter, {
  entityType: 'INVOICE',
  readPermission: PERMISSIONS.INVOICE_READ,
  writePermission: PERMISSIONS.INVOICE_UPDATE,
  findDocument: (id) => service.findInvoice(id),
});

invoicesRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.INVOICE_READ),
  validateParams(idParam),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.getInvoice(idOf(res)));
  }),
);

invoicesRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.INVOICE_UPDATE),
  validateParams(idParam),
  validateBody(updateInvoiceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    sendSuccess(
      res,
      await service.updateInvoice(idOf(res), parsedBody(req, updateInvoiceSchema), auth.userId),
    );
  }),
);

invoicesRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.INVOICE_DELETE),
  validateParams(idParam),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    await lifecycle.deleteDraft(idOf(res), auth.userId);
    sendSuccess(res, { deleted: true });
  }),
);

/* --- lifecycle ----------------------------------------------------------- */

invoicesRouter.post(
  '/:id/issue',
  requirePermission(PERMISSIONS.INVOICE_UPDATE_STATUS),
  validateParams(idParam),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    sendSuccess(res, await lifecycle.issueInvoice(idOf(res), auth.userId));
  }),
);

invoicesRouter.post(
  '/:id/status',
  requirePermission(PERMISSIONS.INVOICE_UPDATE_STATUS),
  validateParams(idParam),
  validateBody(invoiceStatusSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    sendSuccess(
      res,
      await lifecycle.changeStatus(idOf(res), parsedBody(req, invoiceStatusSchema), auth.userId),
    );
  }),
);

invoicesRouter.post(
  '/:id/cancel',
  requirePermission(PERMISSIONS.INVOICE_CANCEL),
  validateParams(idParam),
  validateBody(requiredReasonSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { reason } = parsedBody(req, requiredReasonSchema);
    sendSuccess(res, await lifecycle.cancelInvoice(idOf(res), reason, auth.userId));
  }),
);

invoicesRouter.post(
  '/:id/void',
  requirePermission(PERMISSIONS.INVOICE_VOID),
  validateParams(idParam),
  validateBody(requiredReasonSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { reason } = parsedBody(req, requiredReasonSchema);
    sendSuccess(res, await lifecycle.voidInvoice(idOf(res), reason, auth.userId));
  }),
);

invoicesRouter.post(
  '/:id/payment',
  requirePermission(PERMISSIONS.PAYMENT_STATUS_UPDATE),
  validateParams(idParam),
  validateBody(paymentUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    sendSuccess(
      res,
      await lifecycle.recordPayment(idOf(res), parsedBody(req, paymentUpdateSchema), auth.userId),
    );
  }),
);

invoicesRouter.post(
  '/:id/duplicate',
  requirePermission(PERMISSIONS.INVOICE_CREATE),
  validateParams(idParam),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    sendSuccess(res, await lifecycle.duplicateInvoice(idOf(res), auth.userId), { status: 201 });
  }),
);

/* --- rendering ----------------------------------------------------------- */

invoicesRouter.get(
  '/:id/preview',
  requirePermission(PERMISSIONS.INVOICE_READ),
  validateParams(idParam),
  asyncHandler(async (_req: Request, res: Response) => {
    res.type('html').send(await lifecycle.previewInvoiceHtml(idOf(res)));
  }),
);

const forceSchema = z.object({ force: z.enum(['true', 'false']).optional() });

invoicesRouter.post(
  '/:id/pdf',
  requirePermission(PERMISSIONS.INVOICE_READ),
  validateParams(idParam),
  validateQuery(forceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { force } = parsedQuery(res, forceSchema);
    sendSuccess(res, await lifecycle.generatePdf(idOf(res), auth.userId, force === 'true'));
  }),
);

invoicesRouter.get(
  '/:id/pdf',
  requirePermission(PERMISSIONS.INVOICE_DOWNLOAD),
  validateParams(idParam),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const id = idOf(res);

    const pdf = await lifecycle.generatePdf(id, auth.userId);
    const invoice = await service.findInvoice(id);

    await recordAudit({
      action: 'DOCUMENT_DOWNLOADED',
      entityType: 'INVOICE',
      entityId: id,
      entityLabel: invoice.number,
      metadata: { fileName: pdf.fileName, documentVersion: invoice.currentVersion },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(pdf.sizeBytes));
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.fileName}"`);

    const stream = await getStorage().getStream(pdf.storageKey);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }),
);

/* --- history ------------------------------------------------------------- */

invoicesRouter.get(
  '/:id/history',
  requirePermission(PERMISSIONS.INVOICE_READ),
  validateParams(idParam),
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await lifecycle.listRevisions(idOf(res)));
  }),
);

const versionParam = idParam.extend({ version: z.coerce.number().int().positive() });

invoicesRouter.get(
  '/:id/versions/:version',
  requirePermission(PERMISSIONS.INVOICE_READ),
  validateParams(versionParam),
  asyncHandler(async (_req: Request, res: Response) => {
    const params = parsedParams(res, versionParam);
    sendSuccess(res, await lifecycle.getRevisionSnapshot(BigInt(params.id), params.version));
  }),
);

/* --- sharing (decision Q14: link and download, never email) --------------- */

invoicesRouter.get(
  '/:id/share-links',
  requirePermission(PERMISSIONS.INVOICE_READ),
  validateParams(idParam),
  asyncHandler(async (_req: Request, res: Response) => {
    const id = idOf(res);
    const invoice = await service.findInvoice(id);
    sendSuccess(res, await listShareLinks('INVOICE', id, invoice.number));
  }),
);

invoicesRouter.post(
  '/:id/share-links',
  requirePermission(PERMISSIONS.INVOICE_SHARE),
  validateParams(idParam),
  validateBody(shareLinkSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const id = idOf(res);
    const invoice = await service.findInvoice(id);
    const { expiresInDays } = parsedBody(req, shareLinkSchema);

    /* The link streams a stored PDF, so make sure one exists first. */
    await lifecycle.generatePdf(id, auth.userId);

    sendSuccess(
      res,
      await createShareLink('INVOICE', id, invoice.number, auth.userId, expiresInDays),
      { status: 201 },
    );
  }),
);

const shareParam = idParam.extend({ shareId: z.string().regex(/^\d+$/) });

invoicesRouter.delete(
  '/:id/share-links/:shareId',
  requirePermission(PERMISSIONS.INVOICE_SHARE),
  validateParams(shareParam),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const params = parsedParams(res, shareParam);
    await revokeShareLink(BigInt(params.shareId), auth.userId);
    sendSuccess(res, { revoked: true });
  }),
);

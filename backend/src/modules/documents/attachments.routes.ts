import type { Router } from 'express';
import { z } from 'zod';
import type { Permission } from '@app/shared';
import { documentIdParamSchema } from '@app/shared';
import { asyncHandler, sendSuccess } from '../../utils/http';
import { parsedParams, validateParams } from '../../middleware/validate';
import { getAuth } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { ATTACHMENT_RULES, singleFile, validateUpload } from '../../middleware/upload';
import { env } from '../../config/env';
import { getStorage } from '../../storage/storage.service';
import * as service from './attachments.service';

/**
 * The attachment surface is identical for quotations and invoices, so the four
 * routes are registered from one place. Only the permission names and the
 * document lookup differ.
 */

export interface AttachmentRouteOptions {
  entityType: service.AttachmentEntity;
  readPermission: Permission;
  writePermission: Permission;
  findDocument: (id: bigint) => Promise<{ number: string }>;
}

const idParam = documentIdParamSchema;
const fileParam = idParam.extend({ fileId: z.string().regex(/^\d+$/, 'Not a valid file id') });

export const registerAttachmentRoutes = (
  router: Router,
  { entityType, readPermission, writePermission, findDocument }: AttachmentRouteOptions,
): void => {
  router.get(
    '/:id/attachments',
    requirePermission(readPermission),
    validateParams(idParam),
    asyncHandler(async (_req, res) => {
      const id = BigInt(parsedParams(res, idParam).id);
      await findDocument(id);
      sendSuccess(res, await service.listAttachments(entityType, id));
    }),
  );

  router.get(
    '/:id/attachments/:fileId',
    requirePermission(readPermission),
    validateParams(fileParam),
    asyncHandler(async (_req, res) => {
      const params = parsedParams(res, fileParam);
      const file = await service.getAttachment(
        entityType,
        BigInt(params.id),
        BigInt(params.fileId),
      );

      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Length', String(file.sizeBytes));
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(file.fileName)}"`,
      );
      res.setHeader('Cache-Control', 'private, max-age=86400');

      const stream = await getStorage().getStream(file.storageKey);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    }),
  );

  router.post(
    '/:id/attachments',
    requirePermission(writePermission),
    validateParams(idParam),
    singleFile('file'),
    asyncHandler(async (req, res) => {
      const auth = getAuth(req);
      const id = BigInt(parsedParams(res, idParam).id);
      const document = await findDocument(id);
      const file = validateUpload(req.file, ATTACHMENT_RULES, env.ATTACHMENT_MAX_MB);

      const attachment = await service.addAttachment(entityType, id, document.number, file, {
        id: auth.userId,
        name: auth.name,
      });

      sendSuccess(res, attachment, { status: 201 });
    }),
  );

  router.delete(
    '/:id/attachments/:fileId',
    requirePermission(writePermission),
    validateParams(fileParam),
    asyncHandler(async (_req, res) => {
      const params = parsedParams(res, fileParam);
      const id = BigInt(params.id);
      const document = await findDocument(id);

      await service.removeAttachment(entityType, id, BigInt(params.fileId), document.number);
      sendSuccess(res, { removed: true });
    }),
  );
};

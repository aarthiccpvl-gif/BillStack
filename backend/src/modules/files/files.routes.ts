import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/http';
import { parsedParams, validateParams } from '../../middleware/validate';
import { authenticatedOnly } from '../../middleware/authorize';
import { NotFoundError } from '../../utils/errors';
import { prisma } from '../../db/prisma';
import { getStorage } from '../../storage/storage.service';

/**
 * File delivery.
 *
 * Every download is proxied through the API rather than served from a public path,
 * so authentication applies and — from Phase 5 — document downloads are audited.
 * Branding assets are readable by any signed-in user because the UI and the
 * document preview both need them.
 */
export const filesRouter = Router();

const fileParamSchema = z.object({ id: z.string().regex(/^\d+$/, 'Not a valid file id') });

filesRouter.get(
  '/:id',
  authenticatedOnly(),
  validateParams(fileParamSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const { id } = parsedParams(res, fileParamSchema);

    const file = await prisma.documentFile.findUnique({ where: { id: BigInt(id) } });
    if (!file) throw new NotFoundError('File');

    const storage = getStorage();
    if (!(await storage.exists(file.storageKey))) {
      throw new NotFoundError('File contents');
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.sizeBytes));
    /* Branding is displayed inline; attachments and PDFs download by name. */
    const disposition = ['LOGO', 'FAVICON', 'SIGNATURE', 'SEAL'].includes(file.kind)
      ? 'inline'
      : 'attachment';
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(file.fileName)}"`,
    );
    /* Keys are timestamped, so a stored object never changes under a given id. */
    res.setHeader('Cache-Control', 'private, max-age=86400');

    const stream = await storage.getStream(file.storageKey);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }),
);

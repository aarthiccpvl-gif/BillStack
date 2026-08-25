import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../../utils/http';
import { parsedParams, validateParams } from '../../middleware/validate';
import { publicRoute } from '../../middleware/authorize';
import { NotFoundError } from '../../utils/errors';
import { prisma } from '../../db/prisma';
import { getStorage } from '../../storage/storage.service';
import { recordShareView, resolveShareToken } from '../../services/share.service';
import { markViewedFromShare } from '../quotations/quotations.lifecycle';
import { isTest } from '../../config/env';

/**
 * The public share route (decision Q9).
 *
 * The only unauthenticated surface in the application, and deliberately the
 * smallest one possible: given an opaque token it streams an already-generated
 * PDF and records the view. It cannot reach the API, cannot list anything, and
 * reveals nothing about which tokens exist — every failure answers 404.
 */
export const publicRouter = Router();

const tokenParamSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,120}$/, 'Not a valid link'),
});

/* Tight limit: a public endpoint should not be usable to probe for tokens. */
const shareLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
});

publicRouter.get(
  '/documents/:token',
  publicRoute(),
  shareLimiter,
  validateParams(tokenParamSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const { token } = parsedParams(res, tokenParamSchema);

    const share = await resolveShareToken(token);
    /* Unknown, revoked and expired all look identical from outside. */
    if (!share) throw new NotFoundError('That link is not valid or has expired');

    const file = await prisma.documentFile.findFirst({
      where: { entityType: share.entityType, entityId: share.entityId, kind: 'GENERATED_PDF' },
      orderBy: { id: 'desc' },
    });

    if (!file) throw new NotFoundError('That document is not available');

    const storage = getStorage();
    if (!(await storage.exists(file.storageKey))) {
      throw new NotFoundError('That document is not available');
    }

    await recordShareView(share.shareId);
    if (share.entityType === 'QUOTATION') {
      /* This is what makes the VIEWED status real rather than a manual claim. */
      await markViewedFromShare(share.entityId);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
    /* A shared document should not be cached by an intermediary. */
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    const stream = await storage.getStream(file.storageKey);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }),
);

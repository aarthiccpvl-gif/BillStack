import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@app/shared';
import { asyncHandler } from '../../utils/http';
import { parsedBody, validateBody } from '../../middleware/validate';
import { getAuth } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { streamBulkPdf } from './bulk-download.service';

/**
 * Bulk downloads.
 *
 * A POST because the id list can be long and does not belong in a URL or a server
 * log — but it changes nothing, which is why a read-only role is allowed to call
 * it. That exception is declared here rather than being a hole in the global
 * guard: see `enforceReadOnlyRole`.
 */
export const downloadsRouter = Router();

const bulkSchema = z.object({
  type: z.enum(['QUOTATION', 'INVOICE']),
  ids: z.array(z.string().regex(/^\d+$/, 'Not a valid id')).min(1).max(100),
});

downloadsRouter.post(
  '/documents/bulk-pdf',
  requirePermission(PERMISSIONS.DOCUMENT_BULK_DOWNLOAD),
  validateBody(bulkSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    await streamBulkPdf(parsedBody(req, bulkSchema), auth.userId, res);
  }),
);

import type { Response } from 'express';
import archiver from 'archiver';
import { toDateOnlyString } from '@app/shared';
import { prisma } from '../../db/prisma';
import { BusinessRuleError } from '../../utils/errors';
import { recordAudit } from '../../services/audit.service';
import { getStorage } from '../../storage/storage.service';
import { generatePdf as generateQuotationPdf } from '../quotations/quotations.lifecycle';
import { generatePdf as generateInvoicePdf } from '../invoices/invoices.lifecycle';
import { logger } from '../../utils/logger';

/**
 * Bulk PDF download.
 *
 * The archive is **streamed**, never assembled in memory: fifty invoices is fifty
 * PDFs, and buffering them all to build a Buffer is how an export takes down the
 * process it runs in. Each file is generated (or reused from storage) and piped in
 * one at a time.
 *
 * A document that cannot be rendered does not abort the download. The archive
 * carries a `_problems.txt` listing what was left out, because a ZIP that silently
 * contains 47 of 50 files is worse than one that says which three are missing.
 */

const MAX_DOCUMENTS = 100;

export interface BulkRequest {
  type: 'QUOTATION' | 'INVOICE';
  ids: string[];
}

const safeName = (value: string): string => value.replace(/[^\w.-]+/g, '-');

export const streamBulkPdf = async (
  request: BulkRequest,
  actorId: number,
  res: Response,
): Promise<void> => {
  const ids = [...new Set(request.ids)];

  if (ids.length === 0) throw new BusinessRuleError('Choose at least one document to download.');
  if (ids.length > MAX_DOCUMENTS) {
    throw new BusinessRuleError(
      `That is ${ids.length} documents; ${MAX_DOCUMENTS} is the most one archive will carry. Narrow the filter and download in batches.`,
    );
  }

  /* Resolve the numbers first: this both validates the ids and gives the archive
     readable file names, and it fails before a single byte has been written —
     which matters, because once streaming starts an error cannot change the
     status code. */
  const documents =
    request.type === 'QUOTATION'
      ? await prisma.quotation.findMany({
          where: { id: { in: ids.map(BigInt) }, deletedAt: null },
          select: { id: true, number: true },
        })
      : await prisma.invoice.findMany({
          where: { id: { in: ids.map(BigInt) }, deletedAt: null },
          select: { id: true, number: true },
        });

  if (documents.length === 0) throw new BusinessRuleError('None of those documents exist.');

  const stamp = toDateOnlyString(new Date());
  const archiveName = `${request.type === 'QUOTATION' ? 'quotations' : 'invoices'}-${stamp}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);
  res.setHeader('Cache-Control', 'private, no-store');

  const archive = archiver('zip', { zlib: { level: 6 } });
  const problems: string[] = [];

  archive.on('warning', (error) => logger.warn({ err: error }, 'bulk download warning'));
  archive.on('error', (error) => {
    logger.error({ err: error }, 'bulk download failed mid-stream');
    res.destroy();
  });

  archive.pipe(res);

  const storage = getStorage();

  for (const document of documents) {
    try {
      const pdf =
        request.type === 'QUOTATION'
          ? await generateQuotationPdf(document.id, actorId)
          : await generateInvoicePdf(document.id, actorId);

      const stream = await storage.getStream(pdf.storageKey);
      archive.append(stream, { name: `${safeName(document.number)}.pdf` });
    } catch (error) {
      logger.error({ err: error, number: document.number }, 'could not add a document to the zip');
      problems.push(`${document.number} — could not be rendered`);
    }
  }

  const missing = ids.length - documents.length;
  if (missing > 0) problems.push(`${missing} document(s) no longer exist and were skipped.`);

  if (problems.length > 0) {
    archive.append(`Some documents were left out of this archive:\n\n${problems.join('\n')}\n`, {
      name: '_problems.txt',
    });
  }

  await recordAudit({
    action: 'BULK_DOWNLOAD',
    entityType: request.type,
    metadata: {
      requested: ids.length,
      included: documents.length - problems.length,
      problems: problems.length,
    },
  });

  await archive.finalize();
};

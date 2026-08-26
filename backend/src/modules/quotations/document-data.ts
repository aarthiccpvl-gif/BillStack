import type { Prisma } from '@prisma/client';
import { toDateOnlyString, type DocumentData, type TemplateConfig } from '@app/shared';
import { buildDocumentData, type BuildDocumentDataOptions } from '../documents/document-data';

/**
 * The quotation's view of the shared renderer contract: which relations to load,
 * and the two facts that are the quotation's own — its expiry date, and that no
 * money has been received against it.
 */

export const quotationInclude = {
  items: { include: { taxes: true }, orderBy: { sortOrder: 'asc' } },
  currency: true,
  customer: true,
  financialYear: true,
  templateVersion: { include: { template: true } },
  createdBy: { select: { id: true, name: true } },
  invoices: { select: { id: true, number: true } },
} satisfies Prisma.QuotationInclude;

export type QuotationWithRelations = Prisma.QuotationGetPayload<{
  include: typeof quotationInclude;
}>;

export type { BuildDocumentDataOptions };

export const buildQuotationData = async (
  quotation: QuotationWithRelations,
  options: BuildDocumentDataOptions = {},
): Promise<{ data: DocumentData; config: TemplateConfig; engineKey: string }> =>
  buildDocumentData(
    'QUOTATION',
    quotation,
    { expiry: quotation.expiryDate ? toDateOnlyString(quotation.expiryDate) : null },
    options,
  );

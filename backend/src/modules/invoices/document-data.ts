import type { Prisma } from '@prisma/client';
import { toDateOnlyString, type DocumentData, type TemplateConfig } from '@app/shared';
import { buildDocumentData, type BuildDocumentDataOptions } from '../documents/document-data';
import { outstandingOf } from './invoices.payments';

/**
 * The invoice's view of the shared renderer contract: which relations to load,
 * its due date, and the money recorded against it — the figures a customer
 * looks for first and the reason an invoice prints a balance where a quotation
 * prints nothing.
 */

export const invoiceInclude = {
  items: { include: { taxes: true }, orderBy: { sortOrder: 'asc' } },
  currency: true,
  customer: true,
  financialYear: true,
  templateVersion: { include: { template: true } },
  createdBy: { select: { id: true, name: true } },
  sourceQuotation: { select: { id: true, number: true } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export type { BuildDocumentDataOptions };

export const buildInvoiceData = async (
  invoice: InvoiceWithRelations,
  options: BuildDocumentDataOptions = {},
): Promise<{ data: DocumentData; config: TemplateConfig; engineKey: string }> =>
  buildDocumentData(
    'INVOICE',
    invoice,
    {
      due: invoice.dueDate ? toDateOnlyString(invoice.dueDate) : null,
      /* Printed only once something has actually been received, so a fresh
         invoice does not carry a distracting "Paid ₹0.00" line. */
      amountPaid: invoice.amountPaid.isZero() ? null : invoice.amountPaid.toString(),
      balanceDue: invoice.amountPaid.isZero() ? null : outstandingOf(invoice).toString(),
    },
    options,
  );

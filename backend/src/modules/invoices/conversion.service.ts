import { Prisma } from '@prisma/client';
import {
  toDateOnlyString,
  type ConvertQuotationInput,
  type CreateInvoiceInput,
  type InvoiceRecord,
} from '@app/shared';
import { prisma } from '../../db/prisma';
import { BusinessRuleError } from '../../utils/errors';
import { recordAudit } from '../../services/audit.service';
import { allocateNumber } from '../../services/numbering.service';
import { stageAttachmentCopies, writeAttachmentCopies } from '../documents/attachments.service';
import { prepareDocument } from '../documents/prepare.service';
import { findQuotation } from '../quotations/quotations.service';
import { invoiceInclude } from './document-data';
import { toInvoiceRecord } from './invoices.mapper';
import { writeInvoiceLines } from './invoices.service';
import { addDays } from './invoices.payments';

/**
 * Quotation → invoice.
 *
 * The whole point is that the customer sees the same figures they accepted, so
 * every line, discount, tax choice and piece of wording is carried over and the
 * engine is re-run over them. Re-running rather than copying the stored totals is
 * deliberate: it proves the transfer is faithful instead of asserting it, and it
 * is the only way the invoice's own tax rates are resolved as of *its* date.
 *
 * All of it happens in one transaction — the invoice, its number, the quotation's
 * new CONVERTED status and the back-link either all land or none do. A quotation
 * that was half-converted would be worse than one that was not converted at all.
 */

const toDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

export const convertQuotationToInvoice = async (
  quotationId: bigint,
  input: ConvertQuotationInput,
  actorId: number,
): Promise<InvoiceRecord> => {
  const quotation = await findQuotation(quotationId);

  if (quotation.status === 'CONVERTED') {
    const existing = await prisma.invoice.findFirst({
      where: { quotationId, deletedAt: null },
      select: { number: true },
    });

    throw new BusinessRuleError(
      `${quotation.number} has already been converted${existing ? ` to ${existing.number}` : ''}. Duplicate that invoice if another one is needed.`,
      'ALREADY_CONVERTED',
    );
  }

  if (quotation.status === 'CANCELLED') {
    throw new BusinessRuleError(`${quotation.number} is cancelled and cannot be invoiced.`);
  }

  /* The invoice carries its own date — usually today, not the quotation's date,
     which may be months old and in a different financial year. */
  const documentDate = input.documentDate ?? toDateOnlyString(new Date());
  const paymentTermsDays = input.paymentTermsDays ?? quotation.customer.paymentTermsDays;

  const payload: CreateInvoiceInput = {
    customerId: quotation.customerId,
    documentDate,
    dueDate: input.dueDate ?? null,
    paymentTermsDays,
    referenceNumber: quotation.referenceNumber,
    subject: quotation.subject,
    currencyCode: quotation.currencyCode,
    /* The rate the quotation was agreed at, not today's — the customer accepted
       a figure, and re-converting it would quietly change the price (Q3). */
    exchangeRateToBase: quotation.exchangeRateToBase.toString(),
    placeOfSupplyStateCode: quotation.placeOfSupplyStateCode,
    billingAddressId: null,
    shippingAddressId: null,
    templateId: null,
    bankAccountId: quotation.bankAccountId,
    showBankDetails: quotation.showBankDetails,
    discountMode: quotation.discountMode,
    discountValue: quotation.discountValue.toString(),
    adjustment: quotation.adjustment.toString(),
    roundOffEnabled: quotation.roundOffEnabled,
    notes: quotation.notes,
    terms: quotation.terms,
    customerMessage: quotation.customerMessage,
    paymentInstructions: quotation.paymentInstructions,
    customFields: Array.isArray(quotation.customFieldsJson)
      ? (quotation.customFieldsJson as { label: string; value: string }[])
      : [],
    items: quotation.items.map((item) => ({
      itemId: item.itemId,
      name: item.name,
      description: item.description,
      hsnSacCode: item.hsnSacCode,
      unitCode: item.unitCode,
      quantity: item.quantity.toString(),
      rate: item.rate.toString(),
      discountMode: item.discountMode,
      discountValue: item.discountValue.toString(),
      taxGroupId: item.taxGroupId,
      isTaxExempt: item.isTaxExempt,
      exemptReason: item.exemptReason,
    })),
  };

  /* Supporting documents travel with the work they support (decision D7). The
     bytes are staged before the transaction; the rows are written inside it. */
  const attachments = await stageAttachmentCopies('QUOTATION', quotationId);

  let invoiceId: bigint;
  try {
    invoiceId = await prisma.$transaction(async (tx) => {
      const prepared = await prepareDocument(tx, 'INVOICE', payload);

      /* Both addresses are copied as the quotation recorded them, not re-derived
         from the customer, so a customer who has since moved does not silently
         change the address on a document that was already agreed. */
      const header = {
        ...prepared.header,
        billingAddressSnapshot: (quotation.billingAddressSnapshot ??
          Prisma.JsonNull) as Prisma.InputJsonValue,
        shippingAddressSnapshot: (quotation.shippingAddressSnapshot ??
          Prisma.JsonNull) as Prisma.InputJsonValue,
      };

      const allocated = await allocateNumber(tx, 'INVOICE', documentDate);
      const dueDate = input.dueDate
        ? toDate(input.dueDate)
        : addDays(toDate(documentDate), paymentTermsDays);

      const invoice = await tx.invoice.create({
        data: {
          ...header,
          number: allocated.number,
          financialYearId: allocated.financialYearId,
          quotationId,
          paymentTermsDays,
          dueDate,
          createdById: actorId,
        },
      });

      await writeInvoiceLines(tx, invoice.id, prepared.items);

      const attachmentsCopied = await writeAttachmentCopies(
        tx,
        'INVOICE',
        invoice.id,
        attachments.copies,
        actorId,
      );

      /* The quotation is closed against further change and points at its invoice. */
      await tx.quotation.update({
        where: { id: quotationId },
        data: { status: 'CONVERTED', updatedById: actorId },
      });

      if (!invoice.grandTotal.equals(quotation.grandTotal)) {
        /* The engine re-ran and disagreed with the accepted figure — almost always
           a tax rate that has since changed its effective date. Better to refuse
           than to invoice a number the customer never agreed to. */
        throw new BusinessRuleError(
          `Converting ${quotation.number} would produce ${invoice.grandTotal.toString()} instead of the accepted ${quotation.grandTotal.toString()}, usually because a tax rate changed. Raise the invoice manually and record why.`,
          'CONVERSION_TOTAL_MISMATCH',
        );
      }

      await recordAudit(
        {
          action: 'QUOTATION_CONVERTED',
          entityType: 'QUOTATION',
          entityId: quotationId,
          entityLabel: quotation.number,
          previousData: { status: quotation.status },
          newData: { status: 'CONVERTED', invoice: invoice.number },
          metadata: {
            invoiceId: invoice.id.toString(),
            grandTotal: invoice.grandTotal.toString(),
            attachmentsCopied,
          },
        },
        tx,
      );

      await recordAudit(
        {
          action: 'INVOICE_CREATED',
          entityType: 'INVOICE',
          entityId: invoice.id,
          entityLabel: invoice.number,
          newData: {
            fromQuotation: quotation.number,
            grandTotal: invoice.grandTotal.toString(),
            lines: payload.items.length,
            attachmentsCopied,
          },
        },
        tx,
      );

      return invoice.id;
    });
  } catch (error) {
    /* The invoice did not commit, so the copied bytes have nothing pointing at
       them. Remove them before surfacing the failure. */
    await attachments.cleanup();
    throw error;
  }

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: invoiceInclude,
  });

  return toInvoiceRecord(invoice);
};

import type { Prisma, InvoiceStatus } from '@prisma/client';
import {
  parseSort,
  toDateOnlyString,
  type CreateInvoiceInput,
  type DocumentFilters,
  type InvoiceListRow,
  type InvoiceRecord,
  type PaginationQuery,
  type UpdateInvoiceInput,
} from '@app/shared';
import { prisma, type TransactionClient } from '../../db/prisma';
import { ImmutableResourceError, NotFoundError } from '../../utils/errors';
import { recordAudit } from '../../services/audit.service';
import { allocateNumber } from '../../services/numbering.service';
import { assertChangeReason, recordRevision } from '../../services/revision.service';
import { prepareDocument, type PreparedLine } from '../documents/prepare.service';
import { invoiceInclude, type InvoiceWithRelations } from './document-data';
import { toInvoiceRecord } from './invoices.mapper';
import { addDays, outstandingOf, overdueOf } from './invoices.payments';

/**
 * Invoices.
 *
 * The same discipline as quotations, and deliberately the same code where the two
 * are the same thing: snapshots and money come from `documents/prepare.service`,
 * numbering from the invoice series, and nothing the client sends about totals is
 * trusted — the request schema cannot even express them.
 *
 * What is different lives here: a due date, and a document that can be issued,
 * paid, cancelled or voided rather than accepted or declined.
 */

const SORTABLE = ['number', 'documentDate', 'dueDate', 'grandTotal', 'createdAt'] as const;

const toDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const isDraft = (status: InvoiceStatus): boolean => status === 'DRAFT';

/** The due date the client chose, else the one the payment terms imply (PRD §20). */
const resolveDueDate = (
  documentDate: Date,
  dueDate: string | null | undefined,
  paymentTermsDays: number,
): Date | null => {
  if (dueDate) return toDate(dueDate);
  return addDays(documentDate, paymentTermsDays);
};

// ------------------------------------------------------------ preparation ---

/**
 * Turns a validated request into the rows to persist.
 *
 * The work itself — snapshots, the calculation engine, the frozen tax summary —
 * lives in `modules/documents/prepare.service`, shared with quotations. Only the
 * invoice's own dates are added here.
 */
const prepareInvoice = async (
  tx: TransactionClient,
  input: CreateInvoiceInput,
  actorId: number,
): Promise<{ data: Prisma.InvoiceUncheckedCreateInput; items: PreparedLine[] }> => {
  const prepared = await prepareDocument(tx, 'INVOICE', input);

  /* The customer's own terms are the default, so an invoice raised without
     thinking about it still carries the terms that customer was signed up on. */
  const paymentTermsDays = input.paymentTermsDays ?? prepared.customerPaymentTermsDays;
  const documentDate = toDate(input.documentDate);

  return {
    data: {
      ...prepared.header,
      number: '',
      financialYearId: 0,
      paymentTermsDays,
      dueDate: resolveDueDate(documentDate, input.dueDate, paymentTermsDays),
      createdById: actorId,
    },
    items: prepared.items,
  };
};

// ---------------------------------------------------------------- queries ---

export const listInvoices = async (query: PaginationQuery & DocumentFilters) => {
  const { field, direction } = parseSort(query.sort, SORTABLE, {
    field: 'documentDate',
    direction: 'desc',
  });

  /* OVERDUE is not a stored status, so filtering by it means "issued, unpaid and
     past its date" — the same question the derived flag answers on every row. */
  const overdueFilter: Prisma.InvoiceWhereInput =
    query.status === 'OVERDUE'
      ? {
          status: { in: ['ISSUED', 'SENT', 'VIEWED', 'PARTIALLY_PAID'] },
          dueDate: { lt: toDate(toDateOnlyString(new Date())) },
        }
      : {};

  const where: Prisma.InvoiceWhereInput = {
    deletedAt: null,
    ...(query.status && query.status !== 'OVERDUE'
      ? { status: query.status as InvoiceStatus }
      : overdueFilter),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.currencyCode ? { currencyCode: query.currencyCode } : {}),
    ...(query.financialYearId ? { financialYearId: query.financialYearId } : {}),
    ...(query.createdById ? { createdById: query.createdById } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          documentDate: {
            ...(query.dateFrom ? { gte: toDate(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: toDate(query.dateTo) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { number: { contains: query.search } },
            { referenceNumber: { contains: query.search } },
            { subject: { contains: query.search } },
            { customer: { name: { contains: query.search } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        currency: true,
        createdBy: { select: { name: true } },
        sourceQuotation: { select: { number: true } },
      },
      orderBy: { [field]: direction },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);

  const items: InvoiceListRow[] = rows.map((row) => {
    const overdue = overdueOf(row);

    return {
      id: row.id.toString(),
      number: row.number,
      status: row.status,
      customerId: row.customerId,
      customerName: row.customer.name,
      documentDate: toDateOnlyString(row.documentDate),
      dueDate: row.dueDate ? toDateOnlyString(row.dueDate) : null,
      currencyCode: row.currencyCode,
      currencySymbol: row.currencySymbol,
      currencyDecimalPlaces: row.currencyDecimalPlaces,
      grandTotal: row.grandTotal.toString(),
      amountPaid: row.amountPaid.toString(),
      amountOutstanding: outstandingOf(row).toString(),
      createdByName: row.createdBy.name,
      createdAt: row.createdAt.toISOString(),
      isOverdue: overdue.isOverdue,
      daysOverdue: overdue.daysOverdue,
      quotationNumber: row.sourceQuotation?.number ?? null,
    };
  });

  return { items, total };
};

export const findInvoice = async (id: bigint): Promise<InvoiceWithRelations> => {
  const invoice = await prisma.invoice.findFirst({
    where: { id, deletedAt: null },
    include: invoiceInclude,
  });
  if (!invoice) throw new NotFoundError('Invoice');
  return invoice;
};

export const getInvoice = async (id: bigint): Promise<InvoiceRecord> =>
  toInvoiceRecord(await findInvoice(id));

// ----------------------------------------------------------------- writes ---

/** Writes the header and its lines. Shared by create, update and conversion. */
export const writeInvoiceLines = async (
  tx: TransactionClient,
  invoiceId: bigint,
  items: PreparedLine[],
): Promise<void> => {
  for (const item of items) {
    const line = await tx.invoiceItem.create({ data: { ...item.line, invoiceId } });
    if (item.taxes.length > 0) {
      await tx.invoiceItemTax.createMany({
        data: item.taxes.map((tax) => ({ ...tax, invoiceItemId: line.id })),
      });
    }
  }
};

export const createInvoice = async (
  input: CreateInvoiceInput,
  actorId: number,
): Promise<InvoiceRecord> => {
  const created = await prisma.$transaction(async (tx) => {
    const prepared = await prepareInvoice(tx, input, actorId);

    /* Number and financial year come from the document date, allocated under a
       row lock inside this transaction — so a failed save burns no number. */
    const allocated = await allocateNumber(tx, 'INVOICE', input.documentDate);

    const invoice = await tx.invoice.create({
      data: {
        ...prepared.data,
        number: allocated.number,
        financialYearId: allocated.financialYearId,
      },
    });

    await writeInvoiceLines(tx, invoice.id, prepared.items);

    await recordAudit(
      {
        action: 'INVOICE_CREATED',
        entityType: 'INVOICE',
        entityId: invoice.id,
        entityLabel: invoice.number,
        newData: {
          customer: input.customerId,
          currency: invoice.currencyCode,
          grandTotal: invoice.grandTotal.toString(),
          lines: input.items.length,
        },
      },
      tx,
    );

    return invoice.id;
  });

  return getInvoice(created);
};

/** A compact snapshot for the revision history — the shape a diff reads well over. */
export const snapshotFor = (invoice: InvoiceWithRelations) => ({
  customerId: invoice.customerId,
  documentDate: toDateOnlyString(invoice.documentDate),
  dueDate: invoice.dueDate ? toDateOnlyString(invoice.dueDate) : null,
  paymentTermsDays: invoice.paymentTermsDays,
  referenceNumber: invoice.referenceNumber,
  subject: invoice.subject,
  currencyCode: invoice.currencyCode,
  exchangeRateToBase: invoice.exchangeRateToBase.toString(),
  placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
  discountMode: invoice.discountMode,
  discountValue: invoice.discountValue.toString(),
  subtotal: invoice.subtotal.toString(),
  discountTotal: invoice.discountTotal.toString(),
  taxableTotal: invoice.taxableTotal.toString(),
  taxTotal: invoice.taxTotal.toString(),
  adjustment: invoice.adjustment.toString(),
  roundOff: invoice.roundOff.toString(),
  roundOffEnabled: invoice.roundOffEnabled,
  grandTotal: invoice.grandTotal.toString(),
  amountPaid: invoice.amountPaid.toString(),
  notes: invoice.notes,
  terms: invoice.terms,
  customerMessage: invoice.customerMessage,
  paymentInstructions: invoice.paymentInstructions,
  bankAccountId: invoice.bankAccountId,
  showBankDetails: invoice.showBankDetails,
  templateVersionId: invoice.templateVersionId,
  status: invoice.status,
  items: invoice.items.map((item) => ({
    name: item.name,
    description: item.description,
    quantity: item.quantity.toString(),
    rate: item.rate.toString(),
    discountAmount: item.discountAmount.toString(),
    taxableAmount: item.taxableAmount.toString(),
    taxAmount: item.taxAmount.toString(),
    lineTotal: item.lineTotal.toString(),
  })),
});

export const updateInvoice = async (
  id: bigint,
  input: UpdateInvoiceInput,
  actorId: number,
): Promise<InvoiceRecord> => {
  const existing = await findInvoice(id);

  if (existing.status === 'CANCELLED' || existing.status === 'VOID') {
    throw new ImmutableResourceError(
      `${existing.number} has been ${existing.status.toLowerCase()} and can no longer be changed.`,
    );
  }

  const draft = isDraft(existing.status);
  assertChangeReason(existing.status, input.changeReason);

  const previous = snapshotFor(existing);

  /* Merge the partial payload over the stored document so the engine always sees
     a complete input — a PATCH of one field still recalculates everything. */
  const merged: CreateInvoiceInput = {
    customerId: input.customerId ?? existing.customerId,
    documentDate: input.documentDate ?? toDateOnlyString(existing.documentDate),
    dueDate:
      input.dueDate !== undefined
        ? input.dueDate
        : existing.dueDate
          ? toDateOnlyString(existing.dueDate)
          : null,
    paymentTermsDays: input.paymentTermsDays ?? existing.paymentTermsDays,
    referenceNumber:
      input.referenceNumber !== undefined ? input.referenceNumber : existing.referenceNumber,
    subject: input.subject !== undefined ? input.subject : existing.subject,
    currencyCode: input.currencyCode ?? existing.currencyCode,
    exchangeRateToBase: input.exchangeRateToBase ?? existing.exchangeRateToBase.toString(),
    placeOfSupplyStateCode:
      input.placeOfSupplyStateCode !== undefined
        ? input.placeOfSupplyStateCode
        : existing.placeOfSupplyStateCode,
    billingAddressId: input.billingAddressId ?? null,
    shippingAddressId: input.shippingAddressId ?? null,
    templateId: input.templateId ?? existing.templateId,
    bankAccountId: input.bankAccountId !== undefined ? input.bankAccountId : existing.bankAccountId,
    showBankDetails: input.showBankDetails ?? existing.showBankDetails,
    discountMode: input.discountMode ?? existing.discountMode,
    discountValue: input.discountValue ?? existing.discountValue.toString(),
    adjustment: input.adjustment ?? existing.adjustment.toString(),
    roundOffEnabled: input.roundOffEnabled ?? existing.roundOffEnabled,
    notes: input.notes !== undefined ? input.notes : existing.notes,
    terms: input.terms !== undefined ? input.terms : existing.terms,
    customerMessage:
      input.customerMessage !== undefined ? input.customerMessage : existing.customerMessage,
    paymentInstructions:
      input.paymentInstructions !== undefined
        ? input.paymentInstructions
        : existing.paymentInstructions,
    customFields:
      input.customFields ??
      (Array.isArray(existing.customFieldsJson)
        ? (existing.customFieldsJson as { label: string; value: string }[])
        : []),
    items:
      input.items ??
      existing.items.map((item) => ({
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

  await prisma.$transaction(async (tx) => {
    const prepared = await prepareInvoice(tx, merged, existing.createdById);

    /* The number, financial year and creator never change on an update. */
    const { number: _n, financialYearId: _f, createdById: _c, ...updatable } = prepared.data;

    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

    await tx.invoice.update({
      where: { id },
      data: {
        ...updatable,
        updatedById: actorId,
        /* A revision is recorded only once the document has left DRAFT. */
        currentVersion: draft ? existing.currentVersion : existing.currentVersion + 1,
      },
    });

    await writeInvoiceLines(tx, id, prepared.items);

    if (!draft) {
      const updated = await tx.invoice.findUniqueOrThrow({
        where: { id },
        include: invoiceInclude,
      });

      await recordRevision(tx, {
        entity: 'INVOICE',
        documentId: id,
        currentVersion: existing.currentVersion,
        changedById: actorId,
        changeReason: input.changeReason,
        previousData: previous,
        newData: snapshotFor(updated),
      });
    }

    await recordAudit(
      {
        action: 'INVOICE_UPDATED',
        entityType: 'INVOICE',
        entityId: id,
        entityLabel: existing.number,
        previousData: { grandTotal: previous.grandTotal, status: previous.status },
        metadata: { reason: input.changeReason ?? null, versioned: !draft },
      },
      tx,
    );
  });

  return getInvoice(id);
};

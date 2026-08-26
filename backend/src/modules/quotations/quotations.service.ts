import type { Prisma, QuotationStatus } from '@prisma/client';
import {
  parseSort,
  toDateOnlyString,
  type CreateQuotationInput,
  type DocumentFilters,
  type PaginationQuery,
  type QuotationListRow,
  type QuotationRecord,
  type UpdateQuotationInput,
} from '@app/shared';
import { prisma, type TransactionClient } from '../../db/prisma';
import { ImmutableResourceError, NotFoundError } from '../../utils/errors';
import { recordAudit } from '../../services/audit.service';
import { allocateNumber } from '../../services/numbering.service';
import { assertChangeReason, recordRevision } from '../../services/revision.service';
import { prepareDocument, type PreparedLine } from '../documents/prepare.service';
import { quotationInclude, type QuotationWithRelations } from './document-data';
import { toQuotationRecord } from './quotations.mapper';

/**
 * Quotations.
 *
 * Every figure on a saved quotation is produced here, by the shared calculation
 * engine, inside the same transaction that assigns the number. Nothing the client
 * sends about money is trusted — the request schema does not even carry totals.
 */

const SORTABLE = ['number', 'documentDate', 'grandTotal', 'createdAt'] as const;

const toDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

/** Statuses after which an edit must record a revision with a reason. */
const isDraft = (status: QuotationStatus): boolean => status === 'DRAFT';

/** Derived, never stored, so it cannot go stale (PRD §18). */
export const isExpired = (quotation: {
  status: QuotationStatus;
  expiryDate: Date | null;
}): boolean => {
  if (!quotation.expiryDate) return false;
  if (['ACCEPTED', 'CONVERTED', 'DECLINED', 'CANCELLED'].includes(quotation.status)) return false;
  return toDateOnlyString(quotation.expiryDate) < toDateOnlyString(new Date());
};

// ------------------------------------------------------------ preparation ---

/**
 * Turns a validated request into the rows to persist.
 *
 * The work itself — snapshots, the calculation engine, the frozen tax summary —
 * lives in `modules/documents/prepare.service`, shared with invoices. Only the
 * quotation's own dates are added here.
 */
const prepareQuotation = async (
  tx: TransactionClient,
  input: CreateQuotationInput,
  actorId: number,
): Promise<{
  data: Prisma.QuotationUncheckedCreateInput;
  items: PreparedLine[];
}> => {
  const prepared = await prepareDocument(tx, 'QUOTATION', input);

  return {
    data: {
      ...prepared.header,
      number: '',
      financialYearId: 0,
      expiryDate: input.expiryDate ? toDate(input.expiryDate) : null,
      createdById: actorId,
    },
    items: prepared.items,
  };
};

// ---------------------------------------------------------------- queries ---

export const listQuotations = async (query: PaginationQuery & DocumentFilters) => {
  const { field, direction } = parseSort(query.sort, SORTABLE, {
    field: 'documentDate',
    direction: 'desc',
  });

  const where: Prisma.QuotationWhereInput = {
    deletedAt: null,
    ...(query.status ? { status: query.status as QuotationStatus } : {}),
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
    prisma.quotation.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        currency: true,
        createdBy: { select: { name: true } },
        invoices: { select: { number: true }, take: 1 },
      },
      orderBy: { [field]: direction },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.quotation.count({ where }),
  ]);

  const items: QuotationListRow[] = rows.map((row) => ({
    id: row.id.toString(),
    number: row.number,
    status: row.status,
    customerId: row.customerId,
    customerName: row.customer.name,
    documentDate: toDateOnlyString(row.documentDate),
    expiryDate: row.expiryDate ? toDateOnlyString(row.expiryDate) : null,
    currencyCode: row.currencyCode,
    currencySymbol: row.currencySymbol,
    currencyDecimalPlaces: row.currencyDecimalPlaces,
    grandTotal: row.grandTotal.toString(),
    createdByName: row.createdBy.name,
    createdAt: row.createdAt.toISOString(),
    isExpired: isExpired(row),
    convertedInvoiceNumber: row.invoices[0]?.number ?? null,
  }));

  return { items, total };
};

export const findQuotation = async (id: bigint): Promise<QuotationWithRelations> => {
  const quotation = await prisma.quotation.findFirst({
    where: { id, deletedAt: null },
    include: quotationInclude,
  });
  if (!quotation) throw new NotFoundError('Quotation');
  return quotation;
};

export const getQuotation = async (id: bigint): Promise<QuotationRecord> =>
  toQuotationRecord(await findQuotation(id));

// ----------------------------------------------------------------- writes ---

export const createQuotation = async (
  input: CreateQuotationInput,
  actorId: number,
): Promise<QuotationRecord> => {
  const created = await prisma.$transaction(async (tx) => {
    const prepared = await prepareQuotation(tx, input, actorId);

    /* Number and financial year come from the document date, allocated under a
       row lock inside this transaction — so a failed save burns no number. */
    const allocated = await allocateNumber(tx, 'QUOTATION', input.documentDate);

    const quotation = await tx.quotation.create({
      data: {
        ...prepared.data,
        number: allocated.number,
        financialYearId: allocated.financialYearId,
      },
    });

    for (const item of prepared.items) {
      const line = await tx.quotationItem.create({
        data: { ...item.line, quotationId: quotation.id },
      });
      if (item.taxes.length > 0) {
        await tx.quotationItemTax.createMany({
          data: item.taxes.map((tax) => ({ ...tax, quotationItemId: line.id })),
        });
      }
    }

    await recordAudit(
      {
        action: 'QUOTATION_CREATED',
        entityType: 'QUOTATION',
        entityId: quotation.id,
        entityLabel: quotation.number,
        newData: {
          customer: input.customerId,
          currency: quotation.currencyCode,
          grandTotal: quotation.grandTotal.toString(),
          lines: input.items.length,
        },
      },
      tx,
    );

    return quotation.id;
  });

  return getQuotation(created);
};

/** A compact snapshot for the revision history — the shape a diff reads well over. */
const snapshotFor = (quotation: QuotationWithRelations) => ({
  customerId: quotation.customerId,
  documentDate: toDateOnlyString(quotation.documentDate),
  expiryDate: quotation.expiryDate ? toDateOnlyString(quotation.expiryDate) : null,
  referenceNumber: quotation.referenceNumber,
  subject: quotation.subject,
  currencyCode: quotation.currencyCode,
  exchangeRateToBase: quotation.exchangeRateToBase.toString(),
  placeOfSupplyStateCode: quotation.placeOfSupplyStateCode,
  discountMode: quotation.discountMode,
  discountValue: quotation.discountValue.toString(),
  subtotal: quotation.subtotal.toString(),
  discountTotal: quotation.discountTotal.toString(),
  taxableTotal: quotation.taxableTotal.toString(),
  taxTotal: quotation.taxTotal.toString(),
  adjustment: quotation.adjustment.toString(),
  roundOff: quotation.roundOff.toString(),
  roundOffEnabled: quotation.roundOffEnabled,
  grandTotal: quotation.grandTotal.toString(),
  notes: quotation.notes,
  terms: quotation.terms,
  customerMessage: quotation.customerMessage,
  paymentInstructions: quotation.paymentInstructions,
  bankAccountId: quotation.bankAccountId,
  showBankDetails: quotation.showBankDetails,
  templateVersionId: quotation.templateVersionId,
  status: quotation.status,
  items: quotation.items.map((item) => ({
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

export const updateQuotation = async (
  id: bigint,
  input: UpdateQuotationInput,
  actorId: number,
): Promise<QuotationRecord> => {
  const existing = await findQuotation(id);

  if (existing.status === 'CANCELLED' || existing.status === 'CONVERTED') {
    throw new ImmutableResourceError(
      existing.status === 'CONVERTED'
        ? `${existing.number} has been converted to an invoice and can no longer be changed.`
        : `${existing.number} is cancelled and can no longer be changed.`,
    );
  }

  const draft = isDraft(existing.status);
  assertChangeReason(existing.status, input.changeReason);

  const previous = snapshotFor(existing);

  /* Merge the partial payload over the stored document so the engine always sees
     a complete input — a PATCH of one field still recalculates everything. */
  const merged: CreateQuotationInput = {
    customerId: input.customerId ?? existing.customerId,
    documentDate: input.documentDate ?? toDateOnlyString(existing.documentDate),
    expiryDate:
      input.expiryDate !== undefined
        ? input.expiryDate
        : existing.expiryDate
          ? toDateOnlyString(existing.expiryDate)
          : null,
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
    const prepared = await prepareQuotation(tx, merged, existing.createdById);

    /* The number, financial year and creator never change on an update. */
    const { number: _n, financialYearId: _f, createdById: _c, ...updatable } = prepared.data;

    await tx.quotationItem.deleteMany({ where: { quotationId: id } });

    await tx.quotation.update({
      where: { id },
      data: {
        ...updatable,
        updatedById: actorId,
        /* A revision is recorded only once the document has left DRAFT. */
        currentVersion: draft ? existing.currentVersion : existing.currentVersion + 1,
      },
    });

    for (const item of prepared.items) {
      const line = await tx.quotationItem.create({
        data: { ...item.line, quotationId: id },
      });
      if (item.taxes.length > 0) {
        await tx.quotationItemTax.createMany({
          data: item.taxes.map((tax) => ({ ...tax, quotationItemId: line.id })),
        });
      }
    }

    if (!draft) {
      const updated = await tx.quotation.findUniqueOrThrow({
        where: { id },
        include: quotationInclude,
      });

      await recordRevision(tx, {
        entity: 'QUOTATION',
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
        action: 'QUOTATION_UPDATED',
        entityType: 'QUOTATION',
        entityId: id,
        entityLabel: existing.number,
        previousData: { grandTotal: previous.grandTotal, status: previous.status },
        metadata: { reason: input.changeReason ?? null, versioned: !draft },
      },
      tx,
    );
  });

  return getQuotation(id);
};

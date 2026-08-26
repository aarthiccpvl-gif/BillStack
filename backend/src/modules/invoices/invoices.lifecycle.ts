import { Prisma } from '@prisma/client';
import {
  INVOICE_TRANSITIONS,
  toDateOnlyString,
  type DocumentRevisionRecord,
  type InvoiceRecord,
  type InvoiceStatusInput,
  type PaymentUpdateInput,
  type StoredInvoiceStatus,
} from '@app/shared';
import { prisma } from '../../db/prisma';
import { BusinessRuleError, ImmutableResourceError, NotFoundError } from '../../utils/errors';
import { recordAudit } from '../../services/audit.service';
import { buildPageFurniture, renderDocumentHtml } from '../../render/render.service';
import { renderPdf } from '../../pdf/pdf.service';
import { getStorage } from '../../storage/storage.service';
import { buildInvoiceData } from './document-data';
import { findInvoice, getInvoice } from './invoices.service';
import { outstandingOf, statusForPayment } from './invoices.payments';

/**
 * The invoice lifecycle: issuing, status changes, payment, cancellation, voiding,
 * duplication, PDFs and revisions.
 *
 * The transition table lives in `@app/shared` so the buttons the UI offers and the
 * changes this module accepts cannot drift apart — but it is enforced *here*,
 * never trusted from the client.
 *
 * Nothing in this file deletes anything. An invoice that should not exist is
 * cancelled or voided, keeping its number and its history, because a financial
 * document that can vanish is not a record.
 */

type TimestampField =
  'issuedAt' | 'sentAt' | 'firstViewedAt' | 'paidAt' | 'cancelledAt' | 'voidedAt';

const TIMESTAMP_FIELD: Partial<Record<StoredInvoiceStatus, TimestampField>> = {
  ISSUED: 'issuedAt',
  SENT: 'sentAt',
  VIEWED: 'firstViewedAt',
  PAID: 'paidAt',
  CANCELLED: 'cancelledAt',
  VOID: 'voidedAt',
};

export const assertTransition = (from: StoredInvoiceStatus, to: StoredInvoiceStatus): void => {
  if (from === to) return;

  const allowed = INVOICE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new BusinessRuleError(
      allowed.length === 0
        ? `A ${from.toLowerCase()} invoice cannot change status.`
        : `A ${from.toLowerCase()} invoice can only become ${allowed.join(', ').toLowerCase()}.`,
      'INVALID_STATUS_TRANSITION',
    );
  }
};

/** One place to move an invoice's status, so every move is audited the same way. */
const applyStatus = async (
  id: bigint,
  existing: Record<TimestampField, Date | null> & { number: string; status: StoredInvoiceStatus },
  next: StoredInvoiceStatus,
  actorId: number,
  extra: { reason?: string | null; data?: Prisma.InvoiceUncheckedUpdateInput } = {},
): Promise<void> => {
  assertTransition(existing.status, next);

  /* Write-once: "issued on" and "sent on" are facts about when something first
     happened, so repeating the action must not quietly move the date. */
  const timestampField = TIMESTAMP_FIELD[next];
  const stampIt = timestampField && existing[timestampField] === null;

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id },
      data: {
        status: next,
        updatedById: actorId,
        ...(stampIt && timestampField ? { [timestampField]: new Date() } : {}),
        ...(extra.reason !== undefined ? { cancelReason: extra.reason } : {}),
        ...extra.data,
      },
    });

    await recordAudit(
      {
        action:
          next === 'CANCELLED'
            ? 'INVOICE_CANCELLED'
            : next === 'VOID'
              ? 'INVOICE_VOIDED'
              : 'INVOICE_STATUS_CHANGED',
        entityType: 'INVOICE',
        entityId: id,
        entityLabel: existing.number,
        previousData: { status: existing.status },
        newData: { status: next },
        metadata: { reason: extra.reason ?? null },
      },
      tx,
    );
  });
};

/**
 * Issue — the moment the document stops being a draft and becomes a claim on a
 * customer. From here on an edit records a revision and the number is fixed.
 */
export const issueInvoice = async (id: bigint, actorId: number): Promise<InvoiceRecord> => {
  const existing = await findInvoice(id);

  /* Stated rather than left to the transition table, which treats a repeat of the
     current status as a harmless no-op. Issuing is not something to do twice. */
  if (existing.status !== 'DRAFT') {
    throw new BusinessRuleError(
      `${existing.number} was already issued on ${existing.issuedAt?.toISOString().slice(0, 10) ?? 'an earlier date'}.`,
      'INVALID_STATUS_TRANSITION',
    );
  }

  await applyStatus(id, existing, 'ISSUED', actorId);
  return getInvoice(id);
};

export const changeStatus = async (
  id: bigint,
  input: InvoiceStatusInput,
  actorId: number,
): Promise<InvoiceRecord> => {
  const existing = await findInvoice(id);
  await applyStatus(id, existing, input.status, actorId, { reason: input.reason ?? null });
  return getInvoice(id);
};

/**
 * Cancel — for an invoice that should not have been raised. The number stays
 * used, so the gap in the sequence is explainable to anyone who asks.
 */
export const cancelInvoice = async (
  id: bigint,
  reason: string,
  actorId: number,
): Promise<InvoiceRecord> => {
  const existing = await findInvoice(id);

  if (existing.amountPaid.greaterThan(0)) {
    throw new BusinessRuleError(
      `${existing.number} already has ${existing.currencySymbol}${existing.amountPaid.toString()} recorded against it. Void it instead — cancelling would hide money that was received.`,
    );
  }

  await applyStatus(id, existing, 'CANCELLED', actorId, { reason });
  return getInvoice(id);
};

/**
 * Void — for an invoice that was raised correctly and is being nullified anyway,
 * typically after it has been sent or partly paid. The figures stay exactly as
 * they were; only the status says the document no longer stands.
 */
export const voidInvoice = async (
  id: bigint,
  reason: string,
  actorId: number,
): Promise<InvoiceRecord> => {
  const existing = await findInvoice(id);
  await applyStatus(id, existing, 'VOID', actorId, { reason });
  return getInvoice(id);
};

/**
 * Record what has been received (decision Q2).
 *
 * The amount is the input; the status is the consequence. An invoice cannot be
 * marked paid without the money to match, and correcting an amount back down
 * returns the invoice to being owed rather than leaving a stale "PAID" behind.
 */
export const recordPayment = async (
  id: bigint,
  input: PaymentUpdateInput,
  actorId: number,
): Promise<InvoiceRecord> => {
  const existing = await findInvoice(id);

  if (existing.status === 'DRAFT') {
    throw new BusinessRuleError(
      `${existing.number} has not been issued yet, so nothing can be owed against it.`,
    );
  }
  if (existing.status === 'CANCELLED' || existing.status === 'VOID') {
    throw new ImmutableResourceError(
      `${existing.number} has been ${existing.status.toLowerCase()}; no payment can be recorded against it.`,
    );
  }

  const amountPaid = new Prisma.Decimal(input.amountPaid);
  if (amountPaid.isNegative()) {
    throw new BusinessRuleError('A recorded payment cannot be negative.');
  }
  if (amountPaid.greaterThan(existing.grandTotal)) {
    throw new BusinessRuleError(
      `That is more than the invoice total of ${existing.currencySymbol}${existing.grandTotal.toString()}.`,
    );
  }

  const nextStatus = statusForPayment(existing.status, existing.grandTotal, amountPaid);

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id },
      data: {
        amountPaid,
        paymentReference: input.paymentReference ?? null,
        status: nextStatus,
        updatedById: actorId,
        paidAt:
          nextStatus === 'PAID'
            ? input.paidOn
              ? new Date(`${input.paidOn}T00:00:00.000Z`)
              : (existing.paidAt ?? new Date())
            : null,
      },
    });

    await recordAudit(
      {
        action: 'PAYMENT_STATUS_CHANGED',
        entityType: 'INVOICE',
        entityId: id,
        entityLabel: existing.number,
        previousData: {
          amountPaid: existing.amountPaid.toString(),
          status: existing.status,
        },
        newData: { amountPaid: amountPaid.toString(), status: nextStatus },
        metadata: {
          reference: input.paymentReference ?? null,
          outstanding: outstandingOf({ grandTotal: existing.grandTotal, amountPaid }).toString(),
        },
      },
      tx,
    );
  });

  return getInvoice(id);
};

/**
 * Duplicate.
 *
 * Copies the content, not the identity: the copy is a fresh draft with its own
 * number, today's date, and none of the original's history or payments.
 */
export const duplicateInvoice = async (id: bigint, actorId: number): Promise<InvoiceRecord> => {
  const source = await findInvoice(id);
  const { createInvoice } = await import('./invoices.service');

  return createInvoice(
    {
      customerId: source.customerId,
      documentDate: toDateOnlyString(new Date()),
      dueDate: null,
      paymentTermsDays: source.paymentTermsDays,
      referenceNumber: source.referenceNumber,
      subject: source.subject,
      currencyCode: source.currencyCode,
      exchangeRateToBase: source.exchangeRateToBase.toString(),
      placeOfSupplyStateCode: source.placeOfSupplyStateCode,
      billingAddressId: null,
      shippingAddressId: null,
      templateId: source.templateId,
      bankAccountId: source.bankAccountId,
      showBankDetails: source.showBankDetails,
      discountMode: source.discountMode,
      discountValue: source.discountValue.toString(),
      adjustment: source.adjustment.toString(),
      roundOffEnabled: source.roundOffEnabled,
      notes: source.notes,
      terms: source.terms,
      customerMessage: source.customerMessage,
      paymentInstructions: source.paymentInstructions,
      customFields: Array.isArray(source.customFieldsJson)
        ? (source.customFieldsJson as { label: string; value: string }[])
        : [],
      items: source.items.map((item) => ({
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
    },
    actorId,
  );
};

/**
 * Soft delete, drafts only (decision Q8).
 *
 * The row and its number survive so the gap in the sequence stays explainable;
 * anything already issued is cancelled or voided instead.
 */
export const deleteDraft = async (id: bigint, actorId: number): Promise<void> => {
  const existing = await findInvoice(id);

  if (existing.status !== 'DRAFT') {
    throw new ImmutableResourceError(
      `${existing.number} has been issued, so it cannot be deleted. Cancel or void it instead — financial documents are kept permanently.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: actorId },
    });

    await recordAudit(
      {
        action: 'INVOICE_DELETED',
        entityType: 'INVOICE',
        entityId: id,
        entityLabel: existing.number,
        metadata: { note: 'Soft delete; the number is not reused.' },
      },
      tx,
    );
  });
};

// -------------------------------------------------------------- revisions ---

export const listRevisions = async (id: bigint): Promise<DocumentRevisionRecord[]> => {
  const revisions = await prisma.invoiceRevision.findMany({
    where: { invoiceId: id },
    orderBy: { version: 'desc' },
  });

  const userIds = [...new Set(revisions.map((revision) => revision.changedById))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(users.map((user) => [user.id, user.name]));

  return revisions.map((revision) => {
    const diff = revision.diffSummaryJson as { changedFields?: string[] } | null;
    return {
      id: revision.id.toString(),
      version: revision.version,
      changedById: revision.changedById,
      changedByName: nameOf.get(revision.changedById) ?? 'Unknown',
      changeReason: revision.changeReason,
      changedFields: diff?.changedFields ?? [],
      createdAt: revision.createdAt.toISOString(),
    };
  });
};

/** The stored snapshot of one historical version, for the compare view. */
export const getRevisionSnapshot = async (id: bigint, version: number) => {
  const revision = await prisma.invoiceRevision.findUnique({
    where: { invoiceId_version: { invoiceId: id, version } },
  });
  if (!revision) throw new NotFoundError('Revision');

  return {
    version: revision.version,
    changeReason: revision.changeReason,
    createdAt: revision.createdAt.toISOString(),
    previous: revision.previousDataJson,
    next: revision.newDataJson,
  };
};

// -------------------------------------------------------------------- pdf ---

const pdfStorageKey = (
  financialYear: string,
  number: string,
  documentVersion: number,
  templateVersion: number,
): string => {
  /* A document number contains a slash, which would create directories. */
  const safeNumber = number.replace(/[^\w.-]+/g, '-');
  return `documents/invoices/${financialYear}/${safeNumber}/v${documentVersion}-t${templateVersion}.pdf`;
};

export interface GeneratedPdf {
  fileId: string;
  storageKey: string;
  fileName: string;
  sizeBytes: number;
  cached: boolean;
}

/**
 * Generates the PDF, or returns the one already stored.
 *
 * A file is keyed by document version *and* template version, so editing a
 * document produces a new file and leaves the one the customer received
 * byte-identical and still downloadable.
 */
export const generatePdf = async (
  id: bigint,
  actorId: number,
  force = false,
): Promise<GeneratedPdf> => {
  const invoice = await findInvoice(id);
  const templateVersion = invoice.templateVersion.version;

  const existing = await prisma.documentFile.findFirst({
    where: {
      entityType: 'INVOICE',
      entityId: id,
      kind: 'GENERATED_PDF',
      documentVersion: invoice.currentVersion,
      templateVersionId: invoice.templateVersionId,
    },
    orderBy: { id: 'desc' },
  });

  const storage = getStorage();

  if (existing && !force && (await storage.exists(existing.storageKey))) {
    return {
      fileId: existing.id.toString(),
      storageKey: existing.storageKey,
      fileName: existing.fileName,
      sizeBytes: existing.sizeBytes,
      cached: true,
    };
  }

  const { data, config, engineKey } = await buildInvoiceData(invoice, { withAssets: true });
  const html = renderDocumentHtml({ data, config, engineKey });
  const furniture = buildPageFurniture(data, config);
  const buffer = await renderPdf(html, { ...furniture, marginsMm: config.layout.marginsMm });

  const key = pdfStorageKey(
    invoice.financialYear.code,
    invoice.number,
    invoice.currentVersion,
    templateVersion,
  );
  const stored = await storage.put(key, buffer, 'application/pdf');
  const fileName = `${invoice.number.replace(/[^\w.-]+/g, '-')}.pdf`;

  const file = await prisma.documentFile.create({
    data: {
      entityType: 'INVOICE',
      entityId: id,
      kind: 'GENERATED_PDF',
      documentVersion: invoice.currentVersion,
      templateVersionId: invoice.templateVersionId,
      storageKey: stored.storageKey,
      fileName,
      mimeType: 'application/pdf',
      sizeBytes: stored.sizeBytes,
      checksumSha256: stored.checksumSha256,
      createdById: actorId,
    },
  });

  await recordAudit({
    action: 'DOCUMENT_PDF_GENERATED',
    entityType: 'INVOICE',
    entityId: id,
    entityLabel: invoice.number,
    metadata: {
      documentVersion: invoice.currentVersion,
      templateVersion,
      sizeBytes: stored.sizeBytes,
      /* Lets an auditor prove a re-download is the same file. */
      checksum: stored.checksumSha256,
    },
  });

  return {
    fileId: file.id.toString(),
    storageKey: stored.storageKey,
    fileName,
    sizeBytes: stored.sizeBytes,
    cached: false,
  };
};

/** Renders the current state to HTML without storing anything. */
export const previewInvoiceHtml = async (id: bigint): Promise<string> => {
  const invoice = await findInvoice(id);
  const { data, config, engineKey } = await buildInvoiceData(invoice, { withAssets: true });
  return renderDocumentHtml({ data, config, engineKey });
};

/** Marks an invoice viewed the first time its share link is opened. */
export const markViewedFromShare = async (id: bigint): Promise<void> => {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return;

  if (invoice.status === 'SENT') {
    await prisma.invoice.update({
      where: { id },
      data: { status: 'VIEWED', firstViewedAt: invoice.firstViewedAt ?? new Date() },
    });

    await recordAudit({
      action: 'INVOICE_VIEWED',
      entityType: 'INVOICE',
      entityId: id,
      entityLabel: invoice.number,
      metadata: { via: 'share link' },
    });
  } else if (!invoice.firstViewedAt) {
    await prisma.invoice.update({ where: { id }, data: { firstViewedAt: new Date() } });
  }
};

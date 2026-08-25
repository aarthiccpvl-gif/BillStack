import { createHash } from 'node:crypto';
import type { QuotationStatus } from '@prisma/client';
import type { DocumentRevisionRecord, QuotationRecord, QuotationStatusInput } from '@app/shared';
import { QUOTATION_TRANSITIONS, toDateOnlyString } from '@app/shared';
import { prisma } from '../../db/prisma';
import { BusinessRuleError, ImmutableResourceError, NotFoundError } from '../../utils/errors';
import { recordAudit } from '../../services/audit.service';
import { buildPageFurniture, renderDocumentHtml } from '../../render/render.service';
import { renderPdf } from '../../pdf/pdf.service';
import { getStorage } from '../../storage/storage.service';
import { buildQuotationData } from './document-data';
import { findQuotation, getQuotation, isExpired } from './quotations.service';
import { toQuotationRecord } from './quotations.mapper';

/**
 * The quotation lifecycle: status changes, duplication, deletion and PDFs.
 *
 * The transition table lives in `@app/shared` so the buttons the UI offers and the
 * changes this module accepts cannot drift apart — but it is enforced *here*,
 * never trusted from the client, so an out-of-order change is refused with an
 * explanation instead of quietly corrupting the history.
 */

const TIMESTAMP_FIELD: Partial<Record<QuotationStatus, string>> = {
  SENT: 'sentAt',
  VIEWED: 'firstViewedAt',
  ACCEPTED: 'acceptedAt',
  DECLINED: 'declinedAt',
  CANCELLED: 'cancelledAt',
};

export const assertTransition = (from: QuotationStatus, to: QuotationStatus): void => {
  if (from === to) return;

  const allowed = QUOTATION_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new BusinessRuleError(
      allowed.length === 0
        ? `A ${from.toLowerCase()} quotation cannot change status.`
        : `A ${from.toLowerCase()} quotation can only become ${allowed.join(', ').toLowerCase()}.`,
      'INVALID_STATUS_TRANSITION',
    );
  }
};

export const changeStatus = async (
  id: bigint,
  input: QuotationStatusInput,
  actorId: number,
): Promise<QuotationRecord> => {
  const existing = await findQuotation(id);
  assertTransition(existing.status, input.status);

  if (input.status === 'CANCELLED' && (!input.reason || input.reason.trim().length < 3)) {
    throw new BusinessRuleError('Give a reason when cancelling a quotation.');
  }

  const timestampField = TIMESTAMP_FIELD[input.status];

  await prisma.$transaction(async (tx) => {
    await tx.quotation.update({
      where: { id },
      data: {
        status: input.status,
        updatedById: actorId,
        ...(timestampField ? { [timestampField]: new Date() } : {}),
        ...(input.status === 'CANCELLED' ? { cancelReason: input.reason ?? null } : {}),
      },
    });

    await recordAudit(
      {
        action: 'QUOTATION_STATUS_CHANGED',
        entityType: 'QUOTATION',
        entityId: id,
        entityLabel: existing.number,
        previousData: { status: existing.status },
        newData: { status: input.status },
        metadata: { reason: input.reason ?? null },
      },
      tx,
    );
  });

  return getQuotation(id);
};

/**
 * Duplicate.
 *
 * Copies the content, not the identity: the copy is a fresh draft with its own
 * number, today's date, and none of the original's history.
 */
export const duplicateQuotation = async (id: bigint, actorId: number): Promise<QuotationRecord> => {
  const source = await findQuotation(id);
  const { createQuotation } = await import('./quotations.service');

  return createQuotation(
    {
      customerId: source.customerId,
      documentDate: toDateOnlyString(new Date()),
      expiryDate: null,
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
 * anything already issued is cancelled instead.
 */
export const deleteDraft = async (id: bigint, actorId: number): Promise<void> => {
  const existing = await findQuotation(id);

  if (existing.status !== 'DRAFT') {
    throw new ImmutableResourceError(
      `${existing.number} has been issued, so it cannot be deleted. Cancel it instead — financial documents are kept permanently.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.quotation.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: actorId },
    });

    await recordAudit(
      {
        action: 'QUOTATION_DELETED',
        entityType: 'QUOTATION',
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
  const revisions = await prisma.quotationRevision.findMany({
    where: { quotationId: id },
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
  const revision = await prisma.quotationRevision.findUnique({
    where: { quotationId_version: { quotationId: id, version } },
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
  return `documents/quotations/${financialYear}/${safeNumber}/v${documentVersion}-t${templateVersion}.pdf`;
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
  const quotation = await findQuotation(id);
  const templateVersion = quotation.templateVersion.version;

  const existing = await prisma.documentFile.findFirst({
    where: {
      entityType: 'QUOTATION',
      entityId: id,
      kind: 'GENERATED_PDF',
      documentVersion: quotation.currentVersion,
      templateVersionId: quotation.templateVersionId,
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

  const { data, config, engineKey } = await buildQuotationData(quotation, { withAssets: true });
  const html = renderDocumentHtml({ data, config, engineKey });
  const furniture = buildPageFurniture(data, config);
  const buffer = await renderPdf(html, { ...furniture, marginsMm: config.layout.marginsMm });

  const key = pdfStorageKey(
    quotation.financialYear.code,
    quotation.number,
    quotation.currentVersion,
    templateVersion,
  );
  const stored = await storage.put(key, buffer, 'application/pdf');
  const fileName = `${quotation.number.replace(/[^\w.-]+/g, '-')}.pdf`;

  const file = await prisma.documentFile.create({
    data: {
      entityType: 'QUOTATION',
      entityId: id,
      kind: 'GENERATED_PDF',
      documentVersion: quotation.currentVersion,
      templateVersionId: quotation.templateVersionId,
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
    entityType: 'QUOTATION',
    entityId: id,
    entityLabel: quotation.number,
    metadata: {
      documentVersion: quotation.currentVersion,
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
export const previewQuotationHtml = async (id: bigint): Promise<string> => {
  const quotation = await findQuotation(id);
  const { data, config, engineKey } = await buildQuotationData(quotation, { withAssets: true });
  return renderDocumentHtml({ data, config, engineKey });
};

/** Marks a quotation viewed the first time its share link is opened. */
export const markViewedFromShare = async (id: bigint): Promise<void> => {
  const quotation = await prisma.quotation.findUnique({ where: { id } });
  if (!quotation) return;

  if (quotation.status === 'SENT') {
    await prisma.quotation.update({
      where: { id },
      data: { status: 'VIEWED', firstViewedAt: quotation.firstViewedAt ?? new Date() },
    });

    await recordAudit({
      action: 'QUOTATION_VIEWED',
      entityType: 'QUOTATION',
      entityId: id,
      entityLabel: quotation.number,
      metadata: { via: 'share link' },
    });
  } else if (!quotation.firstViewedAt) {
    await prisma.quotation.update({ where: { id }, data: { firstViewedAt: new Date() } });
  }
};

/** Stamps EXPIRED on quotations past their date; run by the daily job in Phase 8. */
export const expireOverdueQuotations = async (): Promise<number> => {
  const today = new Date(`${toDateOnlyString(new Date())}T00:00:00.000Z`);

  const { count } = await prisma.quotation.updateMany({
    where: {
      deletedAt: null,
      status: { in: ['SENT', 'VIEWED'] },
      expiryDate: { lt: today },
    },
    data: { status: 'EXPIRED' },
  });

  return count;
};

/** Exposed for the tests that assert the derived-expiry rule. */
export const quotationIsExpired = isExpired;

/** Stable identity for a stored PDF, used by the download audit entry. */
export const checksumOf = (buffer: Buffer): string =>
  createHash('sha256').update(buffer).digest('hex');

/** Re-exported so routes can map a record without importing the mapper directly. */
export const asRecord = toQuotationRecord;

import type { Prisma } from '@prisma/client';
import { requiresChangeReason } from '@app/shared';
import type { TransactionClient } from '../db/prisma';
import { AppError } from '../utils/errors';
import { ERROR_CODES } from '@app/shared';

/**
 * Revision history.
 *
 * A revision is written on every edit **after** a document leaves DRAFT. Draft
 * edits are audited but not versioned — otherwise typing a quotation over ten
 * saves would produce ten meaningless "versions".
 *
 * Each row keeps the full before and after snapshots rather than a diff, so any
 * historical state can be reconstructed directly and re-rendered with its own
 * template version.
 */

export type RevisionEntity = 'QUOTATION' | 'INVOICE';

export interface RecordRevisionInput {
  entity: RevisionEntity;
  documentId: bigint;
  /** The version being left behind; the new one is this plus one. */
  currentVersion: number;
  changedById: number;
  changeReason?: string | null;
  previousData: unknown;
  newData: unknown;
}

/** Fields a reader cares about, ignoring bookkeeping columns. */
const TRACKED_FIELDS = [
  'customerId',
  'documentDate',
  'expiryDate',
  'dueDate',
  'referenceNumber',
  'subject',
  'currencyCode',
  'exchangeRateToBase',
  'placeOfSupplyStateCode',
  'discountMode',
  'discountValue',
  'adjustment',
  'subtotal',
  'discountTotal',
  'taxableTotal',
  'taxTotal',
  'roundOff',
  'grandTotal',
  'notes',
  'terms',
  'customerMessage',
  'paymentInstructions',
  'bankAccountId',
  'showBankDetails',
  'templateVersionId',
  'status',
  'amountPaid',
  'items',
];

const normalise = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/** A human-readable list of what actually changed, for the history screen. */
export const diffFields = (previous: unknown, next: unknown): string[] => {
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object') {
    return [];
  }

  const before = previous as Record<string, unknown>;
  const after = next as Record<string, unknown>;

  return TRACKED_FIELDS.filter((field) => {
    if (!(field in before) && !(field in after)) return false;
    return normalise(before[field]) !== normalise(after[field]);
  });
};

/**
 * Requires a reason for a post-issue edit.
 *
 * Editing a document a customer already holds needs to be explainable later; a
 * revision without a reason is a gap in that story.
 */
export const assertChangeReason = (status: string, reason: string | null | undefined): void => {
  if (requiresChangeReason(status) && (!reason || reason.trim().length < 3)) {
    throw new AppError(
      ERROR_CODES.CHANGE_REASON_REQUIRED,
      422,
      'This document has already been issued. Give a short reason for the change so the history explains itself.',
    );
  }
};

export const recordRevision = async (
  tx: TransactionClient,
  input: RecordRevisionInput,
): Promise<number> => {
  const nextVersion = input.currentVersion + 1;
  const changedFields = diffFields(input.previousData, input.newData);

  const data = {
    version: input.currentVersion,
    changedById: input.changedById,
    changeReason: input.changeReason ?? null,
    previousDataJson: input.previousData as Prisma.InputJsonValue,
    newDataJson: input.newData as Prisma.InputJsonValue,
    diffSummaryJson: { changedFields } as Prisma.InputJsonValue,
  };

  if (input.entity === 'QUOTATION') {
    await tx.quotationRevision.create({ data: { ...data, quotationId: input.documentId } });
  } else {
    await tx.invoiceRevision.create({ data: { ...data, invoiceId: input.documentId } });
  }

  return nextVersion;
};

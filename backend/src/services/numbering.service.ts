import type { DocType } from '@prisma/client';
import { formatDocumentNumber, getFinancialYearBounds, toDateOnlyString } from '@app/shared';
import { prisma, type Db, type TransactionClient } from '../db/prisma';
import { BusinessRuleError } from '../utils/errors';
import { resolveForDate } from './financial-year.service';

/**
 * Document numbering.
 *
 * Three guarantees, in order of how they are achieved:
 *
 *   1. No duplicates — the counter row is locked with SELECT … FOR UPDATE, so
 *      concurrent creators serialise. A UNIQUE index on the number is the backstop.
 *   2. No burnt numbers — allocation happens inside the caller's transaction, so a
 *      failed document insert rolls the counter back with it.
 *   3. Never client-supplied — `number` is not part of any request schema.
 */

export interface AllocatedNumber {
  number: string;
  sequence: number;
  financialYearId: number;
  financialYearCode: string;
}

interface SequenceRow {
  id: number;
  last_number: number;
}

/**
 * Allocates the next number for a document type.
 *
 * MUST be called inside a transaction — the row lock is only held for the life of
 * one, and without it two simultaneous saves could read the same counter.
 */
export const allocateNumber = async (
  tx: TransactionClient,
  docType: DocType,
  documentDate: Date | string,
): Promise<AllocatedNumber> => {
  const series = await tx.numberingSeries.findFirst({
    where: { docType, isActive: true },
    orderBy: { id: 'asc' },
  });

  if (!series) {
    throw new BusinessRuleError(
      `No active numbering series is configured for ${docType.toLowerCase()}s. Set one up in Masters & Numbering.`,
    );
  }

  const financialYear = await resolveForDate(documentDate, tx);
  /* A series that never resets shares one counter, so it is keyed on null. */
  const financialYearId = series.resetPolicy === 'FINANCIAL_YEAR' ? financialYear.id : null;

  /* Ensure the counter row exists. The unique index makes the race safe: a
     concurrent insert loses harmlessly and the row is then locked below. */
  await tx.$executeRawUnsafe(
    `INSERT IGNORE INTO document_sequences (numbering_series_id, financial_year_id, last_number, updated_at)
     VALUES (?, ?, ?, NOW(3))`,
    series.id,
    financialYearId,
    series.startNumber - 1,
  );

  /* MySQL treats NULL != NULL in a WHERE clause, so the null case needs IS NULL. */
  const rows = await tx.$queryRawUnsafe<SequenceRow[]>(
    financialYearId === null
      ? `SELECT id, last_number FROM document_sequences
           WHERE numbering_series_id = ? AND financial_year_id IS NULL FOR UPDATE`
      : `SELECT id, last_number FROM document_sequences
           WHERE numbering_series_id = ? AND financial_year_id = ? FOR UPDATE`,
    ...(financialYearId === null ? [series.id] : [series.id, financialYearId]),
  );

  const row = rows[0];
  if (!row) {
    throw new BusinessRuleError('Could not allocate a document number. Please try again.');
  }

  const sequence = row.last_number + 1;

  await tx.$executeRawUnsafe(
    `UPDATE document_sequences SET last_number = ?, updated_at = NOW(3) WHERE id = ?`,
    sequence,
    row.id,
  );

  const startYear = Number(financialYear.code.slice(0, 4));

  return {
    number: formatDocumentNumber(
      { pattern: series.pattern, prefix: series.prefix, padding: series.padding },
      {
        sequence,
        financialYearStart: startYear,
        documentDate:
          typeof documentDate === 'string' ? documentDate : toDateOnlyString(documentDate),
      },
    ),
    sequence,
    financialYearId: financialYear.id,
    financialYearCode: financialYear.code,
  };
};

/** Next customer code, e.g. CUST-0007. Its own simple counter, never reset. */
export const allocateCustomerCode = async (tx: TransactionClient): Promise<string> => {
  const rows = await tx.$queryRawUnsafe<{ code: string }[]>(
    `SELECT customer_code AS code FROM customers
      WHERE customer_code REGEXP '^CUST-[0-9]+$'
      ORDER BY CAST(SUBSTRING(customer_code, 6) AS UNSIGNED) DESC LIMIT 1`,
  );

  const last = rows[0] ? Number(rows[0].code.slice(5)) : 0;
  return `CUST-${String(last + 1).padStart(4, '0')}`;
};

/** Next item code, e.g. ITM-0007. */
export const allocateItemCode = async (tx: TransactionClient): Promise<string> => {
  const rows = await tx.$queryRawUnsafe<{ code: string }[]>(
    `SELECT item_code AS code FROM items
      WHERE item_code REGEXP '^ITM-[0-9]+$'
      ORDER BY CAST(SUBSTRING(item_code, 5) AS UNSIGNED) DESC LIMIT 1`,
  );

  const last = rows[0] ? Number(rows[0].code.slice(4)) : 0;
  return `ITM-${String(last + 1).padStart(4, '0')}`;
};

/** What the numbering settings screen shows as a live example. */
export const previewSeries = async (
  seriesId: number,
  db: Db = prisma,
): Promise<{ preview: string; lastNumber: number }> => {
  const series = await db.numberingSeries.findUniqueOrThrow({ where: { id: seriesId } });
  const startMonth =
    (
      await db.companySettings.findUnique({
        where: { id: 1 },
        select: { financialYearStartMonth: true },
      })
    )?.financialYearStartMonth ?? 4;

  const bounds = getFinancialYearBounds(toDateOnlyString(new Date()), startMonth);
  const financialYear = await db.financialYear.findUnique({ where: { code: bounds.code } });

  const counter = financialYear
    ? await db.documentSequence.findFirst({
        where: {
          numberingSeriesId: series.id,
          financialYearId: series.resetPolicy === 'FINANCIAL_YEAR' ? financialYear.id : null,
        },
      })
    : null;

  const lastNumber = counter?.lastNumber ?? series.startNumber - 1;

  return {
    preview: formatDocumentNumber(
      { pattern: series.pattern, prefix: series.prefix, padding: series.padding },
      { sequence: lastNumber + 1, financialYearStart: bounds.startYear },
    ),
    lastNumber: Math.max(0, lastNumber),
  };
};

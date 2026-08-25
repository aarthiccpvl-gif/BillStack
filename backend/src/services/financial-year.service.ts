import type { FinancialYear } from '@prisma/client';
import { getFinancialYearBounds, toDateOnlyString } from '@app/shared';
import { prisma, type Db } from '../db/prisma';
import { BusinessRuleError, NotFoundError } from '../utils/errors';

/**
 * Financial years.
 *
 * The year is resolved from the **document date**, never the creation timestamp,
 * so back-dating an invoice into the previous year numbers it in that year's
 * series — which is what a finance team expects.
 */

let cachedStartMonth: { value: number; at: number } | null = null;
const START_MONTH_TTL_MS = 60_000;

export const getFinancialYearStartMonth = async (db: Db = prisma): Promise<number> => {
  if (cachedStartMonth && Date.now() - cachedStartMonth.at < START_MONTH_TTL_MS) {
    return cachedStartMonth.value;
  }
  const company = await db.companySettings.findUnique({
    where: { id: 1 },
    select: { financialYearStartMonth: true },
  });
  const value = company?.financialYearStartMonth ?? 4;
  cachedStartMonth = { value, at: Date.now() };
  return value;
};

export const invalidateFinancialYearCache = (): void => {
  cachedStartMonth = null;
};

const toDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

/**
 * The financial year containing `documentDate`, creating it if it does not exist.
 *
 * Auto-creation matters: without it the first document of a new year would fail
 * on 1 April until someone remembered to add the year by hand.
 */
export const resolveForDate = async (
  documentDate: Date | string,
  db: Db = prisma,
): Promise<FinancialYear> => {
  const startMonth = await getFinancialYearStartMonth(db);
  const dateOnly = typeof documentDate === 'string' ? documentDate : toDateOnlyString(documentDate);
  const bounds = getFinancialYearBounds(dateOnly, startMonth);

  const existing = await db.financialYear.findUnique({ where: { code: bounds.code } });
  if (existing) return existing;

  return db.financialYear.create({
    data: {
      code: bounds.code,
      startDate: toDate(bounds.startDate),
      endDate: toDate(bounds.endDate),
      isCurrent: false,
    },
  });
};

export const getCurrent = async (db: Db = prisma): Promise<FinancialYear> => {
  const today = toDateOnlyString(new Date());
  return resolveForDate(today, db);
};

export const listFinancialYears = async () => {
  const years = await prisma.financialYear.findMany({
    orderBy: { startDate: 'desc' },
    include: { _count: { select: { quotations: true, invoices: true } } },
  });

  const today = toDateOnlyString(new Date());
  const startMonth = await getFinancialYearStartMonth();
  const currentCode = getFinancialYearBounds(today, startMonth).code;

  return years.map((year) => ({
    id: year.id,
    code: year.code,
    startDate: toDateOnlyString(year.startDate),
    endDate: toDateOnlyString(year.endDate),
    /* Derived rather than trusted: a stale isCurrent flag would misfile documents. */
    isCurrent: year.code === currentCode,
    status: year.status,
    documentCounts: { quotations: year._count.quotations, invoices: year._count.invoices },
  }));
};

/** Creates the year containing the given date, if it is missing. */
export const createFinancialYear = async (startDate: string) => {
  const year = await resolveForDate(startDate);
  return year;
};

export const setFinancialYearStatus = async (id: number, status: 'OPEN' | 'CLOSED') => {
  const year = await prisma.financialYear.findUnique({ where: { id } });
  if (!year) throw new NotFoundError('Financial year');

  const today = toDateOnlyString(new Date());
  const startMonth = await getFinancialYearStartMonth();
  if (status === 'CLOSED' && getFinancialYearBounds(today, startMonth).code === year.code) {
    throw new BusinessRuleError('The current financial year cannot be closed.');
  }

  return prisma.financialYear.update({ where: { id }, data: { status } });
};

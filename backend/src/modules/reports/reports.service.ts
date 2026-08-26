import { toDateOnlyString, type ReportFilters, type ReportResult } from '@app/shared';
import { prisma } from '../../db/prisma';
import { NotFoundError } from '../../utils/errors';
import { REPORTS } from './report.queries';

/**
 * Reports, for the screen.
 *
 * The screen gets a capped number of rows — nobody reads five thousand of them in
 * a browser — and says so. The exports read the same definition with no cap, so
 * the file always carries the whole filtered set even when the page above it did
 * not.
 */

const SCREEN_LIMIT = 500;

/** The filters, written out the way a person would read them on the printed page. */
const describeFilters = async (
  filters: ReportFilters,
): Promise<{ label: string; value: string }[]> => {
  const applied: { label: string; value: string }[] = [];

  if (filters.dateFrom || filters.dateTo) {
    applied.push({
      label: 'Dates',
      value: `${filters.dateFrom ?? 'the beginning'} to ${filters.dateTo ?? 'today'}`,
    });
  }

  if (filters.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: filters.customerId },
      select: { name: true },
    });
    applied.push({ label: 'Customer', value: customer?.name ?? String(filters.customerId) });
  }

  if (filters.financialYearId) {
    const year = await prisma.financialYear.findUnique({
      where: { id: filters.financialYearId },
      select: { code: true },
    });
    applied.push({ label: 'Financial year', value: year?.code ?? String(filters.financialYearId) });
  }

  if (filters.currencyCode) applied.push({ label: 'Currency', value: filters.currencyCode });
  if (filters.status) applied.push({ label: 'Status', value: filters.status });
  if (filters.outstandingOnly) applied.push({ label: 'Showing', value: 'Unpaid only' });

  if (filters.createdById) {
    const user = await prisma.user.findUnique({
      where: { id: filters.createdById },
      select: { name: true },
    });
    applied.push({ label: 'Raised by', value: user?.name ?? String(filters.createdById) });
  }

  if (filters.search) applied.push({ label: 'Search', value: filters.search });

  return applied;
};

export const runReport = async (kind: string, filters: ReportFilters): Promise<ReportResult> => {
  const definition = REPORTS[kind];
  if (!definition) throw new NotFoundError('Report');

  const [rowCount, totals, filtersApplied] = await Promise.all([
    definition.count(filters),
    definition.totals(filters),
    describeFilters(filters),
  ]);

  const rows: Record<string, string>[] = [];
  for await (const row of definition.rows(filters, SCREEN_LIMIT)) {
    rows.push(row);
  }

  return {
    kind: definition.kind,
    title: definition.title,
    columns: definition.columns,
    rows,
    totals,
    meta: {
      generatedAt: new Date().toISOString(),
      rowCount,
      truncated: rowCount > rows.length,
      filtersApplied,
    },
  };
};

/** A file name a finance user can find again in six months. */
export const reportFileName = (kind: string, extension: string): string =>
  `${kind}-${toDateOnlyString(new Date())}.${extension}`;

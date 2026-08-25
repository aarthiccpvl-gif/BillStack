/**
 * Financial-year helpers.
 *
 * The start month is a parameter with an April default, so India's 1 Apr – 31 Mar
 * is a default rather than a hard-coded assumption.
 *
 * Document dates are calendar dates, not instants: they are handled as plain
 * `YYYY-MM-DD` strings or as UTC-midnight Dates so that a 31 March invoice can
 * never slip into the next financial year because of a timezone offset.
 */

export const DEFAULT_FY_START_MONTH = 4; // April

export interface FinancialYearBounds {
  /** e.g. "2026-27" */
  code: string;
  startYear: number;
  endYear: number;
  /** inclusive, YYYY-MM-DD */
  startDate: string;
  /** inclusive, YYYY-MM-DD */
  endDate: string;
}

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

export const toDateOnlyString = (date: Date): string =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** Parses `YYYY-MM-DD` as UTC midnight. Throws on anything else — dates matter here. */
export const parseDateOnly = (value: string): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Expected a YYYY-MM-DD date, received "${value}"`);
  }
  const [, year, month, day] = match;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Date.UTC happily rolls 2026-13-01 into 2027-01-01, so verify it round-trips.
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() + 1 !== m ||
    date.getUTCDate() !== d
  ) {
    throw new Error(`"${value}" is not a valid date`);
  }
  return date;
};

const asUtcDate = (value: Date | string): Date =>
  typeof value === 'string' ? parseDateOnly(value) : value;

/** "2026-27" for a financial year starting in 2026. */
export const formatFinancialYearCode = (startYear: number): string =>
  `${startYear}-${pad((startYear + 1) % 100)}`;

/** "2026-2027" — both years in full, the form used by the document numbering format. */
export const formatFinancialYearLong = (startYear: number): string =>
  `${startYear}-${startYear + 1}`;

/**
 * The financial year a document date falls in.
 *
 * With the April default: 2026-03-31 → FY 2025-26, and 2026-04-01 → FY 2026-27.
 */
export const getFinancialYearBounds = (
  date: Date | string,
  startMonth: number = DEFAULT_FY_START_MONTH,
): FinancialYearBounds => {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new Error(`Financial year start month must be 1-12, received ${startMonth}`);
  }

  const utc = asUtcDate(date);
  const year = utc.getUTCFullYear();
  const month = utc.getUTCMonth() + 1;
  const startYear = month >= startMonth ? year : year - 1;

  const start = new Date(Date.UTC(startYear, startMonth - 1, 1));
  // Day 0 of the following month is the last day of the previous one.
  const end = new Date(Date.UTC(startYear + 1, startMonth - 1, 0));

  return {
    code: formatFinancialYearCode(startYear),
    startYear,
    endYear: startYear + 1,
    startDate: toDateOnlyString(start),
    endDate: toDateOnlyString(end),
  };
};

export const isWithinFinancialYear = (
  date: Date | string,
  bounds: FinancialYearBounds,
): boolean => {
  const value = toDateOnlyString(asUtcDate(date));
  return value >= bounds.startDate && value <= bounds.endDate;
};

/** Adds days to a date-only value — used for due dates from payment terms. */
export const addDays = (date: Date | string, days: number): string => {
  const utc = asUtcDate(date);
  const result = new Date(utc.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return toDateOnlyString(result);
};

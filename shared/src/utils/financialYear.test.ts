import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatFinancialYearCode,
  getFinancialYearBounds,
  isWithinFinancialYear,
  parseDateOnly,
  toDateOnlyString,
} from './financialYear';

describe('financial year (April default)', () => {
  it('puts 31 March in the year that is ending', () => {
    const fy = getFinancialYearBounds('2026-03-31');
    expect(fy.code).toBe('2025-26');
    expect(fy.startDate).toBe('2025-04-01');
    expect(fy.endDate).toBe('2026-03-31');
  });

  it('puts 1 April in the year that is starting', () => {
    const fy = getFinancialYearBounds('2026-04-01');
    expect(fy.code).toBe('2026-27');
    expect(fy.startDate).toBe('2026-04-01');
    expect(fy.endDate).toBe('2027-03-31');
  });

  it('handles a leap-year end date', () => {
    expect(getFinancialYearBounds('2024-02-29').endDate).toBe('2024-03-31');
  });

  it('formats the code across a century boundary', () => {
    expect(formatFinancialYearCode(2099)).toBe('2099-00');
    expect(formatFinancialYearCode(2026)).toBe('2026-27');
  });

  it('supports a non-April start month for a future non-Indian entity', () => {
    const calendar = getFinancialYearBounds('2026-03-31', 1);
    expect(calendar.code).toBe('2026-27');
    expect(calendar.startDate).toBe('2026-01-01');
    expect(calendar.endDate).toBe('2026-12-31');
  });

  it('rejects an impossible start month', () => {
    expect(() => getFinancialYearBounds('2026-04-01', 13)).toThrow(/start month/i);
  });

  it('reports membership inclusively at both edges', () => {
    const fy = getFinancialYearBounds('2026-06-15');
    expect(isWithinFinancialYear('2026-04-01', fy)).toBe(true);
    expect(isWithinFinancialYear('2027-03-31', fy)).toBe(true);
    expect(isWithinFinancialYear('2027-04-01', fy)).toBe(false);
  });
});

describe('date-only handling', () => {
  it('round-trips without a timezone shift', () => {
    expect(toDateOnlyString(parseDateOnly('2026-03-31'))).toBe('2026-03-31');
  });

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(() => parseDateOnly('31-03-2026')).toThrow(/YYYY-MM-DD/);
    expect(() => parseDateOnly('2026-13-01')).toThrow();
  });

  it('adds days across month and year ends, for due dates', () => {
    expect(addDays('2026-08-24', 30)).toBe('2026-09-23');
    expect(addDays('2026-12-20', 30)).toBe('2027-01-19');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
});

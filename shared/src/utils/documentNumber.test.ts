import { describe, expect, it } from 'vitest';
import { formatDocumentNumber, previewDocumentNumber } from './documentNumber';

const CONFIRMED = { pattern: '{PREFIX}{SEQ}/{FY_LONG}', prefix: 'FT', padding: 3 };

describe('the confirmed numbering format (decision Q1)', () => {
  it('produces FT001/2026-2027', () => {
    expect(formatDocumentNumber(CONFIRMED, { sequence: 1, financialYearStart: 2026 })).toBe(
      'FT001/2026-2027',
    );
  });

  it('keeps counting within the financial year', () => {
    expect(formatDocumentNumber(CONFIRMED, { sequence: 15, financialYearStart: 2026 })).toBe(
      'FT015/2026-2027',
    );
    expect(formatDocumentNumber(CONFIRMED, { sequence: 247, financialYearStart: 2026 })).toBe(
      'FT247/2026-2027',
    );
  });

  it('restarts in the next financial year', () => {
    expect(formatDocumentNumber(CONFIRMED, { sequence: 1, financialYearStart: 2027 })).toBe(
      'FT001/2027-2028',
    );
  });

  it('grows past the padding width rather than truncating', () => {
    expect(formatDocumentNumber(CONFIRMED, { sequence: 1000, financialYearStart: 2026 })).toBe(
      'FT1000/2026-2027',
    );
  });

  it('uses the quotation prefix for the quotation series', () => {
    expect(
      formatDocumentNumber(
        { ...CONFIRMED, prefix: 'QT' },
        { sequence: 7, financialYearStart: 2026 },
      ),
    ).toBe('QT007/2026-2027');
  });

  it('renders the settings-screen preview', () => {
    expect(previewDocumentNumber(CONFIRMED, 2026)).toBe('FT001/2026-2027');
  });
});

describe('other supported formats stay reachable without a code change', () => {
  it('supports the PRD §10 style', () => {
    expect(
      formatDocumentNumber(
        { pattern: '{PREFIX}-{FY_START}-{SEQ}', prefix: 'INV', padding: 4 },
        { sequence: 15, financialYearStart: 2026 },
      ),
    ).toBe('INV-2026-0015');
  });

  it('supports the PRD §9 style with no year at all', () => {
    expect(
      formatDocumentNumber(
        { pattern: '{PREFIX}-{SEQ}', prefix: 'INV', padding: 4 },
        { sequence: 3, financialYearStart: 2026 },
      ),
    ).toBe('INV-0003');
  });

  it('supports short and full financial year tokens', () => {
    const context = { sequence: 2, financialYearStart: 2026 };
    expect(
      formatDocumentNumber({ pattern: '{FY_SHORT}/{SEQ}', prefix: '', padding: 2 }, context),
    ).toBe('26-27/02');
    expect(
      formatDocumentNumber({ pattern: '{FY_FULL}/{SEQ}', prefix: '', padding: 2 }, context),
    ).toBe('2026-27/02');
  });

  it('honours an inline padding override', () => {
    expect(
      formatDocumentNumber(
        { pattern: '{PREFIX}{SEQ:6}', prefix: 'FT', padding: 3 },
        { sequence: 15, financialYearStart: 2026 },
      ),
    ).toBe('FT000015');
  });

  it('fills date tokens from the document date', () => {
    expect(
      formatDocumentNumber(
        { pattern: '{PREFIX}/{YYYY}{MM}/{SEQ}', prefix: 'FT', padding: 3 },
        { sequence: 4, financialYearStart: 2026, documentDate: '2026-08-24' },
      ),
    ).toBe('FT/202608/004');
  });

  it('leaves an unknown token alone instead of producing "undefined"', () => {
    expect(
      formatDocumentNumber(
        { pattern: '{PREFIX}-{NOPE}-{SEQ}', prefix: 'FT', padding: 3 },
        { sequence: 1, financialYearStart: 2026 },
      ),
    ).toBe('FT-{NOPE}-001');
  });
});

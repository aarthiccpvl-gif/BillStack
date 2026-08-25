import { formatFinancialYearCode, formatFinancialYearLong, parseDateOnly } from './financialYear';

/**
 * Pure formatter for document numbers.
 *
 * The sequence itself is allocated by the backend under a row lock; this only turns
 * an allocated number into the configured string. Keeping it pure means the
 * numbering settings screen can show a live example of the format, using exactly the
 * code that will produce the real numbers.
 */

export interface NumberFormatConfig {
  /** e.g. "{PREFIX}{SEQ}/{FY_LONG}" */
  pattern: string;
  prefix: string;
  /** Zero-padding applied to {SEQ}; {SEQ:n} overrides it inline. */
  padding: number;
}

export interface NumberFormatContext {
  sequence: number;
  /** Financial year start calendar year, e.g. 2026 for FY 2026-27. */
  financialYearStart: number;
  /** Document date as YYYY-MM-DD; supplies the {YYYY}, {YY} and {MM} tokens. */
  documentDate?: string;
}

const padSequence = (sequence: number, width: number): string =>
  String(sequence).padStart(Math.max(0, width), '0');

/** Tokens the pattern may contain; anything unrecognised is left untouched. */
export const NUMBER_FORMAT_TOKENS = [
  '{PREFIX}',
  '{SEQ}',
  '{SEQ:n}',
  '{FY_LONG}',
  '{FY_FULL}',
  '{FY_SHORT}',
  '{FY_START}',
  '{FY_END}',
  '{YYYY}',
  '{YY}',
  '{MM}',
] as const;

export const formatDocumentNumber = (
  config: NumberFormatConfig,
  context: NumberFormatContext,
): string => {
  const startYear = context.financialYearStart;
  const fyCode = formatFinancialYearCode(startYear);

  let result = config.pattern;

  // {SEQ:6} — an inline padding override, resolved before the plain {SEQ}.
  result = result.replace(/\{SEQ:(\d{1,2})\}/g, (_match, width: string) =>
    padSequence(context.sequence, Number(width)),
  );

  const replacements: Record<string, string> = {
    '{PREFIX}': config.prefix,
    '{SEQ}': padSequence(context.sequence, config.padding),
    '{FY_LONG}': formatFinancialYearLong(startYear),
    '{FY_FULL}': fyCode,
    '{FY_SHORT}': fyCode.slice(2),
    '{FY_START}': String(startYear),
    '{FY_END}': String(startYear + 1),
  };

  if (context.documentDate) {
    const date = parseDateOnly(context.documentDate);
    replacements['{YYYY}'] = String(date.getUTCFullYear());
    replacements['{YY}'] = String(date.getUTCFullYear() % 100).padStart(2, '0');
    replacements['{MM}'] = String(date.getUTCMonth() + 1).padStart(2, '0');
  }

  for (const [token, value] of Object.entries(replacements)) {
    result = result.split(token).join(value);
  }

  return result;
};

/** Renders a sample for the numbering settings screen, e.g. "FT001/2026-2027". */
export const previewDocumentNumber = (
  config: NumberFormatConfig,
  financialYearStart: number,
): string =>
  formatDocumentNumber(config, {
    sequence: 1,
    financialYearStart,
    documentDate: `${financialYearStart}-04-01`,
  });

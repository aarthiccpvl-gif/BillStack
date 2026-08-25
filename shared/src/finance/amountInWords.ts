import { roundTo, toDecimal, type DecimalInput } from './decimal';
import type { CurrencyFormat } from './money';

/**
 * Amount in words.
 *
 * Near-universal on Indian invoices, and it has to match the printed total exactly
 * — so it is generated from the same rounded figure the totals block shows, and
 * stored on the document rather than recomputed at render time.
 *
 * INR uses the Indian system (lakh, crore); every other currency uses the
 * international one (thousand, million, billion).
 */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 0–999 in words. */
const upToThreeDigits = (value: number): string => {
  if (value === 0) return '';
  if (value < 20) return ONES[value] ?? '';

  if (value < 100) {
    const tens = TENS[Math.floor(value / 10)] ?? '';
    const ones = ONES[value % 10] ?? '';
    return ones ? `${tens} ${ones}` : tens;
  }

  const hundreds = ONES[Math.floor(value / 100)] ?? '';
  const rest = upToThreeDigits(value % 100);
  return rest ? `${hundreds} Hundred ${rest}` : `${hundreds} Hundred`;
};

/** Indian grouping: crore, lakh, thousand, hundred. */
const indianWords = (value: number): string => {
  if (value === 0) return 'Zero';

  const parts: string[] = [];
  const crore = Math.floor(value / 10_000_000);
  const lakh = Math.floor((value % 10_000_000) / 100_000);
  const thousand = Math.floor((value % 100_000) / 1000);
  const rest = value % 1000;

  if (crore) parts.push(`${upToThreeDigits(crore)} Crore`);
  if (lakh) parts.push(`${upToThreeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${upToThreeDigits(thousand)} Thousand`);
  if (rest) parts.push(upToThreeDigits(rest));

  return parts.join(' ');
};

/** International grouping: billion, million, thousand. */
const westernWords = (value: number): string => {
  if (value === 0) return 'Zero';

  const parts: string[] = [];
  const billion = Math.floor(value / 1_000_000_000);
  const million = Math.floor((value % 1_000_000_000) / 1_000_000);
  const thousand = Math.floor((value % 1_000_000) / 1000);
  const rest = value % 1000;

  if (billion) parts.push(`${upToThreeDigits(billion)} Billion`);
  if (million) parts.push(`${upToThreeDigits(million)} Million`);
  if (thousand) parts.push(`${upToThreeDigits(thousand)} Thousand`);
  if (rest) parts.push(upToThreeDigits(rest));

  return parts.join(' ');
};

/** Major and minor unit names for the currencies the system seeds. */
const UNIT_NAMES: Record<string, { major: string; majorPlural: string; minor: string }> = {
  INR: { major: 'Rupee', majorPlural: 'Rupees', minor: 'Paise' },
  USD: { major: 'Dollar', majorPlural: 'Dollars', minor: 'Cents' },
  EUR: { major: 'Euro', majorPlural: 'Euros', minor: 'Cents' },
  GBP: { major: 'Pound', majorPlural: 'Pounds', minor: 'Pence' },
  AED: { major: 'Dirham', majorPlural: 'Dirhams', minor: 'Fils' },
  SGD: { major: 'Dollar', majorPlural: 'Dollars', minor: 'Cents' },
  AUD: { major: 'Dollar', majorPlural: 'Dollars', minor: 'Cents' },
  CAD: { major: 'Dollar', majorPlural: 'Dollars', minor: 'Cents' },
  JPY: { major: 'Yen', majorPlural: 'Yen', minor: 'Sen' },
  CHF: { major: 'Franc', majorPlural: 'Francs', minor: 'Rappen' },
};

export const amountInWords = (value: DecimalInput, currency: CurrencyFormat): string => {
  const decimalPlaces = Math.max(0, currency.decimalPlaces ?? 2);
  const rounded = roundTo(value, decimalPlaces);
  const isNegative = rounded.isNegative() && !rounded.isZero();
  const absolute = rounded.abs();

  const major = absolute.floor();
  const minor = absolute.minus(major).times(Math.pow(10, decimalPlaces)).round();

  const units = UNIT_NAMES[currency.code] ?? {
    major: currency.code,
    majorPlural: currency.code,
    minor: 'Cents',
  };

  const useIndian = currency.separatorStyle === 'INDIAN';
  const majorNumber = Number(major.toString());
  const words = useIndian ? indianWords(majorNumber) : westernWords(majorNumber);

  const majorUnit = major.equals(1) ? units.major : units.majorPlural;
  const segments = [words, majorUnit];

  if (decimalPlaces > 0 && !minor.isZero()) {
    const minorNumber = Number(minor.toString());
    const minorWords = useIndian ? indianWords(minorNumber) : westernWords(minorNumber);
    segments.push('and', minorWords, units.minor);
  }

  const sentence = `${isNegative ? 'Minus ' : ''}${segments.join(' ')} Only`;
  return sentence.replace(/\s+/g, ' ').trim();
};

/** True when a value is large enough that the words would be unreadable. */
export const isAmountInWordsSupported = (value: DecimalInput): boolean =>
  toDecimal(value).abs().lessThan('1e15');

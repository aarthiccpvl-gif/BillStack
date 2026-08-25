import { roundTo, toDecimal, type DecimalInput } from './decimal';

export type SymbolPosition = 'PREFIX' | 'SUFFIX';
export type SeparatorStyle = 'WESTERN' | 'INDIAN';

/**
 * Currency presentation data. Every document stores its own copy of this, so a
 * historical invoice never re-formats itself because a master record changed.
 */
export interface CurrencyFormat {
  code: string;
  symbol: string;
  decimalPlaces: number;
  symbolPosition?: SymbolPosition;
  separatorStyle?: SeparatorStyle;
}

export interface FormatMoneyOptions {
  /** Show "INR 1,25,000.00" instead of "₹1,25,000.00" — used in exports and reports. */
  useCode?: boolean;
  /** Omit the symbol entirely — used inside table columns that already have a header. */
  omitSymbol?: boolean;
  /** Render negatives as (1,250.00), the convention finance users read fastest. */
  accounting?: boolean;
}

/** 1234567 → "12,34,567" (last three digits, then groups of two). */
const groupIndian = (digits: string): string => {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
};

/** 1234567 → "1,234,567". */
const groupWestern = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Formats an amount for display. Used by the UI, the PDF templates and the
 * exports alike — which is why a number can never look different in two places.
 */
export const formatMoney = (
  value: DecimalInput,
  currency: CurrencyFormat,
  options: FormatMoneyOptions = {},
): string => {
  const decimalPlaces = Math.max(0, currency.decimalPlaces ?? 2);
  const rounded = roundTo(value, decimalPlaces);
  const isNegative = rounded.isNegative() && !rounded.isZero();
  const fixed = rounded.abs().toFixed(decimalPlaces);

  const [integerPart = '0', fractionPart] = fixed.split('.');
  const grouped =
    currency.separatorStyle === 'INDIAN' ? groupIndian(integerPart) : groupWestern(integerPart);

  let body = fractionPart ? `${grouped}.${fractionPart}` : grouped;

  if (!options.omitSymbol) {
    if (options.useCode) {
      body = `${currency.code} ${body}`;
    } else if ((currency.symbolPosition ?? 'PREFIX') === 'PREFIX') {
      body = `${currency.symbol}${body}`;
    } else {
      body = `${body} ${currency.symbol}`;
    }
  }

  if (!isNegative) return body;
  return options.accounting ? `(${body})` : `-${body}`;
};

/** Formats a quantity: trims pointless trailing zeros so "2" doesn't read "2.000". */
export const formatQuantity = (value: DecimalInput, maxDecimalPlaces = 3): string => {
  const rounded = roundTo(value, maxDecimalPlaces);
  return rounded.equals(rounded.toDecimalPlaces(0)) ? rounded.toFixed(0) : rounded.toString();
};

export const formatPercent = (value: DecimalInput, decimalPlaces = 2): string => {
  const rounded = roundTo(value, decimalPlaces);
  const trimmed = rounded.equals(rounded.toDecimalPlaces(0))
    ? rounded.toFixed(0)
    : rounded.toString();
  return `${trimmed}%`;
};

/** Parses user input ("1,25,000.50", "₹1,200") into a Decimal. Returns null if unusable. */
export const parseAmountInput = (input: string): ReturnType<typeof toDecimal> | null => {
  const cleaned = input.replace(/[^\d.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  try {
    const parsed = toDecimal(cleaned);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
};

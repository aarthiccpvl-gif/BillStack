import Decimal from 'decimal.js';

/**
 * The one place decimal behaviour is configured.
 *
 * HALF_UP is deliberate: it matches Indian commercial convention and it is what a
 * finance user expects to see. Banker's rounding would surprise them.
 *
 * 30 significant digits gives generous headroom for the six-decimal intermediates
 * the calculation engine works in before rounding to a currency's own precision.
 */
Decimal.set({
  precision: 30,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -18,
  toExpPos: 30,
});

export { Decimal };

/** Anything that can safely become a Decimal. Note: `number` is accepted only for
 *  literals written in code — values from the database and the API arrive as strings. */
export type DecimalInput = Decimal | string | number;

export const INTERNAL_SCALE = 6;

export const toDecimal = (value: DecimalInput): Decimal =>
  value instanceof Decimal ? value : new Decimal(value ?? 0);

export const isValidDecimal = (value: unknown): boolean => {
  if (value instanceof Decimal) return value.isFinite();
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    return new Decimal(value).isFinite();
  } catch {
    return false;
  }
};

/** Rounds to a currency's precision. Every persisted amount passes through here. */
export const roundTo = (value: DecimalInput, decimalPlaces: number): Decimal =>
  toDecimal(value).toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);

/** Keeps intermediates at a fixed scale so long chains of operations cannot drift. */
export const roundInternal = (value: DecimalInput): Decimal => roundTo(value, INTERNAL_SCALE);

export const sum = (values: readonly DecimalInput[]): Decimal =>
  values.reduce<Decimal>((total, value) => total.plus(toDecimal(value)), new Decimal(0));

/** Serialises for transport: money crosses the wire as a string, never a float. */
export const toAmountString = (value: DecimalInput, decimalPlaces: number): string =>
  roundTo(value, decimalPlaces).toFixed(decimalPlaces);

export const ZERO = new Decimal(0);

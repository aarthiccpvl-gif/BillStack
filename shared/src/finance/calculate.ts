import { Decimal, roundTo, toAmountString, toDecimal, type DecimalInput } from './decimal';

/**
 * The calculation engine.
 *
 * This is the single authority on what a document costs. The backend runs it
 * inside the save transaction and persists its result; the editor runs the very
 * same code on every keystroke so the figure on screen cannot disagree with the
 * one that gets stored.
 *
 * Order of operations (docs/03-financial-tax-engine.md):
 *
 *   1. lineGross      = qty × rate
 *   2. lineNet        = lineGross − line discount
 *   3. document discount allocated across lines by largest remainder
 *   4. taxable        = lineNet − allocated share
 *   5. tax            per component, per line, then summed
 *   6. grand total    = taxable + tax + adjustment + round-off
 *
 * Tax is computed per line and then summed — never on the document subtotal —
 * because that is the GST-correct order and it is what makes a per-component tax
 * summary tie exactly to the total.
 */

export type DiscountMode = 'NONE' | 'PERCENT' | 'AMOUNT';

export interface CalcTaxComponent {
  /** Master row this came from; carried through so the line can be stored. */
  taxRateId: number;
  taxTypeKey: string;
  label: string;
  ratePercent: string;
}

export interface CalcLineInput {
  quantity: DecimalInput;
  rate: DecimalInput;
  discountMode?: DiscountMode;
  discountValue?: DecimalInput;
  taxes?: CalcTaxComponent[];
  /** Zero-rated, exempt or non-GST: taxes are ignored entirely. */
  isTaxExempt?: boolean;
}

export interface CalcInput {
  /** Rounding precision of the document currency: 2 for INR/USD, 0 for JPY. */
  decimalPlaces: number;
  lines: CalcLineInput[];
  discountMode?: DiscountMode;
  discountValue?: DecimalInput;
  adjustment?: DecimalInput;
  /** Round the grand total to the nearest whole unit and show the difference. */
  roundOffEnabled?: boolean;
  /** For consolidated reporting only; never affects the printed figures. */
  exchangeRateToBase?: DecimalInput;
  baseDecimalPlaces?: number;
}

export interface CalcLineTax extends CalcTaxComponent {
  taxableAmount: string;
  taxAmount: string;
}

export interface CalcLineResult {
  lineGross: string;
  discountAmount: string;
  lineNet: string;
  allocatedDocDiscount: string;
  taxableAmount: string;
  taxAmount: string;
  lineTotal: string;
  taxes: CalcLineTax[];
}

export interface CalcTaxSummaryRow {
  label: string;
  taxTypeKey: string;
  ratePercent: string;
  taxableAmount: string;
  taxAmount: string;
}

export interface CalcResult {
  lines: CalcLineResult[];
  subtotal: string;
  /** Line discounts plus the document discount. */
  discountTotal: string;
  taxableTotal: string;
  taxTotal: string;
  adjustment: string;
  roundOff: string;
  grandTotal: string;
  baseTotal: string;
  taxSummary: CalcTaxSummaryRow[];
}

/** One minor unit at the currency's precision: 0.01 for INR, 1 for JPY. */
const minorUnit = (decimalPlaces: number): Decimal => new Decimal(10).pow(-decimalPlaces);

/**
 * Splits a document-level discount across lines in proportion to their net value.
 *
 * Uses the largest-remainder method so the parts add up to the whole *exactly*.
 * Without it the discount shown in the totals block would not equal the sum of
 * what was deducted from the lines — the classic "₹0.01 doesn't tie" bug.
 */
const allocateProportionally = (
  total: Decimal,
  weights: Decimal[],
  decimalPlaces: number,
): Decimal[] => {
  const weightSum = weights.reduce((sum, weight) => sum.plus(weight), new Decimal(0));

  if (total.isZero() || weightSum.isZero()) {
    return weights.map(() => new Decimal(0));
  }

  const unit = minorUnit(decimalPlaces);

  const raw = weights.map((weight) => total.times(weight).dividedBy(weightSum));
  const floored = raw.map((value) => value.toDecimalPlaces(decimalPlaces, Decimal.ROUND_DOWN));
  const allocatedSoFar = floored.reduce((sum, value) => sum.plus(value), new Decimal(0));

  /* Whatever the flooring lost, hand out one minor unit at a time to the lines
     with the largest fractional remainder. */
  let remaining = total.minus(allocatedSoFar).dividedBy(unit).round().toNumber();

  const order = raw
    .map((value, index) => ({ index, remainder: value.minus(floored[index] ?? 0) }))
    .sort((a, b) => b.remainder.comparedTo(a.remainder));

  const result = [...floored];
  let cursor = 0;
  while (remaining > 0 && order.length > 0) {
    const target = order[cursor % order.length];
    if (target) {
      result[target.index] = (result[target.index] ?? new Decimal(0)).plus(unit);
      remaining -= 1;
    }
    cursor += 1;
  }

  return result;
};

export const calculateDocument = (input: CalcInput): CalcResult => {
  const dp = Math.max(0, input.decimalPlaces);
  const round = (value: DecimalInput): Decimal => roundTo(value, dp);
  const asString = (value: DecimalInput): string => toAmountString(value, dp);

  // --- 1 & 2: line gross and line-level discount -------------------------
  const gross: Decimal[] = [];
  const lineDiscounts: Decimal[] = [];
  const nets: Decimal[] = [];

  for (const line of input.lines) {
    const lineGross = round(toDecimal(line.quantity).times(toDecimal(line.rate)));

    let discount = new Decimal(0);
    if (line.discountMode === 'PERCENT') {
      discount = round(lineGross.times(toDecimal(line.discountValue ?? 0)).dividedBy(100));
    } else if (line.discountMode === 'AMOUNT') {
      discount = round(toDecimal(line.discountValue ?? 0));
    }

    /* A discount can reduce a line to zero but never below it. */
    if (discount.greaterThan(lineGross)) discount = lineGross;
    if (discount.isNegative()) discount = new Decimal(0);

    gross.push(lineGross);
    lineDiscounts.push(discount);
    nets.push(lineGross.minus(discount));
  }

  const subtotal = gross.reduce((sum, value) => sum.plus(value), new Decimal(0));
  const netTotal = nets.reduce((sum, value) => sum.plus(value), new Decimal(0));

  // --- 3: document discount, applied before tax (decision Q5) ------------
  let documentDiscount = new Decimal(0);
  if (input.discountMode === 'PERCENT') {
    documentDiscount = round(netTotal.times(toDecimal(input.discountValue ?? 0)).dividedBy(100));
  } else if (input.discountMode === 'AMOUNT') {
    documentDiscount = round(toDecimal(input.discountValue ?? 0));
  }

  if (documentDiscount.greaterThan(netTotal)) documentDiscount = netTotal;
  if (documentDiscount.isNegative()) documentDiscount = new Decimal(0);

  const allocations = allocateProportionally(documentDiscount, nets, dp);

  // --- 4 & 5: taxable value and tax, per line, per component -------------
  const summary = new Map<string, CalcTaxSummaryRow>();
  const lines: CalcLineResult[] = [];

  let taxableTotal = new Decimal(0);
  let taxTotal = new Decimal(0);

  input.lines.forEach((line, index) => {
    const lineGross = gross[index] ?? new Decimal(0);
    const discount = lineDiscounts[index] ?? new Decimal(0);
    const net = nets[index] ?? new Decimal(0);
    const allocated = allocations[index] ?? new Decimal(0);
    const taxable = net.minus(allocated);

    const components: CalcLineTax[] = [];
    let lineTax = new Decimal(0);

    if (!line.isTaxExempt) {
      for (const tax of line.taxes ?? []) {
        const amount = round(taxable.times(toDecimal(tax.ratePercent)).dividedBy(100));
        lineTax = lineTax.plus(amount);

        components.push({
          ...tax,
          taxableAmount: asString(taxable),
          taxAmount: asString(amount),
        });

        /* Grouped by component and rate so CGST 9% and SGST 9% stay separate. */
        const key = `${tax.taxTypeKey}|${toDecimal(tax.ratePercent).toString()}`;
        const existing = summary.get(key);
        if (existing) {
          existing.taxableAmount = asString(toDecimal(existing.taxableAmount).plus(taxable));
          existing.taxAmount = asString(toDecimal(existing.taxAmount).plus(amount));
        } else {
          summary.set(key, {
            label: tax.label,
            taxTypeKey: tax.taxTypeKey,
            ratePercent: toDecimal(tax.ratePercent).toString(),
            taxableAmount: asString(taxable),
            taxAmount: asString(amount),
          });
        }
      }
    }

    taxableTotal = taxableTotal.plus(taxable);
    taxTotal = taxTotal.plus(lineTax);

    lines.push({
      lineGross: asString(lineGross),
      discountAmount: asString(discount),
      lineNet: asString(net),
      allocatedDocDiscount: asString(allocated),
      taxableAmount: asString(taxable),
      taxAmount: asString(lineTax),
      lineTotal: asString(taxable.plus(lineTax)),
      taxes: components,
    });
  });

  // --- 6: document totals -------------------------------------------------
  const adjustment = round(toDecimal(input.adjustment ?? 0));
  const preRound = taxableTotal.plus(taxTotal).plus(adjustment);

  /* Round-off is a separate figure from `adjustment`: one is an automatic
     to-the-rupee correction, the other a deliberate human entry. Merging them
     makes an invoice impossible to explain to a customer. */
  const roundOff = input.roundOffEnabled
    ? preRound.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).minus(preRound)
    : new Decimal(0);

  const grandTotal = preRound.plus(roundOff);

  const baseDp = input.baseDecimalPlaces ?? dp;
  const baseTotal = roundTo(grandTotal.times(toDecimal(input.exchangeRateToBase ?? 1)), baseDp);

  const lineDiscountTotal = lineDiscounts.reduce((sum, value) => sum.plus(value), new Decimal(0));

  return {
    lines,
    subtotal: asString(subtotal),
    discountTotal: asString(lineDiscountTotal.plus(documentDiscount)),
    taxableTotal: asString(taxableTotal),
    taxTotal: asString(taxTotal),
    adjustment: asString(adjustment),
    roundOff: asString(roundOff),
    grandTotal: asString(grandTotal),
    baseTotal: toAmountString(baseTotal, baseDp),
    /* Highest rate first, then alphabetically — the order a reader expects. */
    taxSummary: [...summary.values()].sort(
      (a, b) =>
        toDecimal(b.ratePercent).comparedTo(toDecimal(a.ratePercent)) ||
        a.label.localeCompare(b.label),
    ),
  };
};

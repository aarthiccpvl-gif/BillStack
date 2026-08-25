import { describe, expect, it } from 'vitest';
import { calculateDocument, type CalcInput, type CalcTaxComponent } from './calculate';
import { toDecimal } from './decimal';

/**
 * The fixtures from docs/03-financial-tax-engine.md §3.
 *
 * These are the numbers the whole system is judged on, so they are asserted to
 * the last minor unit rather than approximately.
 */

const CGST9: CalcTaxComponent = {
  taxRateId: 1,
  taxTypeKey: 'CGST',
  label: 'CGST 9%',
  ratePercent: '9',
};
const SGST9: CalcTaxComponent = {
  taxRateId: 2,
  taxTypeKey: 'SGST',
  label: 'SGST 9%',
  ratePercent: '9',
};
const IGST18: CalcTaxComponent = {
  taxRateId: 3,
  taxTypeKey: 'IGST',
  label: 'IGST 18%',
  ratePercent: '18',
};

const inr = (input: Partial<CalcInput> & Pick<CalcInput, 'lines'>): CalcInput => ({
  decimalPlaces: 2,
  ...input,
});

describe('fixture A — the PRD §16 worked example', () => {
  const result = calculateDocument(
    inr({
      lines: [{ quantity: '1', rate: '100000', taxes: [CGST9, SGST9] }],
      discountMode: 'AMOUNT',
      discountValue: '5000',
    }),
  );

  it('reproduces the PRD figures exactly', () => {
    expect(result.subtotal).toBe('100000.00');
    expect(result.discountTotal).toBe('5000.00');
    expect(result.taxableTotal).toBe('95000.00');
    expect(result.taxTotal).toBe('17100.00');
    expect(result.grandTotal).toBe('112100.00');
  });

  it('splits the tax into its two components', () => {
    expect(result.taxSummary).toHaveLength(2);
    expect(result.taxSummary.map((row) => row.taxAmount)).toEqual(['8550.00', '8550.00']);
  });

  it('confirms the discount reduced the taxable value, not the total afterwards', () => {
    /* Tax on 95,000 is 17,100; tax on 100,000 would have been 18,000. */
    expect(result.taxTotal).toBe('17100.00');
  });
});

describe('fixture B — inter-state IGST', () => {
  it('charges a single 18% component', () => {
    const result = calculateDocument(
      inr({ lines: [{ quantity: '1', rate: '100000', taxes: [IGST18] }] }),
    );

    expect(result.taxTotal).toBe('18000.00');
    expect(result.grandTotal).toBe('118000.00');
    expect(result.taxSummary).toHaveLength(1);
    expect(result.taxSummary[0]?.taxTypeKey).toBe('IGST');
  });
});

describe('fixture C — export, zero rated', () => {
  it('charges no tax at all', () => {
    const result = calculateDocument({
      decimalPlaces: 2,
      lines: [{ quantity: '1', rate: '5000', taxes: [], isTaxExempt: true }],
    });

    expect(result.taxTotal).toBe('0.00');
    expect(result.grandTotal).toBe('5000.00');
    expect(result.taxSummary).toEqual([]);
  });

  it('ignores tax components on an exempt line rather than silently applying them', () => {
    const result = calculateDocument({
      decimalPlaces: 2,
      lines: [{ quantity: '1', rate: '5000', taxes: [CGST9, SGST9], isTaxExempt: true }],
    });

    expect(result.taxTotal).toBe('0.00');
    expect(result.lines[0]?.taxes).toEqual([]);
  });
});

describe('fixture D — JPY, a zero-decimal currency', () => {
  const result = calculateDocument({
    decimalPlaces: 0,
    lines: [{ quantity: '3', rate: '12345', taxes: [{ ...IGST18, ratePercent: '10' }] }],
  });

  it('never produces a fractional amount', () => {
    expect(result.subtotal).toBe('37035');
    expect(result.taxTotal).toBe('3704');
    expect(result.grandTotal).toBe('40739');

    for (const value of [result.subtotal, result.taxTotal, result.grandTotal]) {
      expect(value).not.toContain('.');
    }
  });
});

describe('fixture E — mixed rates with a document discount', () => {
  const result = calculateDocument(
    inr({
      lines: [
        { quantity: '2', rate: '15000', taxes: [{ ...IGST18, ratePercent: '18' }] },
        { quantity: '3', rate: '7000', taxes: [{ ...IGST18, taxRateId: 4, label: 'IGST 12%', ratePercent: '12' }] },
        { quantity: '1', rate: '4000', taxes: [], isTaxExempt: true },
      ],
      discountMode: 'PERCENT',
      discountValue: '7',
    }),
  );

  it('allocates the document discount so the parts equal the whole', () => {
    const allocated = result.lines.reduce(
      (sum, line) => sum.plus(line.allocatedDocDiscount),
      toDecimal(0),
    );
    expect(allocated.toFixed(2)).toBe(result.discountTotal);
  });

  it('produces one summary row per distinct rate', () => {
    expect(result.taxSummary).toHaveLength(2);
    expect(result.taxSummary.map((row) => row.ratePercent)).toEqual(['18', '12']);
  });

  it('ties: taxable + tax equals the grand total', () => {
    const expected = toDecimal(result.taxableTotal).plus(result.taxTotal);
    expect(expected.toFixed(2)).toBe(result.grandTotal);
  });
});

describe('the allocation always ties, whatever the split', () => {
  /* Three equal lines and a discount that cannot divide evenly is the classic
     case where naive rounding loses or gains a paisa. */
  it('handles a discount that does not divide evenly', () => {
    const result = calculateDocument(
      inr({
        lines: [
          { quantity: '1', rate: '100', taxes: [] },
          { quantity: '1', rate: '100', taxes: [] },
          { quantity: '1', rate: '100', taxes: [] },
        ],
        discountMode: 'AMOUNT',
        discountValue: '10',
      }),
    );

    const allocated = result.lines.map((line) => line.allocatedDocDiscount);
    const sum = allocated.reduce((total, value) => total.plus(value), toDecimal(0));

    expect(sum.toFixed(2)).toBe('10.00');
    /* 3.33 + 3.33 + 3.34, in some order — never 9.99. */
    expect(allocated.filter((value) => value === '3.34')).toHaveLength(1);
  });

  it('handles an awkward percentage across many lines', () => {
    const lines = Array.from({ length: 7 }, (_, index) => ({
      quantity: '1',
      rate: String(1000 + index * 137),
      taxes: [CGST9, SGST9],
    }));

    const result = calculateDocument(
      inr({ lines, discountMode: 'PERCENT', discountValue: '3.33' }),
    );

    const allocated = result.lines.reduce(
      (sum, line) => sum.plus(line.allocatedDocDiscount),
      toDecimal(0),
    );
    expect(allocated.toFixed(2)).toBe(result.discountTotal);
  });

  it('keeps the tax summary tied to the tax total', () => {
    const result = calculateDocument(
      inr({
        lines: [
          { quantity: '3', rate: '1234.56', taxes: [CGST9, SGST9] },
          { quantity: '7', rate: '99.99', taxes: [CGST9, SGST9] },
        ],
        discountMode: 'PERCENT',
        discountValue: '11',
      }),
    );

    const summed = result.taxSummary.reduce((sum, row) => sum.plus(row.taxAmount), toDecimal(0));
    expect(summed.toFixed(2)).toBe(result.taxTotal);
  });
});

describe('line discounts', () => {
  it('applies a percentage discount to the line', () => {
    const result = calculateDocument(
      inr({
        lines: [
          { quantity: '2', rate: '1000', discountMode: 'PERCENT', discountValue: '10', taxes: [] },
        ],
      }),
    );

    expect(result.subtotal).toBe('2000.00');
    expect(result.lines[0]?.discountAmount).toBe('200.00');
    expect(result.taxableTotal).toBe('1800.00');
  });

  it('applies a flat discount to the line', () => {
    const result = calculateDocument(
      inr({
        lines: [
          { quantity: '1', rate: '1000', discountMode: 'AMOUNT', discountValue: '250', taxes: [] },
        ],
      }),
    );

    expect(result.taxableTotal).toBe('750.00');
  });

  it('never lets a discount push a line below zero', () => {
    const result = calculateDocument(
      inr({
        lines: [
          { quantity: '1', rate: '100', discountMode: 'AMOUNT', discountValue: '500', taxes: [] },
        ],
      }),
    );

    expect(result.lines[0]?.discountAmount).toBe('100.00');
    expect(result.taxableTotal).toBe('0.00');
    expect(result.grandTotal).toBe('0.00');
  });

  it('never lets a document discount exceed the net total', () => {
    const result = calculateDocument(
      inr({
        lines: [{ quantity: '1', rate: '100', taxes: [] }],
        discountMode: 'AMOUNT',
        discountValue: '9999',
      }),
    );

    expect(result.discountTotal).toBe('100.00');
    expect(result.grandTotal).toBe('0.00');
  });

  it('combines a line discount and a document discount', () => {
    const result = calculateDocument(
      inr({
        lines: [
          { quantity: '1', rate: '1000', discountMode: 'PERCENT', discountValue: '10', taxes: [] },
        ],
        discountMode: 'AMOUNT',
        discountValue: '100',
      }),
    );

    expect(result.discountTotal).toBe('200.00');
    expect(result.taxableTotal).toBe('800.00');
  });
});

describe('adjustment and round-off', () => {
  it('adds a manual adjustment before rounding', () => {
    const result = calculateDocument(
      inr({ lines: [{ quantity: '1', rate: '1000', taxes: [] }], adjustment: '50' }),
    );

    expect(result.adjustment).toBe('50.00');
    expect(result.grandTotal).toBe('1050.00');
  });

  it('accepts a negative adjustment', () => {
    const result = calculateDocument(
      inr({ lines: [{ quantity: '1', rate: '1000', taxes: [] }], adjustment: '-50' }),
    );

    expect(result.grandTotal).toBe('950.00');
  });

  it('rounds to the nearest whole unit and reports the difference separately', () => {
    const result = calculateDocument(
      inr({ lines: [{ quantity: '1', rate: '1000.40', taxes: [] }], roundOffEnabled: true }),
    );

    expect(result.roundOff).toBe('-0.40');
    expect(result.grandTotal).toBe('1000.00');
  });

  it('rounds up when it should', () => {
    const result = calculateDocument(
      inr({ lines: [{ quantity: '1', rate: '1000.60', taxes: [] }], roundOffEnabled: true }),
    );

    expect(result.roundOff).toBe('0.40');
    expect(result.grandTotal).toBe('1001.00');
  });

  it('leaves the total alone when round-off is disabled', () => {
    const result = calculateDocument(
      inr({ lines: [{ quantity: '1', rate: '1000.40', taxes: [] }] }),
    );

    expect(result.roundOff).toBe('0.00');
    expect(result.grandTotal).toBe('1000.40');
  });

  it('keeps adjustment and round-off as separate figures', () => {
    const result = calculateDocument(
      inr({
        lines: [{ quantity: '1', rate: '1000.40', taxes: [] }],
        adjustment: '10',
        roundOffEnabled: true,
      }),
    );

    expect(result.adjustment).toBe('10.00');
    expect(result.roundOff).toBe('-0.40');
    expect(result.grandTotal).toBe('1010.00');
  });
});

describe('base currency conversion (decision Q3)', () => {
  it('converts the grand total at the document rate', () => {
    const result = calculateDocument({
      decimalPlaces: 2,
      lines: [{ quantity: '1', rate: '1000', taxes: [] }],
      exchangeRateToBase: '83.42',
      baseDecimalPlaces: 2,
    });

    expect(result.grandTotal).toBe('1000.00');
    expect(result.baseTotal).toBe('83420.00');
  });

  it('defaults to a rate of 1 for a document already in the base currency', () => {
    const result = calculateDocument(inr({ lines: [{ quantity: '1', rate: '1000', taxes: [] }] }));
    expect(result.baseTotal).toBe('1000.00');
  });
});

describe('degenerate input', () => {
  it('handles a document with no lines', () => {
    const result = calculateDocument(inr({ lines: [] }));

    expect(result.subtotal).toBe('0.00');
    expect(result.grandTotal).toBe('0.00');
    expect(result.taxSummary).toEqual([]);
  });

  it('handles a zero-value line without dividing by zero', () => {
    const result = calculateDocument(
      inr({
        lines: [{ quantity: '1', rate: '0', taxes: [CGST9] }],
        discountMode: 'PERCENT',
        discountValue: '10',
      }),
    );

    expect(result.grandTotal).toBe('0.00');
  });

  it('handles fractional quantities exactly', () => {
    const result = calculateDocument(
      inr({ lines: [{ quantity: '2.5', rate: '1000', taxes: [] }] }),
    );

    expect(result.subtotal).toBe('2500.00');
  });

  it('does not accumulate float error over many lines', () => {
    const lines = Array.from({ length: 300 }, () => ({
      quantity: '1',
      rate: '0.10',
      taxes: [],
    }));

    expect(calculateDocument(inr({ lines })).subtotal).toBe('30.00');
  });
});

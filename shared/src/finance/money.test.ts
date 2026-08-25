import { describe, expect, it } from 'vitest';
import { Decimal, roundTo, sum, toAmountString } from './decimal';
import { formatMoney, formatPercent, formatQuantity, parseAmountInput } from './money';
import type { CurrencyFormat } from './money';

const INR: CurrencyFormat = {
  code: 'INR',
  symbol: '₹',
  decimalPlaces: 2,
  symbolPosition: 'PREFIX',
  separatorStyle: 'INDIAN',
};

const USD: CurrencyFormat = {
  code: 'USD',
  symbol: '$',
  decimalPlaces: 2,
  symbolPosition: 'PREFIX',
  separatorStyle: 'WESTERN',
};

const JPY: CurrencyFormat = {
  code: 'JPY',
  symbol: '¥',
  decimalPlaces: 0,
  symbolPosition: 'PREFIX',
  separatorStyle: 'WESTERN',
};

describe('decimal arithmetic', () => {
  it('does not suffer the classic float error', () => {
    // The exact case the PRD calls out: 0.1 + 0.2 must not be 0.30000000000000004.
    expect(new Decimal('0.1').plus('0.2').toString()).toBe('0.3');
  });

  it('rounds half up, as Indian commercial convention expects', () => {
    expect(roundTo('2.005', 2).toFixed(2)).toBe('2.01');
    expect(roundTo('2.015', 2).toFixed(2)).toBe('2.02');
    expect(roundTo('-2.005', 2).toFixed(2)).toBe('-2.01');
  });

  it('sums a list without drift', () => {
    const lines = ['1234.567', '0.001', '9999.432'];
    expect(sum(lines).toFixed(3)).toBe('11234.000');
  });

  it('serialises amounts as fixed-precision strings for transport', () => {
    expect(toAmountString('1500', 2)).toBe('1500.00');
    expect(toAmountString('1500.4567', 2)).toBe('1500.46');
    expect(toAmountString('12345', 0)).toBe('12345');
  });
});

describe('formatMoney', () => {
  it('groups INR the Indian way', () => {
    expect(formatMoney('125000', INR)).toBe('₹1,25,000.00');
    expect(formatMoney('10000000', INR)).toBe('₹1,00,00,000.00');
    expect(formatMoney('999', INR)).toBe('₹999.00');
  });

  it('groups USD the western way', () => {
    expect(formatMoney('1500', USD)).toBe('$1,500.00');
    expect(formatMoney('1234567.891', USD)).toBe('$1,234,567.89');
  });

  it('respects a zero-decimal currency', () => {
    expect(formatMoney('12345', JPY)).toBe('¥12,345');
    expect(formatMoney('12345.6', JPY)).toBe('¥12,346');
  });

  it('renders negatives plainly or in accounting style', () => {
    expect(formatMoney('-2500', USD)).toBe('-$2,500.00');
    expect(formatMoney('-2500', USD, { accounting: true })).toBe('($2,500.00)');
    expect(formatMoney('0', USD, { accounting: true })).toBe('$0.00');
  });

  it('can use the code or drop the symbol, for exports and table columns', () => {
    expect(formatMoney('125000', INR, { useCode: true })).toBe('INR 1,25,000.00');
    expect(formatMoney('125000', INR, { omitSymbol: true })).toBe('1,25,000.00');
  });

  it('places a suffix symbol when the currency asks for one', () => {
    expect(formatMoney('1500', { ...USD, symbolPosition: 'SUFFIX', symbol: 'kr' })).toBe(
      '1,500.00 kr',
    );
  });
});

describe('formatQuantity and formatPercent', () => {
  it('does not pad whole quantities with pointless zeros', () => {
    expect(formatQuantity('2')).toBe('2');
    expect(formatQuantity('2.5')).toBe('2.5');
    expect(formatQuantity('2.5004')).toBe('2.5');
  });

  it('formats tax percentages readably', () => {
    expect(formatPercent('9')).toBe('9%');
    expect(formatPercent('2.5')).toBe('2.5%');
    expect(formatPercent('18.0000')).toBe('18%');
  });
});

describe('parseAmountInput', () => {
  it('accepts what a user actually types', () => {
    expect(parseAmountInput('1,25,000.50')?.toFixed(2)).toBe('125000.50');
    expect(parseAmountInput('₹1,200')?.toFixed(2)).toBe('1200.00');
    expect(parseAmountInput('-45.5')?.toFixed(2)).toBe('-45.50');
  });

  it('rejects input that is not a number', () => {
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('abc')).toBeNull();
    expect(parseAmountInput('.')).toBeNull();
  });
});

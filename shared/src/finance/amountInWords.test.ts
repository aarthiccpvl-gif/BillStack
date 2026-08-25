import { describe, expect, it } from 'vitest';
import { amountInWords } from './amountInWords';
import type { CurrencyFormat } from './money';

const INR: CurrencyFormat = {
  code: 'INR',
  symbol: '₹',
  decimalPlaces: 2,
  separatorStyle: 'INDIAN',
};

const USD: CurrencyFormat = {
  code: 'USD',
  symbol: '$',
  decimalPlaces: 2,
  separatorStyle: 'WESTERN',
};

const JPY: CurrencyFormat = {
  code: 'JPY',
  symbol: '¥',
  decimalPlaces: 0,
  separatorStyle: 'WESTERN',
};

describe('amount in words — INR uses the Indian system', () => {
  it('matches the PRD worked example', () => {
    expect(amountInWords('112100', INR)).toBe('One Lakh Twelve Thousand One Hundred Rupees Only');
  });

  it('handles lakh and crore', () => {
    expect(amountInWords('100000', INR)).toBe('One Lakh Rupees Only');
    expect(amountInWords('1250000', INR)).toBe('Twelve Lakh Fifty Thousand Rupees Only');
    expect(amountInWords('10000000', INR)).toBe('One Crore Rupees Only');
    expect(amountInWords('12345678', INR)).toBe(
      'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees Only',
    );
  });

  it('speaks the paise when there are any', () => {
    expect(amountInWords('1500.50', INR)).toBe(
      'One Thousand Five Hundred Rupees and Fifty Paise Only',
    );
    expect(amountInWords('1500.05', INR)).toBe(
      'One Thousand Five Hundred Rupees and Five Paise Only',
    );
  });

  it('says nothing about paise when the amount is whole', () => {
    expect(amountInWords('2500.00', INR)).toBe('Two Thousand Five Hundred Rupees Only');
  });

  it('uses the singular for exactly one', () => {
    expect(amountInWords('1', INR)).toBe('One Rupee Only');
  });

  it('handles zero', () => {
    expect(amountInWords('0', INR)).toBe('Zero Rupees Only');
  });
});

describe('amount in words — other currencies use the international system', () => {
  it('uses thousand and million rather than lakh and crore', () => {
    expect(amountInWords('1500', USD)).toBe('One Thousand Five Hundred Dollars Only');
    expect(amountInWords('1250000', USD)).toBe(
      'One Million Two Hundred Fifty Thousand Dollars Only',
    );
  });

  it('speaks cents', () => {
    expect(amountInWords('99.99', USD)).toBe('Ninety Nine Dollars and Ninety Nine Cents Only');
  });

  it('omits a minor unit for a zero-decimal currency', () => {
    expect(amountInWords('12345', JPY)).toBe('Twelve Thousand Three Hundred Forty Five Yen Only');
  });
});

describe('rounding and sign', () => {
  it('speaks the rounded figure, so it always matches the printed total', () => {
    expect(amountInWords('1500.567', USD)).toBe(
      'One Thousand Five Hundred Dollars and Fifty Seven Cents Only',
    );
  });

  it('marks a negative amount rather than dropping the sign', () => {
    expect(amountInWords('-250', USD)).toBe('Minus Two Hundred Fifty Dollars Only');
  });
});

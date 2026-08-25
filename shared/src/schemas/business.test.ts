import { describe, expect, it } from 'vitest';
import { createCustomerSchema } from './customer';
import { createItemSchema, decimalString, hsnSacSchema } from './item';
import { gstinSchema, panSchema, updateCompanySchema } from './company';
import { numberingSeriesSchema } from './masters';

const validCustomer = {
  name: 'ABC Technologies',
  taxTreatment: 'REGISTERED' as const,
  gstin: '29AABCU9603R1ZM',
};

describe('GSTIN and PAN', () => {
  it('accepts a well-formed GSTIN and normalises its case', () => {
    expect(gstinSchema.parse('29aabcu9603r1zm')).toBe('29AABCU9603R1ZM');
  });

  it('rejects a GSTIN of the wrong shape', () => {
    for (const bad of ['29AABCU9603R1Z', 'AABCU9603R1ZM29', '291234567890123', '']) {
      expect(gstinSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('accepts a well-formed PAN and rejects a malformed one', () => {
    expect(panSchema.parse('aabcu9603r')).toBe('AABCU9603R');
    expect(panSchema.safeParse('AABCU96031').success).toBe(false);
  });
});

describe('customer rules', () => {
  it('requires a GSTIN for a registered business', () => {
    const result = createCustomerSchema.safeParse({
      name: 'No GST Co',
      taxTreatment: 'REGISTERED',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/registered business needs a GSTIN/i);
    }
  });

  it('does not require a GSTIN for an overseas customer', () => {
    const result = createCustomerSchema.safeParse({
      name: 'Overseas Buyer LLC',
      taxTreatment: 'OVERSEAS',
      defaultCurrencyCode: 'usd',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.defaultCurrencyCode).toBe('USD');
  });

  it('defaults payment terms to 30 days and currency to INR', () => {
    const parsed = createCustomerSchema.parse(validCustomer);
    expect(parsed.paymentTermsDays).toBe(30);
    expect(parsed.defaultCurrencyCode).toBe('INR');
  });

  it('turns an empty optional string into null rather than storing ""', () => {
    const parsed = createCustomerSchema.parse({ ...validCustomer, companyName: '', phone: '' });
    expect(parsed.companyName).toBeNull();
    expect(parsed.phone).toBeNull();
  });

  it('rejects an invalid email', () => {
    expect(
      createCustomerSchema.safeParse({ ...validCustomer, email: 'not-an-email' }).success,
    ).toBe(false);
  });
});

describe('HSN/SAC codes', () => {
  it('accepts 4, 6 and 8 digits', () => {
    for (const code of ['9983', '998314', '99831400']) {
      expect(hsnSacSchema.parse(code)).toBe(code);
    }
  });

  it('rejects other lengths and non-digits', () => {
    for (const code of ['99', '12345', 'ABCDEF', '9983144']) {
      expect(hsnSacSchema.safeParse(code).success).toBe(false);
    }
  });

  it('treats blank as not supplied', () => {
    expect(hsnSacSchema.parse('')).toBeNull();
  });
});

describe('decimal strings', () => {
  const rate = decimalString(4, 'Rate');

  it('accepts a plain and a fractional amount', () => {
    expect(rate.parse('50000')).toBe('50000');
    expect(rate.parse('1234.5678')).toBe('1234.5678');
    expect(rate.parse(2500)).toBe('2500');
  });

  it('rejects more decimal places than the column stores', () => {
    const result = rate.safeParse('1.234567');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/4 decimal places/);
  });

  it('rejects a negative amount and anything non-numeric', () => {
    expect(rate.safeParse('-5').success).toBe(false);
    expect(rate.safeParse('abc').success).toBe(false);
    expect(rate.safeParse('').success).toBe(false);
  });
});

describe('item rules', () => {
  it('defaults a new item to a service priced at zero in INR', () => {
    const parsed = createItemSchema.parse({ name: 'Consulting' });
    expect(parsed.type).toBe('SERVICE');
    expect(parsed.defaultRate).toBe('0');
    expect(parsed.currencyCode).toBe('INR');
  });

  it('keeps a rate exact as a string rather than a float', () => {
    const parsed = createItemSchema.parse({ name: 'Licence', defaultRate: '0.1' });
    expect(parsed.defaultRate).toBe('0.1');
    expect(typeof parsed.defaultRate).toBe('string');
  });
});

describe('numbering pattern validation', () => {
  const base = { prefix: 'FT', padding: 3 };

  it('accepts the confirmed format', () => {
    expect(
      numberingSeriesSchema.safeParse({ ...base, pattern: '{PREFIX}{SEQ}/{FY_LONG}' }).success,
    ).toBe(true);
  });

  it('refuses a pattern with no sequence — every number would be identical', () => {
    const result = numberingSeriesSchema.safeParse({ ...base, pattern: '{PREFIX}/{FY_LONG}' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/must contain \{SEQ\}/);
  });

  it('refuses a token the formatter does not understand', () => {
    const result = numberingSeriesSchema.safeParse({ ...base, pattern: '{PREFIX}{SEQ}/{QUARTER}' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/does not recognise/);
  });

  it('accepts an inline padding override', () => {
    expect(numberingSeriesSchema.safeParse({ ...base, pattern: '{PREFIX}{SEQ:6}' }).success).toBe(
      true,
    );
  });
});

describe('company settings', () => {
  it('rejects a colour that is not hex', () => {
    expect(updateCompanySchema.safeParse({ primaryColor: 'blue' }).success).toBe(false);
    expect(updateCompanySchema.safeParse({ primaryColor: '#0F5477' }).success).toBe(true);
  });

  it('accepts a partial update — the settings screen saves one tab at a time', () => {
    const result = updateCompanySchema.safeParse({ city: 'Bengaluru' });
    expect(result.success).toBe(true);
  });
});

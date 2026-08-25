import {
  amountInWords,
  roundTo,
  toAmountString,
  toDecimal,
  toDateOnlyString,
  type DocumentData,
} from '@app/shared';

/**
 * Sample document used by the template editor's live preview.
 *
 * Clearly fictional, but structurally complete: multiple lines, a document-level
 * discount, two GST components, a round-off and a long description — so the
 * preview exercises the things that actually break a layout rather than flattering
 * it with one tidy line.
 */

const INR = {
  code: 'INR',
  symbol: '₹',
  decimalPlaces: 2,
  symbolPosition: 'PREFIX' as const,
  separatorStyle: 'INDIAN' as const,
};

export interface SampleOptions {
  docType: 'QUOTATION' | 'INVOICE';
  company?: Partial<DocumentData['company']>;
  /** Number of item lines; raise it to check page breaks. */
  lineCount?: number;
}

const SAMPLE_LINES = [
  {
    name: 'Website development',
    description:
      'Design and build of a responsive marketing site, including CMS integration and two rounds of revisions.',
    hsnSac: '998314',
    unit: 'LOT',
    quantity: '1',
    rate: '150000',
  },
  {
    name: 'Annual maintenance contract',
    description: 'Bug fixes, security patching and content updates. 12 months.',
    hsnSac: '998313',
    unit: 'MTH',
    quantity: '12',
    rate: '8500',
  },
  {
    name: 'Cloud hosting',
    description: 'Managed hosting, backups and monitoring.',
    hsnSac: '998315',
    unit: 'MTH',
    quantity: '12',
    rate: '4200',
  },
  {
    name: 'Support licences',
    description: 'Named-user support licences.',
    hsnSac: '998316',
    unit: 'USR',
    quantity: '25',
    rate: '1800',
  },
];

export const buildSampleDocument = ({
  docType,
  company,
  lineCount = 4,
}: SampleOptions): DocumentData => {
  const today = toDateOnlyString(new Date());
  const isInvoice = docType === 'INVOICE';

  /* Computed with the same decimal engine the real documents use — so the preview
     demonstrates the actual arithmetic rather than approximating it with floats. */
  const lines = Array.from({ length: Math.max(1, lineCount) }, (_, index) => {
    const source = SAMPLE_LINES[index % SAMPLE_LINES.length];
    if (!source) throw new Error('sample line missing');

    const taxable = roundTo(toDecimal(source.quantity).times(source.rate), 2);
    const half = roundTo(taxable.times('0.09'), 2);

    return {
      lineNumber: index + 1,
      name: lineCount > SAMPLE_LINES.length ? `${source.name} ${index + 1}` : source.name,
      description: source.description,
      hsnSac: source.hsnSac,
      unit: source.unit,
      quantity: source.quantity,
      rate: source.rate,
      discountLabel: null,
      discountAmount: '0',
      taxes: [
        { label: 'CGST 9%', ratePercent: '9', taxAmount: toAmountString(half, 2) },
        { label: 'SGST 9%', ratePercent: '9', taxAmount: toAmountString(half, 2) },
      ],
      taxableAmount: toAmountString(taxable, 2),
      lineTotal: toAmountString(taxable.plus(half).plus(half), 2),
    };
  });

  const subtotal = lines.reduce((sum, line) => sum.plus(line.taxableAmount), toDecimal(0));
  /* A 5% document-level discount, applied before tax — the GST-correct order. */
  const discount = roundTo(subtotal.times('0.05'), 2);
  const taxableTotal = subtotal.minus(discount);
  const halfTax = roundTo(taxableTotal.times('0.09'), 2);
  const taxTotal = halfTax.plus(halfTax);
  const preRound = taxableTotal.plus(taxTotal);
  const grandTotal = roundTo(preRound, 0);
  const roundOff = grandTotal.minus(preRound);

  return {
    schemaVersion: 1,
    docType,
    number: isInvoice ? 'FT001/2026-2027' : 'QT001/2026-2027',
    status: isInvoice ? 'ISSUED' : 'SENT',
    dates: {
      document: today,
      due: isInvoice ? today : null,
      expiry: isInvoice ? null : today,
    },
    reference: 'PO-4471',
    subject: 'Website rebuild and first-year support',
    company: {
      name: 'Your Company',
      legalName: 'Your Company Private Limited',
      address: {
        line1: '4th Floor, Example Tower',
        line2: '12 Sample Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        stateCode: '29',
        country: 'India',
        postalCode: '560001',
      },
      phone: '+91 80 4000 0000',
      email: 'billing@example.com',
      website: 'www.example.com',
      gstin: '29AABCU9603R1ZM',
      pan: 'AABCU9603R',
      stateCode: '29',
      logo: null,
      signature: null,
      seal: null,
      signatureLabel: 'Authorised Signatory',
      ...company,
    },
    customer: {
      name: 'Sample Customer',
      code: 'CUST-0001',
      companyName: 'Sample Customer Pvt Ltd',
      contactPerson: 'A. Buyer',
      email: 'accounts@sample-customer.example',
      phone: '+91 98000 00000',
      gstin: '29AAACS1234F1Z5',
      pan: 'AAACS1234F',
      taxTreatment: 'REGISTERED',
      placeOfSupply: 'Karnataka (29)',
    },
    billingAddress: {
      line1: 'Plot 22, Industrial Area',
      line2: 'Phase II',
      city: 'Bengaluru',
      state: 'Karnataka',
      stateCode: '29',
      country: 'India',
      postalCode: '560058',
    },
    shippingAddress: {
      line1: 'Warehouse 7, Logistics Park',
      city: 'Hosur',
      state: 'Tamil Nadu',
      stateCode: '33',
      country: 'India',
      postalCode: '635109',
    },
    currency: INR,
    lines,
    totals: {
      subtotal: toAmountString(subtotal, 2),
      discountTotal: toAmountString(discount, 2),
      taxableTotal: toAmountString(taxableTotal, 2),
      taxTotal: toAmountString(taxTotal, 2),
      adjustment: '0',
      roundOff: toAmountString(roundOff, 2),
      grandTotal: toAmountString(grandTotal, 2),
      amountPaid: null,
      balanceDue: null,
      amountInWords: amountInWords(grandTotal, INR),
    },
    taxSummary: {
      byComponent: [
        {
          label: 'CGST 9%',
          ratePercent: '9',
          taxableAmount: toAmountString(taxableTotal, 2),
          taxAmount: toAmountString(halfTax, 2),
        },
        {
          label: 'SGST 9%',
          ratePercent: '9',
          taxableAmount: toAmountString(taxableTotal, 2),
          taxAmount: toAmountString(halfTax, 2),
        },
      ],
      byHsn: [
        {
          label: '998314',
          ratePercent: '18',
          taxableAmount: toAmountString(taxableTotal, 2),
          taxAmount: toAmountString(taxTotal, 2),
        },
      ],
    },
    bank: {
      bankName: 'Example Bank',
      accountName: 'Your Company Private Limited',
      accountNumber: '000123456789',
      ifsc: 'EXMP0000123',
      swift: 'EXMPINBB',
      branch: 'MG Road, Bengaluru',
      paymentInstructions: 'Please quote the document number with your payment.',
    },
    notes: 'Thank you for the opportunity to work with you.',
    terms: isInvoice
      ? 'Payment is due within 30 days of the invoice date. Late payments may attract interest at 1.5% per month.'
      : 'This quotation is valid for 30 days. Prices are exclusive of any third-party licence costs unless stated.',
    customerMessage: 'Looking forward to getting started.',
    customFields: [{ label: 'Project code', value: 'PRJ-2026-014' }],
    meta: {
      templateKey: 'preview',
      templateVersion: 0,
      documentVersion: 0,
      generatedAt: new Date().toISOString(),
    },
  };
};

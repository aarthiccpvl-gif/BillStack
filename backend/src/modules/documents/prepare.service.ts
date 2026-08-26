import { Prisma } from '@prisma/client';
import {
  amountInWords,
  calculateDocument,
  type CalcLineInput,
  type DocumentLineInput,
} from '@app/shared';
import type { TransactionClient } from '../../db/prisma';
import { BusinessRuleError } from '../../utils/errors';
import { resolveTaxGroups } from '../../services/tax.service';

/**
 * Document preparation — shared by quotations and invoices.
 *
 * Everything that decides what a document *costs* and what it *records about the
 * world at this moment* lives here, once. A quotation and an invoice differ in
 * their dates, their status machine and their numbering series; they do not
 * differ in how money is calculated or how a customer is snapshotted, and this
 * function is what stops those two ever drifting apart.
 *
 * The caller supplies the doc type and adds its own dates and number afterwards.
 */

const toDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

/** The fields both document types carry. Each has more; none has fewer. */
export interface DocumentCoreInput {
  customerId: number;
  documentDate: string;
  referenceNumber?: string | null;
  subject?: string | null;
  currencyCode: string;
  exchangeRateToBase: string;
  placeOfSupplyStateCode?: string | null;
  billingAddressId?: number | null;
  shippingAddressId?: number | null;
  templateId?: number | null;
  bankAccountId?: number | null;
  showBankDetails: boolean;
  discountMode: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountValue: string;
  adjustment: string;
  roundOffEnabled: boolean;
  notes?: string | null;
  terms?: string | null;
  customerMessage?: string | null;
  paymentInstructions?: string | null;
  customFields: { label: string; value: string }[];
  items: DocumentLineInput[];
}

/**
 * The columns both `quotations` and `invoices` share, ready to spread into either
 * create input. Deliberately not typed from one model's Prisma type — this shape
 * belongs to neither table, which is the point.
 */
export interface PreparedHeader {
  customerId: number;
  customerSnapshot: Prisma.InputJsonValue;
  billingAddressSnapshot: Prisma.InputJsonValue;
  shippingAddressSnapshot: Prisma.InputJsonValue;
  companySnapshot: Prisma.InputJsonValue;
  placeOfSupplyStateCode: string | null;

  currencyCode: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
  exchangeRateToBase: Prisma.Decimal;
  baseCurrencyCode: string;
  baseTotal: Prisma.Decimal;

  documentDate: Date;
  referenceNumber: string | null;
  subject: string | null;

  discountMode: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountValue: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxableTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  adjustment: Prisma.Decimal;
  roundOff: Prisma.Decimal;
  roundOffEnabled: boolean;
  grandTotal: Prisma.Decimal;
  taxSummaryJson: Prisma.InputJsonValue;

  notes: string | null;
  terms: string | null;
  customerMessage: string | null;
  paymentInstructions: string | null;
  bankAccountId: number | null;
  showBankDetails: boolean;

  templateId: number;
  templateVersionId: number;
  customFieldsJson: Prisma.InputJsonValue;
}

/** One line plus its tax components, minus the foreign key the caller supplies. */
export interface PreparedLine {
  line: {
    lineNumber: number;
    sortOrder: number;
    itemId: number | null;
    itemCode: string | null;
    name: string;
    description: string | null;
    hsnSacCode: string | null;
    unitCode: string | null;
    quantity: Prisma.Decimal;
    rate: Prisma.Decimal;
    discountMode: 'NONE' | 'PERCENT' | 'AMOUNT';
    discountValue: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    lineGross: Prisma.Decimal;
    lineNet: Prisma.Decimal;
    allocatedDocDiscount: Prisma.Decimal;
    taxableAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    taxGroupId: number | null;
    isTaxExempt: boolean;
    exemptReason: string | null;
  };
  taxes: {
    taxRateId: number;
    taxTypeKey: string;
    label: string;
    ratePercent: Prisma.Decimal;
    taxableAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
  }[];
}

export interface PreparedDocument {
  header: PreparedHeader;
  items: PreparedLine[];
  /** The customer's terms, for an invoice that wants to derive a due date. */
  customerPaymentTermsDays: number;
}

const DOC_LABEL = { QUOTATION: 'quotation', INVOICE: 'invoice' } as const;

/**
 * Turns a validated request into the rows to persist.
 *
 * One function for create and update, and for both document types, so none of
 * those paths can diverge in how they compute or what they capture.
 */
export const prepareDocument = async (
  tx: TransactionClient,
  docType: 'QUOTATION' | 'INVOICE',
  input: DocumentCoreInput,
): Promise<PreparedDocument> => {
  const documentDate = toDate(input.documentDate);
  const label = DOC_LABEL[docType];

  const [customer, currency, company] = await Promise.all([
    tx.customer.findUnique({ where: { id: input.customerId }, include: { addresses: true } }),
    tx.currency.findUnique({ where: { code: input.currencyCode } }),
    tx.companySettings.findUnique({ where: { id: 1 } }),
  ]);

  if (!customer) throw new BusinessRuleError('That customer does not exist.');
  if (customer.status === 'ARCHIVED') {
    throw new BusinessRuleError(
      `${customer.name} is archived. Restore the customer before raising a document for them.`,
    );
  }
  if (!currency || !currency.isActive) {
    throw new BusinessRuleError(`${input.currencyCode} is not an active currency.`);
  }
  if (!company) throw new BusinessRuleError('Company settings are missing. Run the seed.');

  /* Resolve the template: the one asked for, else the configured default. */
  const templateId =
    input.templateId ??
    (docType === 'QUOTATION'
      ? company.defaultQuotationTemplateId
      : company.defaultInvoiceTemplateId);

  if (!templateId) {
    throw new BusinessRuleError(
      `No default ${label} template is set. Choose one in Templates before creating a ${label}.`,
    );
  }

  const template = await tx.template.findUnique({
    where: { id: templateId },
    include: {
      versions: { where: { status: 'PUBLISHED' }, orderBy: { version: 'desc' }, take: 1 },
    },
  });

  if (!template || template.docType !== docType) {
    throw new BusinessRuleError(
      `That template cannot be used for ${docType === 'INVOICE' ? 'an invoice' : 'a quotation'}.`,
    );
  }

  const templateVersion = template.versions[0];
  if (!templateVersion) {
    throw new BusinessRuleError(
      `"${template.name}" has no published version. Publish one before using it.`,
    );
  }

  /* Address snapshots: the chosen address, else the customer's default. */
  const pickAddress = (id: number | null | undefined, type: 'BILLING' | 'SHIPPING') => {
    const address =
      (id ? customer.addresses.find((entry) => entry.id === id) : undefined) ??
      customer.addresses.find((entry) => entry.type === type && entry.isDefault) ??
      customer.addresses.find((entry) => entry.type === type);

    return address
      ? {
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          stateCode: address.stateCode,
          country: address.country,
          postalCode: address.postalCode,
        }
      : null;
  };

  const billingAddress = pickAddress(input.billingAddressId, 'BILLING');
  const shippingAddress = pickAddress(input.shippingAddressId, 'SHIPPING');

  // --- taxes ---------------------------------------------------------------
  const groupIds = input.items
    .map((item) => item.taxGroupId)
    .filter((id): id is number => typeof id === 'number');

  const groups = await resolveTaxGroups(groupIds, documentDate, tx);

  const calcLines: CalcLineInput[] = input.items.map((item) => ({
    quantity: item.quantity,
    rate: item.rate,
    discountMode: item.discountMode,
    discountValue: item.discountValue,
    isTaxExempt: item.isTaxExempt,
    taxes: item.taxGroupId ? (groups.get(item.taxGroupId)?.components ?? []) : [],
  }));

  // --- the authoritative calculation ---------------------------------------
  const baseCurrency = await tx.currency.findUnique({ where: { code: company.baseCurrencyCode } });

  const calculated = calculateDocument({
    decimalPlaces: currency.decimalPlaces,
    lines: calcLines,
    discountMode: input.discountMode,
    discountValue: input.discountValue,
    adjustment: input.adjustment,
    roundOffEnabled: input.roundOffEnabled,
    exchangeRateToBase: input.exchangeRateToBase,
    baseDecimalPlaces: baseCurrency?.decimalPlaces ?? 2,
  });

  const currencyFormat = {
    code: currency.code,
    symbol: currency.symbol,
    decimalPlaces: currency.decimalPlaces,
    symbolPosition: currency.symbolPosition,
    separatorStyle: currency.separatorStyle,
  };

  /* Frozen so the printed breakdown is reproducible even if tax masters change. */
  const taxSummary = {
    byComponent: calculated.taxSummary.map((row) => ({
      label: row.label,
      taxTypeKey: row.taxTypeKey,
      ratePercent: row.ratePercent,
      taxableAmount: row.taxableAmount,
      taxAmount: row.taxAmount,
    })),
    amountInWords: amountInWords(calculated.grandTotal, currencyFormat),
  };

  const items: PreparedLine[] = input.items.map((item, index) => {
    const computed = calculated.lines[index];
    if (!computed) throw new BusinessRuleError('Line calculation failed.');

    return {
      line: {
        lineNumber: index + 1,
        sortOrder: index,
        itemId: item.itemId ?? null,
        itemCode: null,
        name: item.name,
        description: item.description ?? null,
        hsnSacCode: item.hsnSacCode ?? null,
        unitCode: item.unitCode ?? null,
        quantity: new Prisma.Decimal(item.quantity),
        rate: new Prisma.Decimal(item.rate),
        discountMode: item.discountMode,
        discountValue: new Prisma.Decimal(item.discountValue),
        discountAmount: new Prisma.Decimal(computed.discountAmount),
        lineGross: new Prisma.Decimal(computed.lineGross),
        lineNet: new Prisma.Decimal(computed.lineNet),
        allocatedDocDiscount: new Prisma.Decimal(computed.allocatedDocDiscount),
        taxableAmount: new Prisma.Decimal(computed.taxableAmount),
        taxAmount: new Prisma.Decimal(computed.taxAmount),
        lineTotal: new Prisma.Decimal(computed.lineTotal),
        taxGroupId: item.taxGroupId ?? null,
        isTaxExempt: item.isTaxExempt,
        exemptReason: item.exemptReason ?? null,
      },
      taxes: computed.taxes.map((tax) => ({
        taxRateId: tax.taxRateId,
        taxTypeKey: tax.taxTypeKey,
        label: tax.label,
        ratePercent: new Prisma.Decimal(tax.ratePercent),
        taxableAmount: new Prisma.Decimal(tax.taxableAmount),
        taxAmount: new Prisma.Decimal(tax.taxAmount),
      })),
    };
  });

  return {
    header: {
      customerId: customer.id,
      customerSnapshot: {
        name: customer.name,
        customerCode: customer.customerCode,
        companyName: customer.companyName,
        contactPerson: customer.contactPerson,
        email: customer.email,
        phone: customer.phone,
        gstin: customer.gstin,
        pan: customer.pan,
        taxTreatment: customer.taxTreatment,
      } as Prisma.InputJsonValue,
      billingAddressSnapshot: (billingAddress ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      shippingAddressSnapshot: (shippingAddress ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      companySnapshot: {
        name: company.companyName,
        legalName: company.legalName,
        address: {
          line1: company.addressLine1,
          line2: company.addressLine2,
          city: company.city,
          state: company.state,
          stateCode: company.stateCode,
          country: company.country,
          postalCode: company.postalCode,
        },
        phone: company.phone,
        email: company.email,
        website: company.website,
        gstin: company.gstin,
        pan: company.pan,
        cin: company.cin,
        stateCode: company.stateCode,
        signatureLabel: company.signatureLabel,
      } as Prisma.InputJsonValue,
      placeOfSupplyStateCode:
        input.placeOfSupplyStateCode ?? customer.placeOfSupplyStateCode ?? null,

      currencyCode: currency.code,
      currencySymbol: currency.symbol,
      currencyDecimalPlaces: currency.decimalPlaces,
      exchangeRateToBase: new Prisma.Decimal(input.exchangeRateToBase),
      baseCurrencyCode: company.baseCurrencyCode,
      baseTotal: new Prisma.Decimal(calculated.baseTotal),

      documentDate,
      referenceNumber: input.referenceNumber ?? null,
      subject: input.subject ?? null,

      discountMode: input.discountMode,
      discountValue: new Prisma.Decimal(input.discountValue),
      subtotal: new Prisma.Decimal(calculated.subtotal),
      discountTotal: new Prisma.Decimal(calculated.discountTotal),
      taxableTotal: new Prisma.Decimal(calculated.taxableTotal),
      taxTotal: new Prisma.Decimal(calculated.taxTotal),
      adjustment: new Prisma.Decimal(calculated.adjustment),
      roundOff: new Prisma.Decimal(calculated.roundOff),
      roundOffEnabled: input.roundOffEnabled,
      grandTotal: new Prisma.Decimal(calculated.grandTotal),
      taxSummaryJson: taxSummary as Prisma.InputJsonValue,

      notes: input.notes ?? null,
      terms:
        input.terms ??
        (docType === 'QUOTATION' ? company.defaultTermsQuotation : company.defaultTermsInvoice),
      customerMessage: input.customerMessage ?? null,
      paymentInstructions: input.paymentInstructions ?? null,
      bankAccountId: input.bankAccountId ?? null,
      showBankDetails: input.showBankDetails,

      templateId: template.id,
      templateVersionId: templateVersion.id,
      customFieldsJson: input.customFields as Prisma.InputJsonValue,
    },
    items,
    customerPaymentTermsDays: customer.paymentTermsDays,
  };
};

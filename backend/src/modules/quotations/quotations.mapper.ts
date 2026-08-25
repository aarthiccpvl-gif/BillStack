import type { Prisma } from '@prisma/client';
import { toAmountString, toDateOnlyString, type QuotationRecord } from '@app/shared';
import type { QuotationWithRelations } from './document-data';
import { isExpired } from './quotations.service';

/** Database row → API record. Every amount leaves as a string. */

const asRecord = (value: Prisma.JsonValue | null): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asAddress = (value: Prisma.JsonValue | null) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as QuotationRecord['billingAddress'];
};

export const toQuotationRecord = (quotation: QuotationWithRelations): QuotationRecord => {
  /* Every monetary field leaves at the document currency's own precision, so the
     payload never mixes "112100" with "8550.00". Quantities and rates keep their
     own exact precision — they are not money and have their own scale. */
  const money = (value: Prisma.Decimal): string =>
    toAmountString(value.toString(), quotation.currencyDecimalPlaces);

  const customer = asRecord(quotation.customerSnapshot);
  const summary = asRecord(quotation.taxSummaryJson);
  const converted = quotation.invoices[0];

  return {
    id: quotation.id.toString(),
    number: quotation.number,
    status: quotation.status,
    financialYearId: quotation.financialYearId,
    financialYearCode: quotation.financialYear.code,

    customerId: quotation.customerId,
    customerSnapshot: {
      name: String(customer.name ?? ''),
      customerCode: String(customer.customerCode ?? ''),
      companyName: (customer.companyName as string | null) ?? null,
      contactPerson: (customer.contactPerson as string | null) ?? null,
      email: (customer.email as string | null) ?? null,
      phone: (customer.phone as string | null) ?? null,
      gstin: (customer.gstin as string | null) ?? null,
      pan: (customer.pan as string | null) ?? null,
      taxTreatment: String(customer.taxTreatment ?? 'REGISTERED'),
    },
    billingAddress: asAddress(quotation.billingAddressSnapshot),
    shippingAddress: asAddress(quotation.shippingAddressSnapshot),
    placeOfSupplyStateCode: quotation.placeOfSupplyStateCode,

    currencyCode: quotation.currencyCode,
    currencySymbol: quotation.currencySymbol,
    currencyDecimalPlaces: quotation.currencyDecimalPlaces,
    exchangeRateToBase: quotation.exchangeRateToBase.toString(),
    baseCurrencyCode: quotation.baseCurrencyCode,
    /* A reporting figure in the base currency, kept at full stored precision. */
    baseTotal: quotation.baseTotal.toString(),

    documentDate: toDateOnlyString(quotation.documentDate),
    expiryDate: quotation.expiryDate ? toDateOnlyString(quotation.expiryDate) : null,
    referenceNumber: quotation.referenceNumber,
    subject: quotation.subject,

    discountMode: quotation.discountMode,
    discountValue: quotation.discountValue.toString(),
    subtotal: money(quotation.subtotal),
    discountTotal: money(quotation.discountTotal),
    taxableTotal: money(quotation.taxableTotal),
    taxTotal: money(quotation.taxTotal),
    adjustment: money(quotation.adjustment),
    roundOff: money(quotation.roundOff),
    roundOffEnabled: quotation.roundOffEnabled,
    grandTotal: money(quotation.grandTotal),
    taxSummary: {
      byComponent: Array.isArray(summary.byComponent)
        ? (summary.byComponent as QuotationRecord['taxSummary']['byComponent'])
        : [],
      amountInWords: String(summary.amountInWords ?? ''),
    },

    notes: quotation.notes,
    terms: quotation.terms,
    customerMessage: quotation.customerMessage,
    paymentInstructions: quotation.paymentInstructions,
    bankAccountId: quotation.bankAccountId,
    showBankDetails: quotation.showBankDetails,

    templateId: quotation.templateId,
    templateVersionId: quotation.templateVersionId,
    templateName: quotation.templateVersion.template.name,
    currentVersion: quotation.currentVersion,
    customFields: Array.isArray(quotation.customFieldsJson)
      ? (quotation.customFieldsJson as { label: string; value: string }[])
      : [],

    convertedInvoiceId: converted ? converted.id.toString() : null,
    convertedInvoiceNumber: converted?.number ?? null,
    sentAt: quotation.sentAt ? quotation.sentAt.toISOString() : null,
    firstViewedAt: quotation.firstViewedAt ? quotation.firstViewedAt.toISOString() : null,
    acceptedAt: quotation.acceptedAt ? quotation.acceptedAt.toISOString() : null,
    declinedAt: quotation.declinedAt ? quotation.declinedAt.toISOString() : null,
    cancelledAt: quotation.cancelledAt ? quotation.cancelledAt.toISOString() : null,
    cancelReason: quotation.cancelReason,

    createdById: quotation.createdById,
    createdByName: quotation.createdBy.name,
    createdAt: quotation.createdAt.toISOString(),
    updatedAt: quotation.updatedAt.toISOString(),

    items: quotation.items.map((item) => ({
      id: item.id.toString(),
      lineNumber: item.lineNumber,
      itemId: item.itemId,
      itemCode: item.itemCode,
      name: item.name,
      description: item.description,
      hsnSacCode: item.hsnSacCode,
      unitCode: item.unitCode,
      quantity: item.quantity.toString(),
      rate: item.rate.toString(),
      discountMode: item.discountMode,
      discountValue: item.discountValue.toString(),
      discountAmount: money(item.discountAmount),
      lineGross: money(item.lineGross),
      lineNet: money(item.lineNet),
      allocatedDocDiscount: money(item.allocatedDocDiscount),
      taxableAmount: money(item.taxableAmount),
      taxAmount: money(item.taxAmount),
      lineTotal: money(item.lineTotal),
      taxGroupId: item.taxGroupId,
      isTaxExempt: item.isTaxExempt,
      exemptReason: item.exemptReason,
      taxes: item.taxes.map((tax) => ({
        id: tax.id.toString(),
        taxRateId: tax.taxRateId,
        taxTypeKey: tax.taxTypeKey,
        label: tax.label,
        ratePercent: tax.ratePercent.toString(),
        taxableAmount: money(tax.taxableAmount),
        taxAmount: money(tax.taxAmount),
      })),
    })),

    isDraft: quotation.status === 'DRAFT',
    isExpired: isExpired(quotation),
  };
};

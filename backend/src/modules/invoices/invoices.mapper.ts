import type { Prisma } from '@prisma/client';
import { toAmountString, toDateOnlyString, type InvoiceRecord } from '@app/shared';
import type { InvoiceWithRelations } from './document-data';
import { outstandingOf, overdueOf } from './invoices.payments';

/** Database row → API record. Every amount leaves as a string. */

const asRecord = (value: Prisma.JsonValue | null): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asAddress = (value: Prisma.JsonValue | null) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as InvoiceRecord['billingAddress'];
};

export const toInvoiceRecord = (invoice: InvoiceWithRelations): InvoiceRecord => {
  /* Every monetary field leaves at the document currency's own precision, so the
     payload never mixes "112100" with "8550.00". Quantities and rates keep their
     own exact precision — they are not money and have their own scale. */
  const money = (value: Prisma.Decimal): string =>
    toAmountString(value.toString(), invoice.currencyDecimalPlaces);

  const customer = asRecord(invoice.customerSnapshot);
  const summary = asRecord(invoice.taxSummaryJson);
  const overdue = overdueOf(invoice);

  return {
    id: invoice.id.toString(),
    number: invoice.number,
    status: invoice.status,
    financialYearId: invoice.financialYearId,
    financialYearCode: invoice.financialYear.code,

    customerId: invoice.customerId,
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
    billingAddress: asAddress(invoice.billingAddressSnapshot),
    shippingAddress: asAddress(invoice.shippingAddressSnapshot),
    placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,

    currencyCode: invoice.currencyCode,
    currencySymbol: invoice.currencySymbol,
    currencyDecimalPlaces: invoice.currencyDecimalPlaces,
    exchangeRateToBase: invoice.exchangeRateToBase.toString(),
    baseCurrencyCode: invoice.baseCurrencyCode,
    /* A reporting figure in the base currency, kept at full stored precision. */
    baseTotal: invoice.baseTotal.toString(),

    documentDate: toDateOnlyString(invoice.documentDate),
    dueDate: invoice.dueDate ? toDateOnlyString(invoice.dueDate) : null,
    paymentTermsDays: invoice.paymentTermsDays,
    referenceNumber: invoice.referenceNumber,
    subject: invoice.subject,

    discountMode: invoice.discountMode,
    discountValue: invoice.discountValue.toString(),
    subtotal: money(invoice.subtotal),
    discountTotal: money(invoice.discountTotal),
    taxableTotal: money(invoice.taxableTotal),
    taxTotal: money(invoice.taxTotal),
    adjustment: money(invoice.adjustment),
    roundOff: money(invoice.roundOff),
    roundOffEnabled: invoice.roundOffEnabled,
    grandTotal: money(invoice.grandTotal),
    taxSummary: {
      byComponent: Array.isArray(summary.byComponent)
        ? (summary.byComponent as InvoiceRecord['taxSummary']['byComponent'])
        : [],
      amountInWords: String(summary.amountInWords ?? ''),
    },

    amountPaid: money(invoice.amountPaid),
    amountOutstanding: money(outstandingOf(invoice)),
    paymentReference: invoice.paymentReference,

    notes: invoice.notes,
    terms: invoice.terms,
    customerMessage: invoice.customerMessage,
    paymentInstructions: invoice.paymentInstructions,
    bankAccountId: invoice.bankAccountId,
    showBankDetails: invoice.showBankDetails,

    templateId: invoice.templateId,
    templateVersionId: invoice.templateVersionId,
    templateName: invoice.templateVersion.template.name,
    currentVersion: invoice.currentVersion,
    customFields: Array.isArray(invoice.customFieldsJson)
      ? (invoice.customFieldsJson as { label: string; value: string }[])
      : [],

    quotationId: invoice.quotationId ? invoice.quotationId.toString() : null,
    quotationNumber: invoice.sourceQuotation?.number ?? null,

    issuedAt: invoice.issuedAt ? invoice.issuedAt.toISOString() : null,
    sentAt: invoice.sentAt ? invoice.sentAt.toISOString() : null,
    firstViewedAt: invoice.firstViewedAt ? invoice.firstViewedAt.toISOString() : null,
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    cancelledAt: invoice.cancelledAt ? invoice.cancelledAt.toISOString() : null,
    voidedAt: invoice.voidedAt ? invoice.voidedAt.toISOString() : null,
    cancelReason: invoice.cancelReason,

    createdById: invoice.createdById,
    createdByName: invoice.createdBy.name,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),

    items: invoice.items.map((item) => ({
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

    isDraft: invoice.status === 'DRAFT',
    isOverdue: overdue.isOverdue,
    daysOverdue: overdue.daysOverdue,
  };
};

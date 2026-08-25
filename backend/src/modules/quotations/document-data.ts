import type { Prisma } from '@prisma/client';
import {
  amountInWords,
  parseTemplateConfig,
  toDateOnlyString,
  type AddressBlock,
  type DocumentData,
  type TemplateConfig,
} from '@app/shared';
import { prisma } from '../../db/prisma';
import { NotFoundError } from '../../utils/errors';
import { loadCompanyAssets } from '../templates/company-assets';

/**
 * Stored document → `DocumentData`.
 *
 * The renderer never touches the database: it is handed this pure, self-contained
 * shape. Everything here comes from the snapshots taken when the document was
 * saved, so re-rendering an old document reproduces what the customer received
 * rather than what the masters say today.
 */

export const quotationInclude = {
  items: { include: { taxes: true }, orderBy: { sortOrder: 'asc' } },
  currency: true,
  customer: true,
  financialYear: true,
  templateVersion: { include: { template: true } },
  createdBy: { select: { id: true, name: true } },
  invoices: { select: { id: true, number: true } },
} satisfies Prisma.QuotationInclude;

export type QuotationWithRelations = Prisma.QuotationGetPayload<{
  include: typeof quotationInclude;
}>;

const asAddress = (value: Prisma.JsonValue | null): AddressBlock | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as AddressBlock;
};

const asRecord = (value: Prisma.JsonValue | null): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

export interface BuildDocumentDataOptions {
  /** Inline the logo, signature and seal. Skipped for a JSON response. */
  withAssets?: boolean;
}

export const buildQuotationData = async (
  quotation: QuotationWithRelations,
  options: BuildDocumentDataOptions = {},
): Promise<{ data: DocumentData; config: TemplateConfig; engineKey: string }> => {
  const templateVersion = quotation.templateVersion;
  if (!templateVersion) throw new NotFoundError('Template version');

  const config = parseTemplateConfig(templateVersion.configJson, 'QUOTATION');
  const customer = asRecord(quotation.customerSnapshot);
  const company = asRecord(quotation.companySnapshot);
  const companyAddress = asAddress(
    (company.address as Prisma.JsonValue | undefined) ?? null,
  );

  /* Branding is loaded live rather than snapshotted: the bytes behind each asset
     are immutable (keys are timestamped), so this picks up the same image the
     document was issued with while keeping the row small. */
  const assets = options.withAssets ? await loadCompanyAssets() : {};

  const bank =
    quotation.showBankDetails && quotation.bankAccountId
      ? await prisma.companyBankAccount.findUnique({ where: { id: quotation.bankAccountId } })
      : null;

  const summary = asRecord(quotation.taxSummaryJson);
  const byComponent = Array.isArray(summary.byComponent)
    ? (summary.byComponent as DocumentData['taxSummary']['byComponent'])
    : [];
  const byHsn = Array.isArray(summary.byHsn)
    ? (summary.byHsn as DocumentData['taxSummary']['byHsn'])
    : undefined;

  const currency = {
    code: quotation.currencyCode,
    symbol: quotation.currencySymbol,
    decimalPlaces: quotation.currencyDecimalPlaces,
    symbolPosition: quotation.currency.symbolPosition,
    separatorStyle: quotation.currency.separatorStyle,
  };

  const data: DocumentData = {
    schemaVersion: 1,
    docType: 'QUOTATION',
    number: quotation.number,
    status: quotation.status,
    dates: {
      document: toDateOnlyString(quotation.documentDate),
      expiry: quotation.expiryDate ? toDateOnlyString(quotation.expiryDate) : null,
      due: null,
    },
    reference: quotation.referenceNumber,
    subject: quotation.subject,
    company: {
      name: str(company.name) ?? 'Company',
      legalName: str(company.legalName),
      address: companyAddress ?? {},
      phone: str(company.phone),
      email: str(company.email),
      website: str(company.website),
      gstin: str(company.gstin),
      pan: str(company.pan),
      cin: str(company.cin),
      stateCode: str(company.stateCode),
      signatureLabel: str(company.signatureLabel),
      logo: null,
      signature: null,
      seal: null,
      ...assets,
    },
    customer: {
      name: str(customer.name) ?? '',
      code: str(customer.customerCode) ?? '',
      companyName: str(customer.companyName),
      contactPerson: str(customer.contactPerson),
      email: str(customer.email),
      phone: str(customer.phone),
      gstin: str(customer.gstin),
      pan: str(customer.pan),
      taxTreatment: str(customer.taxTreatment) ?? 'REGISTERED',
      placeOfSupply: quotation.placeOfSupplyStateCode,
    },
    billingAddress: asAddress(quotation.billingAddressSnapshot),
    shippingAddress: asAddress(quotation.shippingAddressSnapshot),
    currency,
    lines: quotation.items.map((item) => ({
      lineNumber: item.lineNumber,
      name: item.name,
      description: item.description,
      hsnSac: item.hsnSacCode,
      unit: item.unitCode,
      quantity: item.quantity.toString(),
      rate: item.rate.toString(),
      discountLabel:
        item.discountMode === 'PERCENT' ? `${item.discountValue.toString()}%` : null,
      discountAmount: item.discountAmount.toString(),
      taxes: item.taxes.map((tax) => ({
        label: tax.label,
        ratePercent: tax.ratePercent.toString(),
        taxAmount: tax.taxAmount.toString(),
      })),
      taxableAmount: item.taxableAmount.toString(),
      lineTotal: item.lineTotal.toString(),
    })),
    totals: {
      subtotal: quotation.subtotal.toString(),
      discountTotal: quotation.discountTotal.toString(),
      taxableTotal: quotation.taxableTotal.toString(),
      taxTotal: quotation.taxTotal.toString(),
      adjustment: quotation.adjustment.toString(),
      roundOff: quotation.roundOff.toString(),
      grandTotal: quotation.grandTotal.toString(),
      amountPaid: null,
      balanceDue: null,
      /* Taken from the stored snapshot so the words can never disagree with the
         printed figure; regenerated only if an older row predates the field. */
      amountInWords:
        str(summary.amountInWords) ?? amountInWords(quotation.grandTotal.toString(), currency),
    },
    taxSummary: { byComponent, ...(byHsn ? { byHsn } : {}) },
    bank: bank
      ? {
          bankName: bank.bankName,
          accountName: bank.accountName,
          accountNumber: bank.accountNumber,
          ifsc: bank.ifsc,
          swift: bank.swift,
          branch: bank.branch,
          paymentInstructions: quotation.paymentInstructions ?? bank.paymentInstructions,
        }
      : null,
    notes: quotation.notes,
    terms: quotation.terms,
    customerMessage: quotation.customerMessage,
    customFields: Array.isArray(quotation.customFieldsJson)
      ? (quotation.customFieldsJson as { label: string; value: string }[])
      : [],
    meta: {
      templateKey: templateVersion.template.key,
      templateVersion: templateVersion.version,
      documentVersion: quotation.currentVersion,
      generatedAt: new Date().toISOString(),
    },
  };

  return { data, config, engineKey: templateVersion.template.engineKey };
};

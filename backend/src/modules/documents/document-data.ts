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
 * Stored document → `DocumentData`, for quotations and invoices alike.
 *
 * The renderer never touches the database: it is handed this pure, self-contained
 * shape. Everything here comes from the snapshots taken when the document was
 * saved, so re-rendering an old document reproduces what the customer received
 * rather than what the masters say today.
 *
 * The caller passes the few facts that differ between the two — the dates, and
 * whether money has been received — because everything else about how a document
 * is turned into a printable page is genuinely the same.
 */

/** The columns this builder reads. Both Prisma payloads satisfy it structurally. */
export interface DocumentSource {
  number: string;
  status: string;
  documentDate: Date;
  referenceNumber: string | null;
  subject: string | null;

  customerSnapshot: Prisma.JsonValue;
  companySnapshot: Prisma.JsonValue;
  billingAddressSnapshot: Prisma.JsonValue | null;
  shippingAddressSnapshot: Prisma.JsonValue | null;
  placeOfSupplyStateCode: string | null;

  currencyCode: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
  currency: { symbolPosition: 'PREFIX' | 'SUFFIX'; separatorStyle: 'WESTERN' | 'INDIAN' };

  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxableTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  adjustment: Prisma.Decimal;
  roundOff: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  taxSummaryJson: Prisma.JsonValue;

  notes: string | null;
  terms: string | null;
  customerMessage: string | null;
  paymentInstructions: string | null;
  bankAccountId: number | null;
  showBankDetails: boolean;
  customFieldsJson: Prisma.JsonValue | null;
  currentVersion: number;

  templateVersion: {
    version: number;
    configJson: Prisma.JsonValue;
    template: { key: string; engineKey: string };
  } | null;

  items: {
    lineNumber: number;
    name: string;
    description: string | null;
    hsnSacCode: string | null;
    unitCode: string | null;
    quantity: Prisma.Decimal;
    rate: Prisma.Decimal;
    discountMode: string;
    discountValue: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    taxableAmount: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    taxes: { label: string; ratePercent: Prisma.Decimal; taxAmount: Prisma.Decimal }[];
  }[];
}

export interface DocumentExtras {
  /** Quotations only. */
  expiry?: string | null;
  /** Invoices only. */
  due?: string | null;
  amountPaid?: string | null;
  balanceDue?: string | null;
}

export interface BuildDocumentDataOptions {
  /** Inline the logo, signature and seal. Skipped for a JSON response. */
  withAssets?: boolean;
}

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

export const buildDocumentData = async (
  docType: 'QUOTATION' | 'INVOICE',
  source: DocumentSource,
  extras: DocumentExtras,
  options: BuildDocumentDataOptions = {},
): Promise<{ data: DocumentData; config: TemplateConfig; engineKey: string }> => {
  const templateVersion = source.templateVersion;
  if (!templateVersion) throw new NotFoundError('Template version');

  const config = parseTemplateConfig(templateVersion.configJson, docType);
  const customer = asRecord(source.customerSnapshot);
  const company = asRecord(source.companySnapshot);
  const companyAddress = asAddress((company.address as Prisma.JsonValue | undefined) ?? null);

  /* Branding is loaded live rather than snapshotted: the bytes behind each asset
     are immutable (keys are timestamped), so this picks up the same image the
     document was issued with while keeping the row small. */
  const assets = options.withAssets ? await loadCompanyAssets() : {};

  const bank =
    source.showBankDetails && source.bankAccountId
      ? await prisma.companyBankAccount.findUnique({ where: { id: source.bankAccountId } })
      : null;

  const summary = asRecord(source.taxSummaryJson);
  const byComponent = Array.isArray(summary.byComponent)
    ? (summary.byComponent as DocumentData['taxSummary']['byComponent'])
    : [];
  const byHsn = Array.isArray(summary.byHsn)
    ? (summary.byHsn as DocumentData['taxSummary']['byHsn'])
    : undefined;

  const currency = {
    code: source.currencyCode,
    symbol: source.currencySymbol,
    decimalPlaces: source.currencyDecimalPlaces,
    symbolPosition: source.currency.symbolPosition,
    separatorStyle: source.currency.separatorStyle,
  };

  const data: DocumentData = {
    schemaVersion: 1,
    docType,
    number: source.number,
    status: source.status,
    dates: {
      document: toDateOnlyString(source.documentDate),
      expiry: extras.expiry ?? null,
      due: extras.due ?? null,
    },
    reference: source.referenceNumber,
    subject: source.subject,
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
      placeOfSupply: source.placeOfSupplyStateCode,
    },
    billingAddress: asAddress(source.billingAddressSnapshot),
    shippingAddress: asAddress(source.shippingAddressSnapshot),
    currency,
    lines: source.items.map((item) => ({
      lineNumber: item.lineNumber,
      name: item.name,
      description: item.description,
      hsnSac: item.hsnSacCode,
      unit: item.unitCode,
      quantity: item.quantity.toString(),
      rate: item.rate.toString(),
      discountLabel: item.discountMode === 'PERCENT' ? `${item.discountValue.toString()}%` : null,
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
      subtotal: source.subtotal.toString(),
      discountTotal: source.discountTotal.toString(),
      taxableTotal: source.taxableTotal.toString(),
      taxTotal: source.taxTotal.toString(),
      adjustment: source.adjustment.toString(),
      roundOff: source.roundOff.toString(),
      grandTotal: source.grandTotal.toString(),
      amountPaid: extras.amountPaid ?? null,
      balanceDue: extras.balanceDue ?? null,
      /* Taken from the stored snapshot so the words can never disagree with the
         printed figure; regenerated only if an older row predates the field. */
      amountInWords:
        str(summary.amountInWords) ?? amountInWords(source.grandTotal.toString(), currency),
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
          paymentInstructions: source.paymentInstructions ?? bank.paymentInstructions,
        }
      : null,
    notes: source.notes,
    terms: source.terms,
    customerMessage: source.customerMessage,
    customFields: Array.isArray(source.customFieldsJson)
      ? (source.customFieldsJson as { label: string; value: string }[])
      : [],
    meta: {
      templateKey: templateVersion.template.key,
      templateVersion: templateVersion.version,
      documentVersion: source.currentVersion,
      generatedAt: new Date().toISOString(),
    },
  };

  return { data, config, engineKey: templateVersion.template.engineKey };
};

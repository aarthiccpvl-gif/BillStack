import { useMemo } from 'react';
import {
  PERMISSIONS,
  createQuotationSchema,
  type CreateQuotationInput,
  type CustomerRecord,
  type QuotationRecord,
} from '@app/shared';
import { Field, inputClass } from '@/components/form';
import { quotationKeys, quotationsApi } from '@/services/quotations-api';
import { addDays, todayIso } from '@/utils/format';
import { DocumentEditor } from '@/modules/documents/DocumentEditor';
import {
  blankDocumentValues,
  linesFromRecord,
  matchAddress,
  type DateFieldsProps,
  type DocumentEditorConfig,
  type DocumentFormValues,
} from '@/modules/documents/document-editor.config';

/**
 * The quotation editor — the shared document editor, told what a quotation is.
 *
 * A quotation's own facts are small: it is valid until a date rather than due on
 * one, it locks once converted or cancelled, and it uses the quotation endpoints.
 */

const DEFAULT_VALIDITY_DAYS = 30;

const QuotationDateFields = ({ register, errors, disabled }: DateFieldsProps) => (
  <>
    <Field
      label="Quotation date"
      htmlFor="documentDate"
      required
      error={errors.documentDate}
      className="col-md-3 mb-3"
    >
      <input
        id="documentDate"
        type="date"
        className={inputClass(errors.documentDate)}
        disabled={disabled}
        {...register('documentDate')}
      />
    </Field>

    <Field
      label="Valid until"
      htmlFor="expiryDate"
      error={errors.expiryDate}
      className="col-md-3 mb-3"
    >
      <input
        id="expiryDate"
        type="date"
        className={inputClass(errors.expiryDate)}
        disabled={disabled}
        {...register('expiryDate')}
      />
    </Field>
  </>
);

export const quotationEditorConfig: DocumentEditorConfig<QuotationRecord> = {
  docType: 'QUOTATION',
  noun: 'quotation',
  listLabel: 'Quotations',
  listPath: '/quotations',
  detailPath: (id) => `/quotations/${id}`,

  schema: createQuotationSchema,

  blankValues: () => ({
    ...blankDocumentValues(todayIso()),
    expiryDate: addDays(todayIso(), DEFAULT_VALIDITY_DAYS),
  }),

  toFormValues: (quotation, customers): DocumentFormValues => {
    const customer: CustomerRecord | undefined = customers.find(
      (entry) => entry.id === quotation.customerId,
    );

    return {
      customerId: quotation.customerId,
      documentDate: quotation.documentDate,
      expiryDate: quotation.expiryDate,
      referenceNumber: quotation.referenceNumber,
      subject: quotation.subject,
      currencyCode: quotation.currencyCode,
      exchangeRateToBase: quotation.exchangeRateToBase,
      placeOfSupplyStateCode: quotation.placeOfSupplyStateCode,
      billingAddressId: matchAddress(
        quotation.billingAddress,
        customer?.addresses ?? [],
        'BILLING',
      ),
      shippingAddressId: matchAddress(
        quotation.shippingAddress,
        customer?.addresses ?? [],
        'SHIPPING',
      ),
      templateId: quotation.templateId,
      bankAccountId: quotation.bankAccountId,
      showBankDetails: quotation.showBankDetails,
      discountMode: quotation.discountMode,
      discountValue: quotation.discountValue,
      adjustment: quotation.adjustment,
      roundOffEnabled: quotation.roundOffEnabled,
      notes: quotation.notes,
      terms: quotation.terms,
      customerMessage: quotation.customerMessage,
      paymentInstructions: quotation.paymentInstructions,
      customFields: quotation.customFields ?? [],
      items: linesFromRecord(quotation.items),
    } as unknown as DocumentFormValues;
  },

  stateOf: (quotation) => ({
    id: quotation.id,
    number: quotation.number,
    status: quotation.status,
    locked: quotation.status === 'CONVERTED' || quotation.status === 'CANCELLED',
    lockedMessage:
      quotation.status === 'CONVERTED'
        ? 'This quotation has been converted to an invoice and can no longer be changed.'
        : 'This quotation is cancelled and can no longer be changed.',
  }),

  defaultTermsOf: (company) => company.defaultTermsQuotation,

  api: {
    get: (id) => quotationsApi.get(id),
    create: (input) => quotationsApi.create(input as unknown as CreateQuotationInput),
    update: (id, input) =>
      quotationsApi.update(id, input as unknown as Parameters<typeof quotationsApi.update>[1]),
    previewHtml: (id) => quotationsApi.previewHtml(id),
  },

  keys: { all: quotationKeys.all, detail: (id) => quotationKeys.detail(id) },

  permissions: { create: PERMISSIONS.QUOTATION_CREATE, update: PERMISSIONS.QUOTATION_UPDATE },

  DateFields: QuotationDateFields,
};

export const QuotationEditorPage = () => {
  /* Stable across renders: the editor keys effects on the config object. */
  const config = useMemo(() => quotationEditorConfig, []);
  return <DocumentEditor config={config} />;
};

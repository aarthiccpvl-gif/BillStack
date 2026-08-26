import { useMemo } from 'react';
import {
  PERMISSIONS,
  createInvoiceSchema,
  type CreateInvoiceInput,
  type CustomerRecord,
  type InvoiceRecord,
} from '@app/shared';
import { Field, inputClass } from '@/components/form';
import { invoiceKeys, invoicesApi } from '@/services/invoices-api';
import { todayIso } from '@/utils/format';
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
 * The invoice editor — the shared document editor, told what an invoice is.
 *
 * An invoice's own facts: it is due on a date rather than valid until one, that
 * date is derived from the payment terms when it is left blank, and it locks once
 * cancelled or voided rather than converted.
 */

const InvoiceDateFields = ({ register, errors, disabled }: DateFieldsProps) => (
  <>
    <Field
      label="Invoice date"
      htmlFor="documentDate"
      required
      error={errors.documentDate}
      className="col-md-2 mb-3"
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
      label="Payment terms"
      htmlFor="paymentTermsDays"
      help="Days. Leave the due date blank and it follows from this."
      error={errors.paymentTermsDays}
      className="col-md-2 mb-3"
    >
      <input
        id="paymentTermsDays"
        type="number"
        min={0}
        max={365}
        className={`${inputClass(errors.paymentTermsDays)} text-numeric`}
        disabled={disabled}
        {...register('paymentTermsDays', {
          setValueAs: (value: unknown) =>
            value === '' || value === null || value === undefined ? undefined : Number(value),
        })}
      />
    </Field>

    <Field label="Due date" htmlFor="dueDate" error={errors.dueDate} className="col-md-2 mb-3">
      <input
        id="dueDate"
        type="date"
        className={inputClass(errors.dueDate)}
        disabled={disabled}
        {...register('dueDate')}
      />
    </Field>
  </>
);

export const invoiceEditorConfig: DocumentEditorConfig<InvoiceRecord> = {
  docType: 'INVOICE',
  noun: 'invoice',
  listLabel: 'Invoices',
  listPath: '/invoices',
  detailPath: (id) => `/invoices/${id}`,

  schema: createInvoiceSchema,

  /* No due date: the server derives it from the customer's own payment terms, so
     leaving it blank is the honest default rather than a guess made here. */
  blankValues: () => ({ ...blankDocumentValues(todayIso()), dueDate: null }),

  toFormValues: (invoice, customers): DocumentFormValues => {
    const customer: CustomerRecord | undefined = customers.find(
      (entry) => entry.id === invoice.customerId,
    );

    return {
      customerId: invoice.customerId,
      documentDate: invoice.documentDate,
      dueDate: invoice.dueDate,
      paymentTermsDays: invoice.paymentTermsDays,
      referenceNumber: invoice.referenceNumber,
      subject: invoice.subject,
      currencyCode: invoice.currencyCode,
      exchangeRateToBase: invoice.exchangeRateToBase,
      placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
      billingAddressId: matchAddress(invoice.billingAddress, customer?.addresses ?? [], 'BILLING'),
      shippingAddressId: matchAddress(
        invoice.shippingAddress,
        customer?.addresses ?? [],
        'SHIPPING',
      ),
      templateId: invoice.templateId,
      bankAccountId: invoice.bankAccountId,
      showBankDetails: invoice.showBankDetails,
      discountMode: invoice.discountMode,
      discountValue: invoice.discountValue,
      adjustment: invoice.adjustment,
      roundOffEnabled: invoice.roundOffEnabled,
      notes: invoice.notes,
      terms: invoice.terms,
      customerMessage: invoice.customerMessage,
      paymentInstructions: invoice.paymentInstructions,
      customFields: invoice.customFields ?? [],
      items: linesFromRecord(invoice.items),
    } as unknown as DocumentFormValues;
  },

  stateOf: (invoice) => ({
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    locked: invoice.status === 'CANCELLED' || invoice.status === 'VOID',
    lockedMessage:
      invoice.status === 'CANCELLED'
        ? 'This invoice is cancelled and can no longer be changed.'
        : 'This invoice has been voided and can no longer be changed.',
  }),

  defaultTermsOf: (company) => company.defaultTermsInvoice,

  api: {
    get: (id) => invoicesApi.get(id),
    create: (input) => invoicesApi.create(input as unknown as CreateInvoiceInput),
    update: (id, input) =>
      invoicesApi.update(id, input as unknown as Parameters<typeof invoicesApi.update>[1]),
    previewHtml: (id) => invoicesApi.previewHtml(id),
  },

  keys: { all: invoiceKeys.all, detail: (id) => invoiceKeys.detail(id) },

  permissions: { create: PERMISSIONS.INVOICE_CREATE, update: PERMISSIONS.INVOICE_UPDATE },

  DateFields: InvoiceDateFields,
};

export const InvoiceEditorPage = () => {
  /* Stable across renders: the editor keys effects on the config object. */
  const config = useMemo(() => invoiceEditorConfig, []);
  return <DocumentEditor config={config} />;
};

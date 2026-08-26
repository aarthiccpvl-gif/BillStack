import type { ZodTypeAny } from 'zod';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { emptyLine } from './ItemsGrid';
import type {
  CompanySettingsRecord,
  CreateInvoiceInput,
  CustomerAddressRecord,
  CustomerRecord,
  Permission,
} from '@app/shared';

/**
 * What the shared document editor needs to know about the document it is editing.
 *
 * A quotation and an invoice are the same form with different dates, different
 * wording and a different endpoint. Everything in this file is that difference,
 * stated once per document type instead of being spread through a second copy of
 * a seven-hundred-line component.
 */

/**
 * The form's value shape: the union of both documents' fields.
 *
 * The invoice input is the wider of the two, so it is the base; `expiryDate` is
 * the one field only a quotation has. Zod strips whatever does not belong to the
 * schema being submitted, so an invoice never sends `expiryDate` and a quotation
 * never sends `dueDate` — the extra keys simply never reach the API.
 */
export type DocumentFormValues = CreateInvoiceInput & { expiryDate?: string | null };

export interface DateFieldsProps {
  register: UseFormRegister<DocumentFormValues>;
  errors: FieldErrors<DocumentFormValues>;
  disabled: boolean;
}

/** What the editor needs to read back out of a saved document. */
export interface DocumentEditorState {
  id: string;
  number: string;
  status: string;
  /** True when the document may no longer be changed at all. */
  locked: boolean;
  lockedMessage?: string;
}

export interface DocumentEditorConfig<TRecord> {
  docType: 'QUOTATION' | 'INVOICE';
  /** Lower case, used inside sentences: "Save the invoice". */
  noun: string;
  listLabel: string;
  listPath: string;
  detailPath: (id: string) => string;

  schema: ZodTypeAny;
  blankValues: () => DocumentFormValues;
  toFormValues: (record: TRecord, customers: CustomerRecord[]) => DocumentFormValues;
  stateOf: (record: TRecord) => DocumentEditorState;
  defaultTermsOf: (company: CompanySettingsRecord) => string | null;

  api: {
    get: (id: string) => Promise<TRecord>;
    create: (input: DocumentFormValues) => Promise<TRecord>;
    update: (id: string, input: DocumentFormValues & { changeReason?: string }) => Promise<TRecord>;
    previewHtml: (id: string) => Promise<string>;
  };

  keys: {
    all: readonly unknown[];
    detail: (id: string) => readonly unknown[];
  };

  permissions: { create: Permission; update: Permission };

  DateFields: (props: DateFieldsProps) => JSX.Element;
}

/**
 * A stable fingerprint of the form, used to answer "has anything actually changed?".
 *
 * React Hook Form's own `isDirty` reports true as soon as a document is loaded,
 * because the values it is given never deep-equal the blank defaults it was
 * created with. Comparing a canonical snapshot instead means the "unsaved changes"
 * bar appears when the user has changed something, and not before.
 */
export const fingerprint = (value: unknown): string =>
  JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : entry,
  );

/**
 * Reads an optional reference out of a `<select>`.
 *
 * React Hook Form hands `setValueAs` whatever the field currently holds, which is
 * `null` for an unset reference — and `Number(null)` is 0, an id that exists for
 * no record. Everything that is not a chosen value becomes null.
 */
export const asOptionalId = (value: unknown): number | null =>
  value === '' || value === null || value === undefined ? null : Number(value);

export const defaultAddressId = (
  addresses: CustomerAddressRecord[],
  type: 'BILLING' | 'SHIPPING',
): number | null =>
  (
    addresses.find((address) => address.type === type && address.isDefault) ??
    addresses.find((address) => address.type === type)
  )?.id ?? null;

/**
 * Which saved address the stored snapshot came from.
 *
 * The document keeps a snapshot rather than a foreign key — that is what makes it
 * historically honest — so on edit we match the snapshot back to the customer's
 * address list to pre-select the right entry. No match simply means the address
 * has since been edited or removed, and the default is offered instead.
 */
export const matchAddress = (
  snapshot: { line1?: string | null; city?: string | null; postalCode?: string | null } | null,
  addresses: CustomerAddressRecord[],
  type: 'BILLING' | 'SHIPPING',
): number | null => {
  if (!snapshot) return null;

  const exact = addresses.find(
    (address) =>
      (address.line1 ?? '') === (snapshot.line1 ?? '') &&
      (address.city ?? '') === (snapshot.city ?? '') &&
      (address.postalCode ?? '') === (snapshot.postalCode ?? ''),
  );

  return exact?.id ?? defaultAddressId(addresses, type);
};

/** The line shape both documents share, mapped out of a saved record. */
export const linesFromRecord = (
  items: {
    itemId: number | null;
    name: string;
    description: string | null;
    hsnSacCode: string | null;
    unitCode: string | null;
    quantity: string;
    rate: string;
    discountMode: 'NONE' | 'PERCENT' | 'AMOUNT';
    discountValue: string;
    taxGroupId: number | null;
    isTaxExempt: boolean;
    exemptReason: string | null;
  }[],
): DocumentFormValues['items'] =>
  items.map((item) => ({
    itemId: item.itemId,
    name: item.name,
    description: item.description,
    hsnSacCode: item.hsnSacCode,
    unitCode: item.unitCode,
    quantity: item.quantity,
    rate: item.rate,
    discountMode: item.discountMode,
    discountValue: item.discountValue,
    taxGroupId: item.taxGroupId,
    isTaxExempt: item.isTaxExempt,
    exemptReason: item.exemptReason,
  }));

/** The defaults every new document starts from, before its own dates are added. */
export const blankDocumentValues = (documentDate: string): DocumentFormValues =>
  ({
    customerId: undefined,
    documentDate,
    referenceNumber: null,
    subject: null,
    currencyCode: 'INR',
    exchangeRateToBase: '1',
    placeOfSupplyStateCode: null,
    billingAddressId: null,
    shippingAddressId: null,
    templateId: null,
    bankAccountId: null,
    showBankDetails: true,
    discountMode: 'NONE',
    discountValue: '0',
    adjustment: '0',
    roundOffEnabled: true,
    notes: null,
    terms: null,
    customerMessage: null,
    paymentInstructions: null,
    customFields: [],
    items: [emptyLine()],
  }) as unknown as DocumentFormValues;

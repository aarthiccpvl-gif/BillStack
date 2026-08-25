import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import {
  PERMISSIONS,
  amountInWords,
  createQuotationSchema,
  requiresChangeReason,
  type AddressBlock,
  type CreateQuotationInput,
  type CustomerAddressRecord,
  type CustomerRecord,
  type DocumentLineInput,
  type QuotationRecord,
} from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { Field, FieldGroup, describedBy, inputClass, selectClass } from '@/components/form';
import { ErrorState } from '@/components/states';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { quotationKeys, quotationsApi } from '@/services/quotations-api';
import { templateKeys, templatesApi } from '@/services/templates-api';
import { useCurrencies, useCurrencyFormat, useTaxGroups, useUnits } from '@/hooks/useMasters';
import {
  useBankAccounts,
  useCompanySettings,
  useCustomerOptions,
  useItemOptions,
} from '@/hooks/useLookups';
import { addDays, todayIso } from '@/utils/format';
import { ItemsGrid, emptyLine } from '@/modules/documents/ItemsGrid';
import { TotalsPanel } from '@/modules/documents/TotalsPanel';
import { DocumentPreviewCard } from '@/modules/documents/DocumentPreviewCard';
import { useDocumentTotals } from '@/modules/documents/useDocumentTotals';

/**
 * The quotation editor.
 *
 * Two things are worth knowing about how this behaves:
 *
 *  - The totals panel is not an estimate. It runs the same `calculateDocument`
 *    from `@app/shared` that the server runs inside the save transaction, so the
 *    figure while typing is the figure that gets stored. The server still
 *    recalculates and remains the authority; nothing about money is sent from here.
 *  - The number is allocated by the server on first save (decision Q7), which is
 *    also when the rendered preview becomes available — it shows the document as
 *    saved, not as typed.
 */

const DEFAULT_VALIDITY_DAYS = 30;

/**
 * A stable fingerprint of the form, used to answer "has anything actually changed?".
 *
 * React Hook Form's own `isDirty` reports true here as soon as the document is
 * loaded, because the values it is given never deep-equal the blank defaults it
 * was created with. Comparing a canonical snapshot instead means the "unsaved
 * changes" bar appears when the user has changed something, and not before.
 */
const fingerprint = (value: unknown): string =>
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
const asOptionalId = (value: unknown): number | null =>
  value === '' || value === null || value === undefined ? null : Number(value);

const blankValues = (): CreateQuotationInput =>
  ({
    customerId: undefined,
    documentDate: todayIso(),
    expiryDate: addDays(todayIso(), DEFAULT_VALIDITY_DAYS),
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
  }) as unknown as CreateQuotationInput;

/**
 * Which saved address the stored snapshot came from.
 *
 * The document keeps a snapshot rather than a foreign key — that is what makes it
 * historically honest — so on edit we match the snapshot back to the customer's
 * address list to pre-select the right entry. No match simply means the address
 * has since been edited or removed, and the default is offered instead.
 */
const defaultAddressId = (
  addresses: CustomerAddressRecord[],
  type: 'BILLING' | 'SHIPPING',
): number | null =>
  (
    addresses.find((address) => address.type === type && address.isDefault) ??
    addresses.find((address) => address.type === type)
  )?.id ?? null;

const matchAddress = (
  snapshot: AddressBlock | null,
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

const toFormValues = (
  quotation: QuotationRecord,
  customer: CustomerRecord | undefined,
): CreateQuotationInput =>
  ({
    customerId: quotation.customerId,
    documentDate: quotation.documentDate,
    expiryDate: quotation.expiryDate,
    referenceNumber: quotation.referenceNumber,
    subject: quotation.subject,
    currencyCode: quotation.currencyCode,
    exchangeRateToBase: quotation.exchangeRateToBase,
    placeOfSupplyStateCode: quotation.placeOfSupplyStateCode,
    billingAddressId: matchAddress(quotation.billingAddress, customer?.addresses ?? [], 'BILLING'),
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
    items: quotation.items.map((item) => ({
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
    })),
  }) as unknown as CreateQuotationInput;

export const QuotationEditorPage = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { hasPermission } = useAuth();

  const { data: currencies } = useCurrencies();
  const { data: taxGroups } = useTaxGroups();
  const { data: units } = useUnits();
  const { data: customers } = useCustomerOptions();
  const { data: itemMaster } = useItemOptions();
  const { data: bankAccounts } = useBankAccounts();
  const { data: company } = useCompanySettings();

  const templatesQuery = useQuery({
    queryKey: templateKeys.list('QUOTATION'),
    queryFn: () => templatesApi.list('QUOTATION'),
    staleTime: 5 * 60 * 1000,
  });

  const quotationQuery = useQuery({
    queryKey: quotationKeys.detail(id ?? ''),
    queryFn: () => quotationsApi.get(id as string),
    enabled: isEdit,
  });

  const quotation = quotationQuery.data;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateQuotationInput>({
    resolver: zodResolver(createQuotationSchema),
    defaultValues: blankValues(),
  });

  const values = watch();
  const items = (values.items ?? []) as DocumentLineInput[];

  const [changeReason, setChangeReason] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [baseline, setBaseline] = useState(() => fingerprint(blankValues()));

  const dirty = fingerprint(values) !== baseline;

  /* Load once. Re-running this on every refetch would discard whatever the user
     has typed since, which is a far worse failure than a slightly stale form. */
  useEffect(() => {
    if (!isEdit || !quotation || loaded) return;
    if (customers === undefined) return;

    const loadedValues = toFormValues(
      quotation,
      customers.find((customer) => customer.id === quotation.customerId),
    );

    reset(loadedValues);
    setBaseline(fingerprint(loadedValues));
    setLoaded(true);
  }, [isEdit, quotation, customers, loaded, reset]);

  /* A new quotation starts from the company's standard wording. */
  useEffect(() => {
    if (isEdit || !company) return;
    if (company.defaultTermsQuotation) {
      setValue('terms', company.defaultTermsQuotation, { shouldDirty: false });
    }
    if (company.defaultNotes) setValue('notes', company.defaultNotes, { shouldDirty: false });
  }, [isEdit, company, setValue]);

  const selectedCustomer = customers?.find((customer) => customer.id === Number(values.customerId));
  const currency = useCurrencyFormat(values.currencyCode ?? 'INR');
  const baseCurrencyCode = company?.baseCurrencyCode ?? 'INR';
  const isForeignCurrency = (values.currencyCode ?? 'INR') !== baseCurrencyCode;

  const totals = useDocumentTotals({
    items,
    discountMode: values.discountMode ?? 'NONE',
    discountValue: String(values.discountValue ?? '0'),
    adjustment: String(values.adjustment ?? '0'),
    roundOffEnabled: values.roundOffEnabled ?? true,
    currency,
    taxGroups: taxGroups ?? [],
    exchangeRateToBase: String(values.exchangeRateToBase ?? '1'),
  });

  const words = useMemo(
    () => (Number(totals.grandTotal) > 0 ? amountInWords(totals.grandTotal, currency) : ''),
    [totals.grandTotal, currency],
  );

  /** Applying a customer's own defaults, but only when the user picks one. */
  const applyCustomerDefaults = (customerId: number) => {
    const customer = customers?.find((entry) => entry.id === customerId);
    if (!customer) return;

    setValue('currencyCode', customer.defaultCurrencyCode, { shouldDirty: true });
    setValue('placeOfSupplyStateCode', customer.placeOfSupplyStateCode, { shouldDirty: true });
    setValue('billingAddressId', defaultAddressId(customer.addresses, 'BILLING'), {
      shouldDirty: true,
    });
    setValue('shippingAddressId', defaultAddressId(customer.addresses, 'SHIPPING'), {
      shouldDirty: true,
    });
  };

  const customerField = register('customerId', {
    setValueAs: (value: unknown) => asOptionalId(value) ?? undefined,
  });

  const mutation = useMutation({
    mutationFn: (input: CreateQuotationInput) =>
      isEdit
        ? quotationsApi.update(id as string, {
            ...input,
            ...(changeReason.trim() ? { changeReason: changeReason.trim() } : {}),
          })
        : quotationsApi.create(input),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: quotationKeys.all });

      if (isEdit) {
        const savedValues = toFormValues(
          saved,
          customers?.find((customer) => customer.id === saved.customerId),
        );

        reset(savedValues);
        setBaseline(fingerprint(savedValues));
        setChangeReason('');
        toast.success(`${saved.number} saved`);
      } else {
        toast.success(`${saved.number} created as a draft`);
        navigate(`/quotations/${saved.id}`);
      }
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors();
        for (const [path, message] of Object.entries(fieldErrors)) {
          setError(path as keyof CreateQuotationInput, { message });
        }
        toast.error(error.message);
        return;
      }
      toast.error('Could not save the quotation.');
    },
  });

  const canSave = isEdit
    ? hasPermission(PERMISSIONS.QUOTATION_UPDATE)
    : hasPermission(PERMISSIONS.QUOTATION_CREATE);

  const needsReason = Boolean(quotation && requiresChangeReason(quotation.status));
  const locked = Boolean(
    quotation && (quotation.status === 'CONVERTED' || quotation.status === 'CANCELLED'),
  );

  if (isEdit && quotationQuery.isError) {
    return (
      <ErrorState
        message={
          quotationQuery.error instanceof ApiError
            ? quotationQuery.error.message
            : 'Unexpected error.'
        }
        onRetry={() => void quotationQuery.refetch()}
      />
    );
  }

  /* Until the document is in the form, showing the blank defaults would invite the
     user to type into fields that are about to be overwritten by the load. */
  if (isEdit && !loaded) {
    return (
      <>
        <PageHeader
          title="Loading quotation…"
          breadcrumbs={[{ label: 'Sales' }, { label: 'Quotations', to: '/quotations' }]}
        />
        <div className="card">
          <div className="card-body placeholder-glow">
            <span className="placeholder col-4 mb-2" />
            <span className="placeholder col-12 mb-2" />
            <span className="placeholder col-8" />
          </div>
        </div>
      </>
    );
  }

  const addresses = selectedCustomer?.addresses ?? [];
  const addressLabel = (address: CustomerAddressRecord): string =>
    [address.label, address.line1, address.city].filter(Boolean).join(' · ') ||
    `Address ${address.id}`;

  const customFields = values.customFields ?? [];

  return (
    <form
      onSubmit={handleSubmit(
        async (input) => {
          /* The API enforces this too; asking here saves a pointless round trip. */
          if (needsReason && !changeReason.trim()) {
            toast.error(
              'A reason is needed',
              'This quotation has been issued, so the change has to explain itself.',
            );
            document.getElementById('changeReason')?.focus();
            return;
          }

          await mutation.mutateAsync(input);
        },
        /* Silence on a rejected submit is the worst outcome: the button appears
           dead. Name the first field that is wrong and scroll it into view. */
        (fieldErrors) => {
          const [path, error] = Object.entries(fieldErrors)[0] ?? [];
          toast.error(
            'Check the highlighted fields',
            path
              ? `${path}: ${(error as { message?: string })?.message ?? 'not valid'}`
              : undefined,
          );
          if (path) document.getElementById(path)?.scrollIntoView({ block: 'center' });
        },
      )}
      noValidate
    >
      <PageHeader
        title={isEdit ? `Edit ${quotation?.number ?? 'quotation'}` : 'New quotation'}
        description={
          isEdit
            ? 'Saving an issued quotation records a revision — the previous version is kept.'
            : 'The number is allocated when you save; nothing is reserved until then.'
        }
        breadcrumbs={[
          { label: 'Sales' },
          { label: 'Quotations', to: '/quotations' },
          { label: isEdit ? (quotation?.number ?? 'Edit') : 'New' },
        ]}
        actions={
          <>
            <Link
              to={isEdit ? `/quotations/${id}` : '/quotations'}
              className="btn btn-sm btn-outline-secondary"
            >
              <ArrowLeft size={14} className="me-1" aria-hidden />
              Cancel
            </Link>
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              disabled={!canSave || locked || isSubmitting || mutation.isPending}
            >
              <Save size={14} className="me-1" aria-hidden />
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Save draft'}
            </button>
          </>
        }
      />

      {locked && (
        <div className="alert alert-warning py-2 small" role="alert">
          {quotation?.status === 'CONVERTED'
            ? 'This quotation has been converted to an invoice and can no longer be changed.'
            : 'This quotation is cancelled and can no longer be changed.'}
        </div>
      )}

      {needsReason && !locked && (
        <div className="card mb-3 border-warning">
          <div className="card-body py-3">
            <Field
              label="Reason for this change"
              htmlFor="changeReason"
              required
              help="Recorded in the revision history with the previous and new values."
              className="mb-0"
            >
              <input
                id="changeReason"
                className="form-control"
                placeholder="e.g. Customer asked for an extra line"
                value={changeReason}
                onChange={(event) => setChangeReason(event.target.value)}
              />
            </Field>
          </div>
        </div>
      )}

      <div className="row g-3">
        <div className="col-12 col-xxl-8">
          <div className="card mb-3">
            <div className="card-body">
              <FieldGroup title="Customer & dates">
                <div className="row">
                  <Field
                    label="Customer"
                    htmlFor="customerId"
                    required
                    error={errors.customerId}
                    className="col-md-6 mb-3"
                  >
                    <select
                      id="customerId"
                      className={selectClass(errors.customerId)}
                      aria-describedby={describedBy('customerId', errors.customerId)}
                      disabled={locked}
                      {...customerField}
                      onChange={(event) => {
                        void customerField.onChange(event);
                        if (event.target.value) applyCustomerDefaults(Number(event.target.value));
                      }}
                    >
                      <option value="">Choose a customer…</option>
                      {customers?.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                          {customer.companyName ? ` — ${customer.companyName}` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>

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
                      disabled={locked}
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
                      disabled={locked}
                      {...register('expiryDate')}
                    />
                  </Field>

                  <Field label="Reference" htmlFor="referenceNumber" className="col-md-4 mb-3">
                    <input
                      id="referenceNumber"
                      className={inputClass(errors.referenceNumber)}
                      placeholder="Customer PO or enquiry number"
                      disabled={locked}
                      {...register('referenceNumber')}
                    />
                  </Field>

                  <Field label="Subject" htmlFor="subject" className="col-md-8 mb-3">
                    <input
                      id="subject"
                      className={inputClass(errors.subject)}
                      placeholder="What this quotation is for"
                      disabled={locked}
                      {...register('subject')}
                    />
                  </Field>
                </div>
              </FieldGroup>

              <FieldGroup title="Currency, tax & addresses">
                <div className="row">
                  <Field
                    label="Currency"
                    htmlFor="currencyCode"
                    required
                    error={errors.currencyCode}
                    className="col-md-3 mb-3"
                  >
                    <select
                      id="currencyCode"
                      className={selectClass(errors.currencyCode)}
                      disabled={locked}
                      {...register('currencyCode')}
                    >
                      {currencies?.map((entry) => (
                        <option key={entry.code} value={entry.code}>
                          {entry.code} — {entry.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {isForeignCurrency && (
                    <Field
                      label={`Rate to ${baseCurrencyCode}`}
                      htmlFor="exchangeRateToBase"
                      required
                      error={errors.exchangeRateToBase}
                      help="Stored on the document; reporting never re-converts it later."
                      className="col-md-3 mb-3"
                    >
                      <input
                        id="exchangeRateToBase"
                        inputMode="decimal"
                        className={`${inputClass(errors.exchangeRateToBase)} text-numeric`}
                        disabled={locked}
                        {...register('exchangeRateToBase')}
                      />
                    </Field>
                  )}

                  <Field
                    label="Place of supply"
                    htmlFor="placeOfSupplyStateCode"
                    help="State code — decides whether tax is CGST + SGST or IGST"
                    className="col-md-3 mb-3"
                  >
                    <input
                      id="placeOfSupplyStateCode"
                      className={inputClass(errors.placeOfSupplyStateCode)}
                      placeholder="33"
                      disabled={locked}
                      {...register('placeOfSupplyStateCode')}
                    />
                  </Field>

                  <Field
                    label="Billing address"
                    htmlFor="billingAddressId"
                    className="col-md-6 mb-3"
                  >
                    <select
                      id="billingAddressId"
                      className={selectClass(errors.billingAddressId)}
                      disabled={locked || addresses.length === 0}
                      {...register('billingAddressId', { setValueAs: asOptionalId })}
                    >
                      <option value="">Customer's default</option>
                      {addresses
                        .filter((address) => address.type !== 'SHIPPING')
                        .map((address) => (
                          <option key={address.id} value={address.id}>
                            {addressLabel(address)}
                          </option>
                        ))}
                    </select>
                  </Field>

                  <Field
                    label="Shipping address"
                    htmlFor="shippingAddressId"
                    className="col-md-6 mb-3"
                  >
                    <select
                      id="shippingAddressId"
                      className={selectClass(errors.shippingAddressId)}
                      disabled={locked || addresses.length === 0}
                      {...register('shippingAddressId', { setValueAs: asOptionalId })}
                    >
                      <option value="">None</option>
                      {addresses
                        .filter((address) => address.type !== 'BILLING')
                        .map((address) => (
                          <option key={address.id} value={address.id}>
                            {addressLabel(address)}
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>
              </FieldGroup>
            </div>
          </div>

          <div className="mb-3">
            <ItemsGrid
              items={items}
              onChange={(next) => setValue('items', next, { shouldDirty: true })}
              currency={currency}
              totals={totals}
              itemMaster={itemMaster ?? []}
              taxGroups={taxGroups ?? []}
              units={units ?? []}
              disabled={locked}
            />
            {errors.items && (
              <div className="invalid-feedback d-block">
                {errors.items.message ?? 'Check the item lines.'}
              </div>
            )}
          </div>

          <div className="card mb-3">
            <div className="card-body">
              <FieldGroup title="Notes & terms">
                <div className="row">
                  <Field
                    label="Message to the customer"
                    htmlFor="customerMessage"
                    className="col-12 mb-3"
                  >
                    <textarea
                      id="customerMessage"
                      rows={2}
                      className={inputClass(errors.customerMessage)}
                      disabled={locked}
                      {...register('customerMessage')}
                    />
                  </Field>

                  <Field label="Terms & conditions" htmlFor="terms" className="col-md-6 mb-3">
                    <textarea
                      id="terms"
                      rows={5}
                      className={inputClass(errors.terms)}
                      disabled={locked}
                      {...register('terms')}
                    />
                  </Field>

                  <Field label="Notes" htmlFor="notes" className="col-md-6 mb-3">
                    <textarea
                      id="notes"
                      rows={5}
                      className={inputClass(errors.notes)}
                      disabled={locked}
                      {...register('notes')}
                    />
                  </Field>
                </div>
              </FieldGroup>

              <FieldGroup title="Bank details">
                <div className="row align-items-end">
                  <Field label="Bank account" htmlFor="bankAccountId" className="col-md-6 mb-3">
                    <select
                      id="bankAccountId"
                      className={selectClass(errors.bankAccountId)}
                      disabled={locked}
                      {...register('bankAccountId', { setValueAs: asOptionalId })}
                    >
                      <option value="">None</option>
                      {bankAccounts
                        ?.filter((account) => account.status === 'ACTIVE')
                        .map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.bankName} — {account.accountNumber}
                          </option>
                        ))}
                    </select>
                  </Field>

                  <div className="col-md-6 mb-3">
                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="showBankDetails"
                        disabled={locked}
                        {...register('showBankDetails')}
                      />
                      <label className="form-check-label" htmlFor="showBankDetails">
                        Print the bank details on this quotation
                      </label>
                    </div>
                  </div>

                  <Field
                    label="Payment instructions"
                    htmlFor="paymentInstructions"
                    className="col-12 mb-0"
                  >
                    <textarea
                      id="paymentInstructions"
                      rows={2}
                      className={inputClass(errors.paymentInstructions)}
                      disabled={locked}
                      {...register('paymentInstructions')}
                    />
                  </Field>
                </div>
              </FieldGroup>

              <FieldGroup title="Template & extra fields">
                <div className="row">
                  <Field label="Template" htmlFor="templateId" className="col-md-6 mb-3">
                    <select
                      id="templateId"
                      className={selectClass(errors.templateId)}
                      disabled={locked}
                      {...register('templateId', { setValueAs: asOptionalId })}
                    >
                      <option value="">Company default</option>
                      {templatesQuery.data
                        ?.filter((template) => template.currentVersion !== null)
                        .map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                            {template.isDefault ? ' (default)' : ''}
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>

                {customFields.map((field, index) => (
                  <div className="row g-2 mb-2" key={index}>
                    <div className="col-md-4">
                      <input
                        className="form-control form-control-sm"
                        aria-label={`Extra field ${index + 1} label`}
                        placeholder="Label"
                        disabled={locked}
                        value={field.label}
                        onChange={(event) =>
                          setValue(
                            'customFields',
                            customFields.map((entry, position) =>
                              position === index ? { ...entry, label: event.target.value } : entry,
                            ),
                            { shouldDirty: true },
                          )
                        }
                      />
                    </div>
                    <div className="col-md-7">
                      <input
                        className="form-control form-control-sm"
                        aria-label={`Extra field ${index + 1} value`}
                        placeholder="Value"
                        disabled={locked}
                        value={field.value}
                        onChange={(event) =>
                          setValue(
                            'customFields',
                            customFields.map((entry, position) =>
                              position === index ? { ...entry, value: event.target.value } : entry,
                            ),
                            { shouldDirty: true },
                          )
                        }
                      />
                    </div>
                    <div className="col-md-1">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={locked}
                        onClick={() =>
                          setValue(
                            'customFields',
                            customFields.filter((_, position) => position !== index),
                            { shouldDirty: true },
                          )
                        }
                      >
                        <Trash2 size={13} aria-hidden />
                        <span className="visually-hidden">Remove extra field {index + 1}</span>
                      </button>
                    </div>
                  </div>
                ))}

                {customFields.length < 10 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={locked}
                    onClick={() =>
                      setValue('customFields', [...customFields, { label: '', value: '' }], {
                        shouldDirty: true,
                      })
                    }
                  >
                    <Plus size={13} className="me-1" aria-hidden />
                    Add a field
                  </button>
                )}
              </FieldGroup>
            </div>
          </div>
        </div>

        <div className="col-12 col-xxl-4">
          <div className="mb-3">
            <TotalsPanel
              totals={totals}
              currency={currency}
              discountMode={values.discountMode ?? 'NONE'}
              discountValue={String(values.discountValue ?? '0')}
              adjustment={String(values.adjustment ?? '0')}
              roundOffEnabled={values.roundOffEnabled ?? true}
              amountInWords={words}
              disabled={locked}
              onChange={(patch) => {
                if (patch.discountMode !== undefined)
                  setValue('discountMode', patch.discountMode, { shouldDirty: true });
                if (patch.discountValue !== undefined)
                  setValue('discountValue', patch.discountValue, { shouldDirty: true });
                if (patch.adjustment !== undefined)
                  setValue('adjustment', patch.adjustment, { shouldDirty: true });
                if (patch.roundOffEnabled !== undefined)
                  setValue('roundOffEnabled', patch.roundOffEnabled, { shouldDirty: true });
              }}
            />
          </div>

          <DocumentPreviewCard
            cacheKey={[...quotationKeys.detail(id ?? 'new'), 'preview']}
            fetchHtml={() => quotationsApi.previewHtml(id as string)}
            enabled={isEdit}
            placeholder="Save the draft and the rendered document appears here."
          />
        </div>
      </div>

      {dirty && !locked && (
        <div className="position-sticky bottom-0 bg-white border-top py-2 px-3 mt-3 d-flex justify-content-between align-items-center">
          <span className="small text-secondary">
            {isEdit ? 'Unsaved changes' : 'Not saved yet'}
          </span>
          <button
            type="submit"
            className="btn btn-sm btn-primary"
            disabled={!canSave || isSubmitting || mutation.isPending}
          >
            <Save size={14} className="me-1" aria-hidden />
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Save draft'}
          </button>
        </div>
      )}
    </form>
  );
};

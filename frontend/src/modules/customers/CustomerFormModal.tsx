import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TAX_TREATMENTS,
  TAX_TREATMENT_LABELS,
  createCustomerSchema,
  type CreateCustomerInput,
  type CustomerAddressInput,
  type CustomerRecord,
} from '@app/shared';
import { Field, FieldGroup, describedBy, inputClass, selectClass } from '@/components/form';
import { useToast } from '@/components/Toast';
import { ApiError } from '@/services/api-client';
import { customerKeys, customersApi } from '@/services/business-api';
import { useCurrencies } from '@/hooks/useMasters';

/**
 * The one address this form edits.
 *
 * `type` and `isDefault` are constants of the "Billing address" fieldset rather
 * than anything the user chooses, so they live in the form's own state. They must
 * not be smuggled in through hidden inputs: a hidden input hands back the *string*
 * `"true"`, which `z.boolean()` rejects — and since neither field has a visible
 * error slot, the rejection would leave the Create button looking dead.
 */
const emptyAddress = (): CustomerAddressInput => ({
  type: 'BILLING',
  label: null,
  line1: null,
  line2: null,
  city: null,
  state: null,
  stateCode: null,
  country: 'India',
  postalCode: null,
  isDefault: true,
});

/** True when nothing was actually entered, so no empty address row is stored. */
const isBlankAddress = (address: CustomerAddressInput | undefined): boolean =>
  !address ||
  !(
    address.line1 ||
    address.line2 ||
    address.city ||
    address.state ||
    address.stateCode ||
    address.postalCode
  );

const emptyValues: CreateCustomerInput = {
  customerCode: null,
  name: '',
  companyName: null,
  contactPerson: null,
  email: null,
  phone: null,
  altPhone: null,
  gstin: null,
  pan: null,
  otherTaxId: null,
  taxTreatment: 'REGISTERED',
  placeOfSupplyStateCode: null,
  defaultCurrencyCode: 'INR',
  paymentTermsDays: 30,
  notes: null,
  addresses: [emptyAddress()],
  contacts: [],
};

/**
 * Create and edit a customer.
 *
 * One billing and one shipping address are captured here; the customer detail page
 * handles additional addresses and contacts. The customer code is left to the
 * server unless deliberately overridden.
 */
export const CustomerFormModal = ({
  open,
  customer,
  onClose,
}: {
  open: boolean;
  customer: CustomerRecord | null;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: currencies } = useCurrencies();
  const isEdit = customer !== null;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: emptyValues,
  });

  const taxTreatment = watch('taxTreatment');

  useEffect(() => {
    if (!open) return;

    if (!customer) {
      reset(emptyValues);
      return;
    }

    /* The fieldset below always edits index 0 and calls itself "Billing address",
       so put the billing one there. Any others ride along untouched — an update
       replaces the whole set, so they have to be sent back. */
    const saved = customer.addresses.map(({ id: _id, ...rest }) => rest);
    const billingFirst = [
      ...saved.filter((address) => address.type === 'BILLING'),
      ...saved.filter((address) => address.type !== 'BILLING'),
    ];

    reset({
      ...customer,
      addresses: billingFirst.length > 0 ? billingFirst : [emptyAddress()],
      contacts: customer.contacts.map(({ id: _id, ...rest }) => rest),
    } as unknown as CreateCustomerInput);
  }, [open, customer, reset]);

  const mutation = useMutation({
    mutationFn: (values: CreateCustomerInput) =>
      isEdit ? customersApi.update(customer.id, values) : customersApi.create(values),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: customerKeys.all });
      toast.success(isEdit ? 'Customer updated' : `Customer ${saved.customerCode} created`);
      onClose();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors();
        for (const [path, message] of Object.entries(fieldErrors)) {
          setError(path as keyof CreateCustomerInput, { message });
        }
        if (Object.keys(fieldErrors).length === 0) toast.error(error.message);
        return;
      }
      toast.error('Could not save the customer.');
    },
  });

  if (!open) return null;

  return (
    <>
      <div className="modal fade show d-block" role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content">
            <form
              onSubmit={handleSubmit(
                (values) => {
                  /* An address nobody filled in is not an address. */
                  const [first, ...rest] = values.addresses;
                  return mutation.mutateAsync({
                    ...values,
                    addresses: isBlankAddress(first) ? rest : values.addresses,
                  });
                },
                /* Silence on a rejected submit is the worst outcome: the button
                   appears dead. Name the first field that is wrong. */
                (fieldErrors) => {
                  const [path, error] = Object.entries(fieldErrors)[0] ?? [];
                  toast.error(
                    'Check the highlighted fields',
                    path
                      ? `${path}: ${(error as { message?: string })?.message ?? 'not valid'}`
                      : undefined,
                  );
                  if (path) document.getElementById(path)?.focus();
                },
              )}
              noValidate
            >
              <div className="modal-header">
                <h2 className="modal-title h6">{isEdit ? 'Edit customer' : 'New customer'}</h2>
                <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
              </div>

              <div className="modal-body">
                <FieldGroup title="Basic details">
                  <div className="row">
                    <Field
                      label="Customer name"
                      htmlFor="name"
                      required
                      error={errors.name}
                      className="col-md-6 mb-3"
                    >
                      <input
                        id="name"
                        autoFocus
                        className={inputClass(errors.name)}
                        aria-describedby={describedBy('name', errors.name)}
                        {...register('name')}
                      />
                    </Field>

                    <Field label="Company name" htmlFor="companyName" className="col-md-6 mb-3">
                      <input
                        id="companyName"
                        className={inputClass(errors.companyName)}
                        {...register('companyName')}
                      />
                    </Field>

                    <Field
                      label="Customer code"
                      htmlFor="customerCode"
                      help="Leave blank and the next code is allocated automatically"
                      className="col-md-3 mb-3"
                    >
                      <input
                        id="customerCode"
                        className={inputClass(errors.customerCode)}
                        placeholder="CUST-0001"
                        {...register('customerCode')}
                      />
                    </Field>

                    <Field label="Contact person" htmlFor="contactPerson" className="col-md-3 mb-3">
                      <input
                        id="contactPerson"
                        className={inputClass(errors.contactPerson)}
                        {...register('contactPerson')}
                      />
                    </Field>

                    <Field
                      label="Email"
                      htmlFor="customerEmail"
                      error={errors.email}
                      className="col-md-3 mb-3"
                    >
                      <input
                        id="customerEmail"
                        type="email"
                        className={inputClass(errors.email)}
                        {...register('email')}
                      />
                    </Field>

                    <Field label="Phone" htmlFor="phone" className="col-md-3 mb-3">
                      <input
                        id="phone"
                        className={inputClass(errors.phone)}
                        {...register('phone')}
                      />
                    </Field>
                  </div>
                </FieldGroup>

                <FieldGroup title="Tax">
                  <div className="row">
                    <Field
                      label="Tax treatment"
                      htmlFor="taxTreatment"
                      required
                      className="col-md-3 mb-3"
                    >
                      <select
                        id="taxTreatment"
                        className={selectClass(errors.taxTreatment)}
                        {...register('taxTreatment')}
                      >
                        {TAX_TREATMENTS.map((treatment) => (
                          <option key={treatment} value={treatment}>
                            {TAX_TREATMENT_LABELS[treatment]}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label="GSTIN"
                      htmlFor="customerGstin"
                      required={taxTreatment === 'REGISTERED'}
                      error={errors.gstin}
                      help="15 characters"
                      className="col-md-3 mb-3"
                    >
                      <input
                        id="customerGstin"
                        className={inputClass(errors.gstin)}
                        aria-describedby={describedBy('customerGstin', errors.gstin, 'help')}
                        {...register('gstin')}
                      />
                    </Field>

                    <Field
                      label="PAN"
                      htmlFor="customerPan"
                      error={errors.pan}
                      className="col-md-3 mb-3"
                    >
                      <input
                        id="customerPan"
                        className={inputClass(errors.pan)}
                        {...register('pan')}
                      />
                    </Field>

                    <Field
                      label="Place of supply (state code)"
                      htmlFor="placeOfSupplyStateCode"
                      help="Decides CGST+SGST versus IGST"
                      className="col-md-3 mb-3"
                    >
                      <input
                        id="placeOfSupplyStateCode"
                        className={inputClass(errors.placeOfSupplyStateCode)}
                        {...register('placeOfSupplyStateCode')}
                      />
                    </Field>
                  </div>
                </FieldGroup>

                <FieldGroup title="Billing">
                  <div className="row">
                    <Field
                      label="Default currency"
                      htmlFor="defaultCurrencyCode"
                      required
                      className="col-md-3 mb-3"
                    >
                      <select
                        id="defaultCurrencyCode"
                        className={selectClass(errors.defaultCurrencyCode)}
                        {...register('defaultCurrencyCode')}
                      >
                        {(currencies ?? []).map((currency) => (
                          <option key={currency.code} value={currency.code}>
                            {currency.code} — {currency.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label="Payment terms (days)"
                      htmlFor="paymentTermsDays"
                      required
                      error={errors.paymentTermsDays}
                      help="Sets the due date on new invoices"
                      className="col-md-3 mb-3"
                    >
                      <input
                        id="paymentTermsDays"
                        type="number"
                        min={0}
                        max={365}
                        className={inputClass(errors.paymentTermsDays)}
                        {...register('paymentTermsDays', { valueAsNumber: true })}
                      />
                    </Field>

                    <Field label="Notes" htmlFor="notes" className="col-md-6 mb-3">
                      <textarea
                        id="notes"
                        rows={1}
                        className={inputClass(errors.notes)}
                        {...register('notes')}
                      />
                    </Field>
                  </div>
                </FieldGroup>

                <FieldGroup title="Billing address">
                  <div className="row">
                    <Field label="Address line 1" htmlFor="addr1" className="col-md-6 mb-3">
                      <input
                        id="addr1"
                        className="form-control"
                        {...register('addresses.0.line1')}
                      />
                    </Field>
                    <Field label="Address line 2" htmlFor="addr2" className="col-md-6 mb-3">
                      <input
                        id="addr2"
                        className="form-control"
                        {...register('addresses.0.line2')}
                      />
                    </Field>
                    <Field label="City" htmlFor="addrCity" className="col-md-3 mb-3">
                      <input
                        id="addrCity"
                        className="form-control"
                        {...register('addresses.0.city')}
                      />
                    </Field>
                    <Field label="State" htmlFor="addrState" className="col-md-3 mb-3">
                      <input
                        id="addrState"
                        className="form-control"
                        {...register('addresses.0.state')}
                      />
                    </Field>
                    <Field label="State code" htmlFor="addrStateCode" className="col-md-2 mb-3">
                      <input
                        id="addrStateCode"
                        className="form-control"
                        {...register('addresses.0.stateCode')}
                      />
                    </Field>
                    <Field label="PIN / ZIP" htmlFor="addrPostal" className="col-md-2 mb-3">
                      <input
                        id="addrPostal"
                        className="form-control"
                        {...register('addresses.0.postalCode')}
                      />
                    </Field>
                    <Field label="Country" htmlFor="addrCountry" className="col-md-2 mb-3">
                      <input
                        id="addrCountry"
                        className="form-control"
                        {...register('addresses.0.country')}
                      />
                    </Field>
                  </div>
                </FieldGroup>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-sm btn-light" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-sm btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>
  );
};

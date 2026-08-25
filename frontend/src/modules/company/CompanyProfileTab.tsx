import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import {
  updateCompanySchema,
  type CompanySettingsRecord,
  type UpdateCompanyInput,
} from '@app/shared';
import { Field, FieldGroup, describedBy, inputClass, selectClass } from '@/components/form';
import { useToast } from '@/components/Toast';
import { ApiError } from '@/services/api-client';
import { companyApi, companyKeys } from '@/services/masters-api';
import { useCurrencies } from '@/hooks/useMasters';

/**
 * Company identity and tax registration.
 *
 * The state code matters more than it looks: together with the customer's place
 * of supply it decides whether a document carries CGST+SGST or IGST.
 */
export const CompanyProfileTab = ({
  company,
  canEdit,
}: {
  company: CompanySettingsRecord;
  canEdit: boolean;
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: currencies } = useCurrencies();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<UpdateCompanyInput>({
    resolver: zodResolver(updateCompanySchema),
    defaultValues: company as UpdateCompanyInput,
  });

  useEffect(() => reset(company as UpdateCompanyInput), [company, reset]);

  const mutation = useMutation({
    mutationFn: (values: UpdateCompanyInput) => companyApi.update(values),
    onSuccess: (updated) => {
      queryClient.setQueryData(companyKeys.settings(), updated);
      toast.success('Company details saved');
      reset(updated as UpdateCompanyInput);
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors();
        for (const [path, message] of Object.entries(fieldErrors)) {
          setError(path as keyof UpdateCompanyInput, { message });
        }
        if (Object.keys(fieldErrors).length === 0) toast.error(error.message);
        return;
      }
      toast.error('Could not save the company details.');
    },
  });

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutateAsync(values))} noValidate>
      <div className="card">
        <div className="card-body">
          <FieldGroup title="Identity">
            <div className="row">
              <Field
                label="Company name"
                htmlFor="companyName"
                required
                error={errors.companyName}
                className="col-md-6 mb-3"
              >
                <input
                  id="companyName"
                  disabled={!canEdit}
                  className={inputClass(errors.companyName)}
                  aria-describedby={describedBy('companyName', errors.companyName)}
                  {...register('companyName')}
                />
              </Field>

              <Field label="Legal name" htmlFor="legalName" className="col-md-6 mb-3">
                <input
                  id="legalName"
                  disabled={!canEdit}
                  className={inputClass(errors.legalName)}
                  help-text="As registered"
                  {...register('legalName')}
                />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup title="Registered address">
            <div className="row">
              <Field label="Address line 1" htmlFor="addressLine1" className="col-md-6 mb-3">
                <input
                  id="addressLine1"
                  disabled={!canEdit}
                  className={inputClass(errors.addressLine1)}
                  {...register('addressLine1')}
                />
              </Field>
              <Field label="Address line 2" htmlFor="addressLine2" className="col-md-6 mb-3">
                <input
                  id="addressLine2"
                  disabled={!canEdit}
                  className={inputClass(errors.addressLine2)}
                  {...register('addressLine2')}
                />
              </Field>
              <Field label="City" htmlFor="city" className="col-md-3 mb-3">
                <input
                  id="city"
                  disabled={!canEdit}
                  className={inputClass(errors.city)}
                  {...register('city')}
                />
              </Field>
              <Field label="State" htmlFor="state" className="col-md-3 mb-3">
                <input
                  id="state"
                  disabled={!canEdit}
                  className={inputClass(errors.state)}
                  {...register('state')}
                />
              </Field>
              <Field
                label="GST state code"
                htmlFor="stateCode"
                error={errors.stateCode}
                help="Two digits, e.g. 29 for Karnataka. Decides CGST+SGST versus IGST."
                className="col-md-2 mb-3"
              >
                <input
                  id="stateCode"
                  disabled={!canEdit}
                  className={inputClass(errors.stateCode)}
                  aria-describedby={describedBy('stateCode', errors.stateCode, 'help')}
                  {...register('stateCode')}
                />
              </Field>
              <Field label="PIN / ZIP" htmlFor="postalCode" className="col-md-2 mb-3">
                <input
                  id="postalCode"
                  disabled={!canEdit}
                  className={inputClass(errors.postalCode)}
                  {...register('postalCode')}
                />
              </Field>
              <Field label="Country" htmlFor="country" className="col-md-2 mb-3">
                <input
                  id="country"
                  disabled={!canEdit}
                  className={inputClass(errors.country)}
                  {...register('country')}
                />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup title="Contact">
            <div className="row">
              <Field label="Phone" htmlFor="phone" className="col-md-4 mb-3">
                <input
                  id="phone"
                  disabled={!canEdit}
                  className={inputClass(errors.phone)}
                  {...register('phone')}
                />
              </Field>
              <Field label="Email" htmlFor="email" error={errors.email} className="col-md-4 mb-3">
                <input
                  id="email"
                  type="email"
                  disabled={!canEdit}
                  className={inputClass(errors.email)}
                  aria-describedby={describedBy('email', errors.email)}
                  {...register('email')}
                />
              </Field>
              <Field label="Website" htmlFor="website" className="col-md-4 mb-3">
                <input
                  id="website"
                  disabled={!canEdit}
                  className={inputClass(errors.website)}
                  {...register('website')}
                />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup title="Tax registration">
            <div className="row">
              <Field
                label="GSTIN"
                htmlFor="gstin"
                error={errors.gstin}
                help="15 characters, e.g. 29AABCU9603R1ZM"
                className="col-md-4 mb-3"
              >
                <input
                  id="gstin"
                  disabled={!canEdit}
                  className={inputClass(errors.gstin)}
                  aria-describedby={describedBy('gstin', errors.gstin, 'help')}
                  {...register('gstin')}
                />
              </Field>
              <Field label="PAN" htmlFor="pan" error={errors.pan} className="col-md-4 mb-3">
                <input
                  id="pan"
                  disabled={!canEdit}
                  className={inputClass(errors.pan)}
                  aria-describedby={describedBy('pan', errors.pan)}
                  {...register('pan')}
                />
              </Field>
              <Field label="CIN" htmlFor="cin" className="col-md-4 mb-3">
                <input
                  id="cin"
                  disabled={!canEdit}
                  className={inputClass(errors.cin)}
                  {...register('cin')}
                />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup title="Financial defaults">
            <div className="row">
              <Field
                label="Base currency"
                htmlFor="baseCurrencyCode"
                required
                error={errors.baseCurrencyCode}
                help="Used for consolidated reporting. Locked once documents exist."
                className="col-md-4 mb-3"
              >
                <select
                  id="baseCurrencyCode"
                  disabled={!canEdit}
                  className={selectClass(errors.baseCurrencyCode)}
                  {...register('baseCurrencyCode')}
                >
                  {(currencies ?? []).map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} — {currency.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Financial year starts in"
                htmlFor="financialYearStartMonth"
                required
                className="col-md-4 mb-3"
                help="April for India"
              >
                <select
                  id="financialYearStartMonth"
                  disabled={!canEdit}
                  className={selectClass(errors.financialYearStartMonth)}
                  {...register('financialYearStartMonth', { valueAsNumber: true })}
                >
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {new Date(Date.UTC(2026, index, 1)).toLocaleString(undefined, {
                        month: 'long',
                      })}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup title="Document defaults">
            <Field
              label="Default invoice terms"
              htmlFor="defaultTermsInvoice"
              help="Pre-filled on every new invoice; still editable per document."
            >
              <textarea
                id="defaultTermsInvoice"
                rows={3}
                disabled={!canEdit}
                className={inputClass(errors.defaultTermsInvoice)}
                {...register('defaultTermsInvoice')}
              />
            </Field>
            <Field label="Default quotation terms" htmlFor="defaultTermsQuotation">
              <textarea
                id="defaultTermsQuotation"
                rows={3}
                disabled={!canEdit}
                className={inputClass(errors.defaultTermsQuotation)}
                {...register('defaultTermsQuotation')}
              />
            </Field>
            <Field label="Default notes" htmlFor="defaultNotes" className="mb-0">
              <textarea
                id="defaultNotes"
                rows={2}
                disabled={!canEdit}
                className={inputClass(errors.defaultNotes)}
                {...register('defaultNotes')}
              />
            </Field>
          </FieldGroup>
        </div>

        {canEdit && (
          <div className="card-footer bg-white d-flex justify-content-end gap-2">
            <button
              type="button"
              className="btn btn-sm btn-light"
              disabled={!isDirty || isSubmitting}
              onClick={() => reset(company as UpdateCompanyInput)}
            >
              Discard changes
            </button>
            <button type="submit" className="btn btn-sm btn-primary" disabled={isSubmitting}>
              <Save size={15} className="me-1" aria-hidden />
              {isSubmitting ? 'Saving…' : 'Save details'}
            </button>
          </div>
        )}
      </div>
    </form>
  );
};

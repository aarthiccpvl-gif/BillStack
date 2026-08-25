import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Plus, Star } from 'lucide-react';
import { bankAccountSchema, type BankAccountInput, type BankAccountRecord } from '@app/shared';
import { DataTable, type Column } from '@/components/DataTable';
import { Field, inputClass, selectClass } from '@/components/form';
import { useToast } from '@/components/Toast';
import { ApiError } from '@/services/api-client';
import { companyApi, companyKeys } from '@/services/masters-api';
import { useCurrencies } from '@/hooks/useMasters';

/**
 * Bank accounts.
 *
 * More than one, because a USD invoice usually needs to print a different account
 * than an INR one. Exactly one is the default, and an account can be archived but
 * never deleted — a document may already have printed it.
 */
export const BankAccountsTab = ({ canEdit }: { canEdit: boolean }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: currencies } = useCurrencies();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccountRecord | null>(null);

  const accountsQuery = useQuery({
    queryKey: companyKeys.bankAccounts(),
    queryFn: () => companyApi.listBankAccounts(),
  });

  const form = useForm<BankAccountInput>({
    resolver: zodResolver(bankAccountSchema),
    defaultValues: { isDefault: false },
  });

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    form.reset({ isDefault: false });
  };

  const saveMutation = useMutation({
    mutationFn: (values: BankAccountInput) =>
      editing
        ? companyApi.updateBankAccount(editing.id, values)
        : companyApi.createBankAccount(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: companyKeys.bankAccounts() });
      toast.success(editing ? 'Bank account updated' : 'Bank account added');
      closeForm();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors();
        for (const [path, message] of Object.entries(fieldErrors)) {
          form.setError(path as keyof BankAccountInput, { message });
        }
        if (Object.keys(fieldErrors).length === 0) toast.error(error.message);
        return;
      }
      toast.error('Could not save the bank account.');
    },
  });

  const defaultMutation = useMutation({
    mutationFn: (id: number) => companyApi.updateBankAccount(id, { isDefault: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: companyKeys.bankAccounts() });
      toast.success('Default account changed');
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not change the default.'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => companyApi.archiveBankAccount(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: companyKeys.bankAccounts() });
      toast.success('Bank account archived');
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not archive the account.'),
  });

  const columns: Column<BankAccountRecord>[] = [
    {
      key: 'bankName',
      header: 'Bank',
      render: (account) => (
        <>
          <span className="fw-medium">{account.bankName}</span>
          {account.isDefault && <span className="badge text-bg-success ms-2">Default</span>}
          {account.branch && <div className="small text-secondary">{account.branch}</div>}
        </>
      ),
    },
    { key: 'accountName', header: 'Account name', render: (account) => account.accountName },
    {
      key: 'accountNumber',
      header: 'Account number',
      render: (account) => <span className="text-mono">{account.accountNumber}</span>,
    },
    {
      key: 'ifsc',
      header: 'IFSC / SWIFT',
      render: (account) => (
        <span className="text-mono small">
          {[account.ifsc, account.swift].filter(Boolean).join(' · ') || '—'}
        </span>
      ),
    },
    {
      key: 'currencyCode',
      header: 'Currency',
      render: (account) => account.currencyCode ?? <span className="text-secondary">Any</span>,
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: 'Actions',
            render: (account: BankAccountRecord) => (
              <div className="btn-group btn-group-sm">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setEditing(account);
                    form.reset(account as unknown as BankAccountInput);
                    setFormOpen(true);
                  }}
                >
                  Edit
                </button>
                {!account.isDefault && (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      title="Make default"
                      disabled={defaultMutation.isPending}
                      onClick={() => defaultMutation.mutate(account.id)}
                    >
                      <Star size={14} aria-hidden />
                      <span className="visually-hidden">Make {account.bankName} the default</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      title="Archive"
                      disabled={archiveMutation.isPending}
                      onClick={() => archiveMutation.mutate(account.id)}
                    >
                      <Archive size={14} aria-hidden />
                      <span className="visually-hidden">Archive {account.bankName}</span>
                    </button>
                  </>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <div className="card">
        <div className="card-header bg-white d-flex justify-content-between align-items-center">
          <span className="label-caps">Bank accounts</span>
          {canEdit && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                setEditing(null);
                form.reset({ isDefault: false });
                setFormOpen(true);
              }}
            >
              <Plus size={15} className="me-1" aria-hidden />
              Add account
            </button>
          )}
        </div>

        <DataTable
          columns={columns}
          rows={accountsQuery.data ?? []}
          rowKey={(account) => account.id}
          isLoading={accountsQuery.isLoading}
          error={
            accountsQuery.isError
              ? accountsQuery.error instanceof ApiError
                ? accountsQuery.error.message
                : 'Unexpected error.'
              : null
          }
          onRetry={() => void accountsQuery.refetch()}
          emptyTitle="No bank accounts yet"
          emptyDescription="Documents can print payment details once an account is added."
        />
      </div>

      {formOpen && (
        <>
          <div className="modal fade show d-block" role="dialog" aria-modal="true" tabIndex={-1}>
            <div className="modal-dialog modal-lg modal-dialog-centered">
              <div className="modal-content">
                <form
                  onSubmit={form.handleSubmit((values) => saveMutation.mutateAsync(values))}
                  noValidate
                >
                  <div className="modal-header">
                    <h2 className="modal-title h6">
                      {editing ? 'Edit bank account' : 'Add bank account'}
                    </h2>
                    <button
                      type="button"
                      className="btn-close"
                      aria-label="Close"
                      onClick={closeForm}
                    />
                  </div>

                  <div className="modal-body">
                    <div className="row">
                      <Field
                        label="Bank name"
                        htmlFor="bankName"
                        required
                        error={form.formState.errors.bankName}
                        className="col-md-6 mb-3"
                      >
                        <input
                          id="bankName"
                          className={inputClass(form.formState.errors.bankName)}
                          {...form.register('bankName')}
                        />
                      </Field>

                      <Field
                        label="Account name"
                        htmlFor="accountName"
                        required
                        error={form.formState.errors.accountName}
                        className="col-md-6 mb-3"
                      >
                        <input
                          id="accountName"
                          className={inputClass(form.formState.errors.accountName)}
                          {...form.register('accountName')}
                        />
                      </Field>

                      <Field
                        label="Account number"
                        htmlFor="accountNumber"
                        required
                        error={form.formState.errors.accountNumber}
                        className="col-md-6 mb-3"
                      >
                        <input
                          id="accountNumber"
                          className={inputClass(form.formState.errors.accountNumber)}
                          {...form.register('accountNumber')}
                        />
                      </Field>

                      <Field
                        label="IFSC"
                        htmlFor="ifsc"
                        error={form.formState.errors.ifsc}
                        className="col-md-3 mb-3"
                      >
                        <input
                          id="ifsc"
                          className={inputClass(form.formState.errors.ifsc)}
                          {...form.register('ifsc')}
                        />
                      </Field>

                      <Field label="SWIFT" htmlFor="swift" className="col-md-3 mb-3">
                        <input
                          id="swift"
                          className={inputClass(form.formState.errors.swift)}
                          {...form.register('swift')}
                        />
                      </Field>

                      <Field label="Branch" htmlFor="branch" className="col-md-6 mb-3">
                        <input
                          id="branch"
                          className={inputClass(form.formState.errors.branch)}
                          {...form.register('branch')}
                        />
                      </Field>

                      <Field
                        label="Only for currency"
                        htmlFor="currencyCode"
                        help="Leave blank to offer this account for any currency"
                        className="col-md-6 mb-3"
                      >
                        <select
                          id="currencyCode"
                          className={selectClass(form.formState.errors.currencyCode)}
                          {...form.register('currencyCode')}
                        >
                          <option value="">Any currency</option>
                          {(currencies ?? []).map((currency) => (
                            <option key={currency.code} value={currency.code}>
                              {currency.code} — {currency.name}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field
                        label="Payment instructions"
                        htmlFor="paymentInstructions"
                        help="Printed under the bank details, e.g. quote the invoice number"
                        className="col-12 mb-3"
                      >
                        <textarea
                          id="paymentInstructions"
                          rows={2}
                          className={inputClass(form.formState.errors.paymentInstructions)}
                          {...form.register('paymentInstructions')}
                        />
                      </Field>

                      <div className="col-12">
                        <div className="form-check">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            id="isDefault"
                            {...form.register('isDefault')}
                          />
                          <label className="form-check-label" htmlFor="isDefault">
                            Use as the default account on new documents
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="modal-footer">
                    <button type="button" className="btn btn-sm btn-light" onClick={closeForm}>
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-sm btn-primary"
                      disabled={saveMutation.isPending}
                    >
                      {saveMutation.isPending
                        ? 'Saving…'
                        : editing
                          ? 'Save changes'
                          : 'Add account'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" />
        </>
      )}
    </>
  );
};

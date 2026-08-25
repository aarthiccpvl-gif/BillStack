import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  createItemSchema,
  type CreateItemInput,
  type ItemRecord,
} from '@app/shared';
import { Field, describedBy, inputClass, selectClass } from '@/components/form';
import { useToast } from '@/components/Toast';
import { ApiError } from '@/services/api-client';
import { itemKeys, itemsApi } from '@/services/business-api';
import { useCurrencies, useItemCategories, useTaxGroups, useUnits } from '@/hooks/useMasters';

const emptyValues: CreateItemInput = {
  itemCode: null,
  name: '',
  description: null,
  type: 'SERVICE',
  unitId: null,
  defaultRate: '0',
  currencyCode: 'INR',
  defaultTaxGroupId: null,
  hsnSacCode: null,
  categoryId: null,
};

export const ItemFormModal = ({
  open,
  item,
  onClose,
}: {
  open: boolean;
  item: ItemRecord | null;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: currencies } = useCurrencies();
  const { data: units } = useUnits();
  const { data: taxGroups } = useTaxGroups();
  const { data: categories } = useItemCategories();
  const isEdit = item !== null;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateItemInput>({
    resolver: zodResolver(createItemSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!open) return;
    reset(item ? ({ ...item } as unknown as CreateItemInput) : emptyValues);
  }, [open, item, reset]);

  const mutation = useMutation({
    mutationFn: (values: CreateItemInput) =>
      isEdit ? itemsApi.update(item.id, values) : itemsApi.create(values),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: itemKeys.all });
      toast.success(isEdit ? 'Item updated' : `Item ${saved.itemCode} created`);
      onClose();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors();
        for (const [path, message] of Object.entries(fieldErrors)) {
          setError(path as keyof CreateItemInput, { message });
        }
        if (Object.keys(fieldErrors).length === 0) toast.error(error.message);
        return;
      }
      toast.error('Could not save the item.');
    },
  });

  if (!open) return null;

  return (
    <>
      <div className="modal fade show d-block" role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-dialog modal-lg modal-dialog-centered">
          <div className="modal-content">
            <form onSubmit={handleSubmit((values) => mutation.mutateAsync(values))} noValidate>
              <div className="modal-header">
                <h2 className="modal-title h6">
                  {isEdit ? 'Edit item' : 'New product or service'}
                </h2>
                <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
              </div>

              <div className="modal-body">
                <div className="row">
                  <Field
                    label="Name"
                    htmlFor="itemName"
                    required
                    error={errors.name}
                    className="col-md-8 mb-3"
                  >
                    <input
                      id="itemName"
                      autoFocus
                      className={inputClass(errors.name)}
                      aria-describedby={describedBy('itemName', errors.name)}
                      {...register('name')}
                    />
                  </Field>

                  <Field label="Type" htmlFor="itemType" required className="col-md-4 mb-3">
                    <select
                      id="itemType"
                      className={selectClass(errors.type)}
                      {...register('type')}
                    >
                      {ITEM_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {ITEM_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Description" htmlFor="itemDescription" className="col-12 mb-3">
                    <textarea
                      id="itemDescription"
                      rows={2}
                      className={inputClass(errors.description)}
                      {...register('description')}
                    />
                  </Field>

                  <Field
                    label="Item code"
                    htmlFor="itemCode"
                    help="Blank allocates the next code"
                    className="col-md-4 mb-3"
                  >
                    <input
                      id="itemCode"
                      placeholder="ITM-0001"
                      className={inputClass(errors.itemCode)}
                      {...register('itemCode')}
                    />
                  </Field>

                  <Field
                    label="Default rate"
                    htmlFor="defaultRate"
                    required
                    error={errors.defaultRate}
                    className="col-md-4 mb-3"
                  >
                    <input
                      id="defaultRate"
                      inputMode="decimal"
                      className={`${inputClass(errors.defaultRate)} text-numeric`}
                      aria-describedby={describedBy('defaultRate', errors.defaultRate)}
                      {...register('defaultRate')}
                    />
                  </Field>

                  <Field label="Currency" htmlFor="itemCurrency" required className="col-md-4 mb-3">
                    <select
                      id="itemCurrency"
                      className={selectClass(errors.currencyCode)}
                      {...register('currencyCode')}
                    >
                      {(currencies ?? []).map((currency) => (
                        <option key={currency.code} value={currency.code}>
                          {currency.code}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Unit" htmlFor="unitId" className="col-md-4 mb-3">
                    <select
                      id="unitId"
                      className={selectClass(errors.unitId)}
                      {...register('unitId', {
                        setValueAs: (value) => (value === '' ? null : Number(value)),
                      })}
                    >
                      <option value="">Not set</option>
                      {(units ?? []).map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.code} — {unit.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="HSN / SAC code"
                    htmlFor="hsnSacCode"
                    error={errors.hsnSacCode}
                    help="4, 6 or 8 digits — printed on GST documents"
                    className="col-md-4 mb-3"
                  >
                    <input
                      id="hsnSacCode"
                      className={`${inputClass(errors.hsnSacCode)} text-mono`}
                      aria-describedby={describedBy('hsnSacCode', errors.hsnSacCode, 'help')}
                      {...register('hsnSacCode')}
                    />
                  </Field>

                  <Field label="Category" htmlFor="categoryId" className="col-md-4 mb-3">
                    <select
                      id="categoryId"
                      className={selectClass(errors.categoryId)}
                      {...register('categoryId', {
                        setValueAs: (value) => (value === '' ? null : Number(value)),
                      })}
                    >
                      <option value="">Not set</option>
                      {(categories ?? []).map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="Default tax"
                    htmlFor="defaultTaxGroupId"
                    help="Pre-selected on a document line; still changeable there"
                    className="col-12 mb-0"
                  >
                    <select
                      id="defaultTaxGroupId"
                      className={selectClass(errors.defaultTaxGroupId)}
                      {...register('defaultTaxGroupId', {
                        setValueAs: (value) => (value === '' ? null : Number(value)),
                      })}
                    >
                      <option value="">No default</option>
                      {(taxGroups ?? []).map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-sm btn-light" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-sm btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create item'}
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

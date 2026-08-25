import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserInput,
  type RoleSummary,
  type UpdateUserInput,
  type UserSummary,
} from '@app/shared';
import { ApiError } from '@/services/api-client';
import { useToast } from '@/components/Toast';
import { userKeys, usersApi } from './users-api';

interface UserFormModalProps {
  open: boolean;
  user: UserSummary | null;
  roles: RoleSummary[];
  onClose: () => void;
}

/**
 * Create and edit in one modal. On create the administrator sets a temporary
 * password; the account is flagged so its owner must replace it at first sign-in.
 */
export const UserFormModal = ({ open, user, roles, onClose }: UserFormModalProps) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = user !== null;

  const form = useForm<CreateUserInput>({
    resolver: zodResolver(isEdit ? (updateUserSchema as never) : createUserSchema),
    defaultValues: { name: '', email: '', phone: '', roleId: roles[0]?.id ?? 1, password: '' },
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  useEffect(() => {
    if (!open) return;
    reset(
      user
        ? {
            name: user.name,
            email: user.email,
            phone: user.phone ?? '',
            roleId: user.role.id,
            password: '',
          }
        : { name: '', email: '', phone: '', roleId: roles[0]?.id ?? 1, password: '' },
    );
  }, [open, user, roles, reset]);

  const mutation = useMutation({
    mutationFn: (values: CreateUserInput) =>
      isEdit
        ? usersApi.update(user.id, {
            name: values.name,
            phone: values.phone,
            roleId: values.roleId,
          } as UpdateUserInput)
        : usersApi.create(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success(isEdit ? 'User updated' : 'User created');
      onClose();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors();
        for (const [path, message] of Object.entries(fieldErrors)) {
          setError(path as keyof CreateUserInput, { message });
        }
        if (Object.keys(fieldErrors).length === 0) toast.error(error.message);
        return;
      }
      toast.error('Could not save the user.');
    },
  });

  if (!open) return null;

  return (
    <>
      <div className="modal fade show d-block" role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <form onSubmit={handleSubmit((values) => mutation.mutateAsync(values))} noValidate>
              <div className="modal-header">
                <h2 className="modal-title h6">{isEdit ? 'Edit user' : 'New user'}</h2>
                <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
              </div>

              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label" htmlFor="user-name">
                    Name
                  </label>
                  <input
                    id="user-name"
                    className={`form-control${errors.name ? ' is-invalid' : ''}`}
                    {...register('name')}
                  />
                  {errors.name && <div className="invalid-feedback">{errors.name.message}</div>}
                </div>

                <div className="mb-3">
                  <label className="form-label" htmlFor="user-email">
                    Email address
                  </label>
                  <input
                    id="user-email"
                    type="email"
                    disabled={isEdit}
                    className={`form-control${errors.email ? ' is-invalid' : ''}`}
                    {...register('email')}
                  />
                  {errors.email ? (
                    <div className="invalid-feedback">{errors.email.message}</div>
                  ) : (
                    isEdit && (
                      <div className="form-text">The sign-in address cannot be changed.</div>
                    )
                  )}
                </div>

                <div className="mb-3">
                  <label className="form-label" htmlFor="user-phone">
                    Phone <span className="text-secondary fw-normal">(optional)</span>
                  </label>
                  <input id="user-phone" className="form-control" {...register('phone')} />
                </div>

                <div className="mb-3">
                  <label className="form-label" htmlFor="user-role">
                    Role
                  </label>
                  <select
                    id="user-role"
                    className={`form-select${errors.roleId ? ' is-invalid' : ''}`}
                    {...register('roleId', { valueAsNumber: true })}
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                        {role.isReadOnly ? ' (read only)' : ''}
                      </option>
                    ))}
                  </select>
                  {errors.roleId && <div className="invalid-feedback">{errors.roleId.message}</div>}
                </div>

                {!isEdit && (
                  <div className="mb-1">
                    <label className="form-label" htmlFor="user-password">
                      Temporary password
                    </label>
                    <input
                      id="user-password"
                      type="password"
                      autoComplete="new-password"
                      className={`form-control${errors.password ? ' is-invalid' : ''}`}
                      {...register('password')}
                    />
                    {errors.password ? (
                      <div className="invalid-feedback">{errors.password.message}</div>
                    ) : (
                      <div className="form-text">
                        At least 10 characters with upper case, lower case and a number. The user
                        must change it when they first sign in.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-sm btn-light" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-sm btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
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

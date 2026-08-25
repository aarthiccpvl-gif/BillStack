import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { resetPasswordSchema, type ResetPasswordInput, type UserSummary } from '@app/shared';
import { ApiError } from '@/services/api-client';
import { useToast } from '@/components/Toast';
import { userKeys, usersApi } from './users-api';

/**
 * An administrator sets a temporary password. The account is signed out everywhere
 * and flagged so its owner must replace it at the next sign-in.
 */
export const ResetPasswordModal = ({
  user,
  onClose,
}: {
  user: UserSummary | null;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', mustChangePassword: true },
  });

  const mutation = useMutation({
    mutationFn: (values: ResetPasswordInput) => usersApi.resetPassword(user!.id, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success(`Password reset for ${user?.name ?? 'the user'}`);
      reset();
      onClose();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors();
        if (fieldErrors.newPassword) {
          setError('newPassword', { message: fieldErrors.newPassword });
          return;
        }
        toast.error(error.message);
        return;
      }
      toast.error('Could not reset the password.');
    },
  });

  if (!user) return null;

  return (
    <>
      <div className="modal fade show d-block" role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <form onSubmit={handleSubmit((values) => mutation.mutateAsync(values))} noValidate>
              <div className="modal-header">
                <h2 className="modal-title h6">Reset password</h2>
                <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
              </div>

              <div className="modal-body">
                <p className="small text-secondary">
                  {user.name} will be signed out everywhere and must choose a new password at their
                  next sign-in.
                </p>

                <label className="form-label" htmlFor="reset-password">
                  Temporary password
                </label>
                <input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  className={`form-control${errors.newPassword ? ' is-invalid' : ''}`}
                  {...register('newPassword')}
                />
                {errors.newPassword ? (
                  <div className="invalid-feedback">{errors.newPassword.message}</div>
                ) : (
                  <div className="form-text">
                    At least 10 characters with upper case, lower case and a number.
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-sm btn-light" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-sm btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Resetting…' : 'Reset password'}
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

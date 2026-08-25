import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { changePasswordSchema, type ChangePasswordInput } from '@app/shared';
import { AuthLayout } from '@/layouts/AuthLayout';
import { authApi } from '@/services/auth-api';
import { ApiError } from '@/services/api-client';
import { useAuth } from '@/app/AuthProvider';

/**
 * Used both for the forced change after a seeded or reset account signs in, and
 * from the profile page. Changing the password ends every session, including this
 * one, so the user signs in again afterwards.
 */
export const ChangePasswordPage = () => {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await authApi.changePassword(values);
      setDone(true);
      await refresh();
      window.setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors();
        for (const [path, message] of Object.entries(fieldErrors)) {
          if (path in values) setError(path as keyof ChangePasswordInput, { message });
        }
        if (Object.keys(fieldErrors).length === 0) setFormError(error.message);
        return;
      }
      setFormError('Something went wrong. Please try again.');
    }
  });

  if (done) {
    return (
      <AuthLayout title="Password changed">
        <div className="alert alert-success py-2 small mb-0" role="status">
          Your password has been changed. Signing you in again…
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={user?.mustChangePassword ? 'Set a new password' : 'Change your password'}
      description={
        user?.mustChangePassword
          ? 'This account was created for you with a temporary password. Choose your own before continuing.'
          : 'You will be signed out of every device afterwards.'
      }
    >
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <div className="alert alert-danger py-2 small" role="alert">
            {formError}
          </div>
        )}

        <div className="mb-3">
          <label className="form-label" htmlFor="currentPassword">
            Current password
          </label>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            className={`form-control${errors.currentPassword ? ' is-invalid' : ''}`}
            {...register('currentPassword')}
          />
          {errors.currentPassword && (
            <div className="invalid-feedback">{errors.currentPassword.message}</div>
          )}
        </div>

        <div className="mb-3">
          <label className="form-label" htmlFor="newPassword">
            New password
          </label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            className={`form-control${errors.newPassword ? ' is-invalid' : ''}`}
            aria-describedby="password-help"
            {...register('newPassword')}
          />
          {errors.newPassword ? (
            <div className="invalid-feedback">{errors.newPassword.message}</div>
          ) : (
            <div className="form-text" id="password-help">
              At least 10 characters, with an uppercase letter, a lowercase letter and a number.
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="form-label" htmlFor="confirmPassword">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            className={`form-control${errors.confirmPassword ? ' is-invalid' : ''}`}
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <div className="invalid-feedback">{errors.confirmPassword.message}</div>
          )}
        </div>

        <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </AuthLayout>
  );
};

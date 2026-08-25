import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { loginSchema, type LoginInput } from '@app/shared';
import { AuthLayout } from '@/layouts/AuthLayout';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';

export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const user = await login(values);

      if (user.mustChangePassword) {
        navigate('/change-password', { replace: true });
        return;
      }

      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        /* Field-level messages where the API gave them, a banner otherwise. */
        const fieldErrors = error.fieldErrors();
        for (const [path, message] of Object.entries(fieldErrors)) {
          if (path === 'email' || path === 'password') setError(path, { message });
        }
        if (Object.keys(fieldErrors).length === 0) setFormError(error.message);
        return;
      }
      setFormError('Something went wrong. Please try again.');
    }
  });

  return (
    <AuthLayout title="Sign in" description="Use the account issued to you by an administrator.">
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <div className="alert alert-danger py-2 small" role="alert">
            {formError}
          </div>
        )}

        <div className="mb-3">
          <label className="form-label" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            className={`form-control${errors.email ? ' is-invalid' : ''}`}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          {errors.email && (
            <div className="invalid-feedback" id="email-error">
              {errors.email.message}
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="form-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className={`form-control${errors.password ? ' is-invalid' : ''}`}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          {errors.password && (
            <div className="invalid-feedback" id="password-error">
              {errors.password.message}
            </div>
          )}
        </div>

        <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" aria-hidden />
              Signing in…
            </>
          ) : (
            <>
              <LogIn size={16} className="me-2" aria-hidden />
              Sign in
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
};

import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';

/** Centred card layout used by the sign-in and forced password-change screens. */
export const AuthLayout = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <div className="min-vh-100 d-flex align-items-center justify-content-center bg-body-tertiary p-3">
    <div style={{ width: '100%', maxWidth: '25rem' }}>
      <div className="d-flex justify-content-center mb-4">
        <Logo size={36} tagline />
      </div>

      <div className="card">
        <div className="card-body p-4">
          <h1 className="h5 mb-1">{title}</h1>
          {description && <p className="text-secondary small mb-4">{description}</p>}
          {children}
        </div>
      </div>

      <p className="text-center text-secondary small mt-3 mb-0">Internal use only</p>
    </div>
  </div>
);

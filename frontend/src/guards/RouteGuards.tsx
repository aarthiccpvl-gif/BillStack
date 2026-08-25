import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Permission } from '@app/shared';
import { useAuth } from '@/app/AuthProvider';
import { ForbiddenPage } from '@/pages/ForbiddenPage';

const FullPageSpinner = ({ label }: { label: string }) => (
  <div className="d-flex align-items-center justify-content-center vh-100" role="status">
    <div className="text-center text-secondary">
      <div className="spinner-border mb-3" aria-hidden />
      <div className="small">{label}</div>
    </div>
  </div>
);

/** Requires a session. Remembers where the user was headed so login can return them. */
export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner label="Checking your session…" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  /* A seeded or reset account cannot go anywhere until the password is replaced —
     the API enforces the same rule, so this only saves the user a pointless 403. */
  if (user?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
};

/**
 * Requires a permission. Renders a 403 page rather than redirecting: a silent
 * redirect makes an authorisation problem look like a routing bug.
 */
export const RequirePermission = ({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) => {
  const { hasPermission } = useAuth();
  return hasPermission(permission) ? <>{children}</> : <ForbiddenPage permission={permission} />;
};

/** Keeps a signed-in user away from the login screen. */
export const RedirectIfAuthenticated = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <FullPageSpinner label="Loading…" />;
  return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>;
};

import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Permission } from '@app/shared';
import { useAuth } from '@/app/AuthProvider';

/**
 * Shown when a signed-in user reaches something their role does not allow.
 * States plainly what is missing instead of pretending the page does not exist.
 */
export const ForbiddenPage = ({ permission }: { permission?: Permission }) => {
  const { user } = useAuth();

  return (
    <div className="d-flex justify-content-center py-5">
      <div className="card" style={{ maxWidth: '32rem' }}>
        <div className="card-body text-center p-4">
          <div className="text-secondary mb-3">
            <ShieldAlert size={28} aria-hidden />
          </div>
          <h1 className="page-title mb-2">You do not have access to this</h1>
          <p className="text-secondary mb-3">
            {user?.role.isReadOnly
              ? `The ${user.role.name} role can view, export and download, but cannot open this screen.`
              : 'Your role does not include this screen. An administrator can grant it.'}
          </p>
          {permission && (
            <p className="small text-secondary mb-3">
              Required permission: <code>{permission}</code>
            </p>
          )}
          <Link className="btn btn-sm btn-primary" to="/">
            Back to the dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

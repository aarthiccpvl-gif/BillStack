import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/app/AuthProvider';

const formatDateTime = (value: string | null): string =>
  value
    ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Never';

export const ProfilePage = () => {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <>
      <PageHeader title="Your profile" breadcrumbs={[{ label: 'Profile' }]} />

      <div className="row g-3">
        <div className="col-12 col-lg-7">
          <div className="card h-100">
            <div className="card-header bg-white">
              <span className="label-caps">Account</span>
            </div>
            <div className="card-body">
              <dl className="row mb-0">
                <dt className="col-sm-4 text-secondary fw-normal">Name</dt>
                <dd className="col-sm-8">{user.name}</dd>

                <dt className="col-sm-4 text-secondary fw-normal">Email</dt>
                <dd className="col-sm-8">{user.email}</dd>

                <dt className="col-sm-4 text-secondary fw-normal">Role</dt>
                <dd className="col-sm-8">
                  {user.role.name}
                  {user.role.isReadOnly && (
                    <span className="badge text-bg-light ms-2">Read only</span>
                  )}
                </dd>

                <dt className="col-sm-4 text-secondary fw-normal">Last signed in</dt>
                <dd className="col-sm-8 mb-0">{formatDateTime(user.lastLoginAt)}</dd>
              </dl>
            </div>
            <div className="card-footer bg-white">
              <Link className="btn btn-sm btn-outline-primary" to="/change-password">
                <KeyRound size={15} className="me-2" aria-hidden />
                Change password
              </Link>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-5">
          <div className="card h-100">
            <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <span className="label-caps">What you can do</span>
              <span className="badge text-bg-light">{user.permissions.length}</span>
            </div>
            <div className="card-body">
              <p className="small text-secondary">
                These are enforced by the API, not just by what the screens show.
              </p>
              <div className="d-flex flex-wrap gap-1">
                {[...user.permissions].sort().map((permission) => (
                  <span key={permission} className="badge text-bg-light text-mono fw-normal">
                    {permission}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

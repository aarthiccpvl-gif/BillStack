import { useState } from 'react';
import { PERMISSIONS } from '@app/shared';
import { useAuth } from '@/app/AuthProvider';
import { UsersPage } from './UsersPage';
import { RolesPanel } from './RolesPanel';

type Tab = 'users' | 'roles';

/** Users and the role matrix, as two tabs of one administration screen. */
export const AdminUsersPage = () => {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<Tab>('users');
  const canSeeRoles = hasPermission(PERMISSIONS.ROLE_READ);

  return (
    <>
      {canSeeRoles && (
        <ul className="nav nav-tabs mb-3">
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link${tab === 'users' ? ' active' : ''}`}
              aria-current={tab === 'users' ? 'page' : undefined}
              onClick={() => setTab('users')}
            >
              Users
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link${tab === 'roles' ? ' active' : ''}`}
              aria-current={tab === 'roles' ? 'page' : undefined}
              onClick={() => setTab('roles')}
            >
              Roles & permissions
            </button>
          </li>
        </ul>
      )}

      {tab === 'users' ? <UsersPage /> : <RolesPanel />}
    </>
  );
};

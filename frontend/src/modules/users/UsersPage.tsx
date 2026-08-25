import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Search, UserCheck, UserX } from 'lucide-react';
import { PERMISSIONS, type UserSummary } from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { roleKeys, rolesApi, userKeys, usersApi } from './users-api';
import { UserFormModal } from './UserFormModal';
import { ResetPasswordModal } from './ResetPasswordModal';

const STATUS_BADGE: Record<UserSummary['status'], string> = {
  ACTIVE: 'text-bg-success',
  INACTIVE: 'text-bg-secondary',
  LOCKED: 'text-bg-danger',
};

const formatDateTime = (value: string | null): string =>
  value
    ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

export const UsersPage = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { hasPermission, user: currentUser } = useAuth();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserSummary | null>(null);

  const canCreate = hasPermission(PERMISSIONS.USER_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.USER_UPDATE);

  const params = { page, pageSize: 25, search: search || undefined, sort: 'name' };

  const usersQuery = useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => usersApi.list(params),
  });

  const rolesQuery = useQuery({ queryKey: roleKeys.list(), queryFn: () => rolesApi.list() });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'ACTIVE' | 'INACTIVE' }) =>
      usersApi.update(id, { status }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success(variables.status === 'ACTIVE' ? 'User reactivated' : 'User deactivated');
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not change the status.'),
  });

  const rows = usersQuery.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Users & Roles"
        description="Accounts that can sign in, and the role each one holds."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Users & Roles' }]}
        actions={
          canCreate ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus size={15} className="me-1" aria-hidden />
              New user
            </button>
          ) : undefined
        }
      />

      <div className="card">
        <div className="card-header bg-white">
          <form
            className="d-flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSearch(searchInput.trim());
            }}
          >
            <div className="input-group input-group-sm" style={{ maxWidth: '22rem' }}>
              <span className="input-group-text bg-white border-end-0">
                <Search size={14} aria-hidden />
              </span>
              <input
                className="form-control border-start-0"
                placeholder="Search by name or email"
                aria-label="Search users"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-sm btn-outline-secondary">
              Search
            </button>
            {search && (
              <button
                type="button"
                className="btn btn-sm btn-link"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  setPage(1);
                }}
              >
                Clear
              </button>
            )}
          </form>
        </div>

        <div className="table-scroll">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Last signed in</th>
                {canUpdate && (
                  <th scope="col" className="text-end">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {usersQuery.isLoading && <TableSkeleton columns={canUpdate ? 6 : 5} />}

              {rows.map((user) => (
                <tr key={user.id}>
                  <td>
                    <span className="fw-medium">{user.name}</span>
                    {user.id === currentUser?.id && (
                      <span className="badge text-bg-light ms-2">You</span>
                    )}
                    {user.mustChangePassword && (
                      <span className="badge text-bg-warning ms-2">Password change pending</span>
                    )}
                  </td>
                  <td className="text-secondary">{user.email}</td>
                  <td>
                    {user.role.name}
                    {user.role.key === 'FINANCE_VIEWER' && (
                      <span className="badge text-bg-light ms-2">Read only</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[user.status]}`}>{user.status}</span>
                  </td>
                  <td className="text-secondary small">{formatDateTime(user.lastLoginAt)}</td>
                  {canUpdate && (
                    <td className="text-end">
                      <div className="btn-group btn-group-sm">
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          title="Edit"
                          onClick={() => {
                            setEditing(user);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil size={14} aria-hidden />
                          <span className="visually-hidden">Edit {user.name}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          title="Reset password"
                          onClick={() => setResetTarget(user)}
                        >
                          <KeyRound size={14} aria-hidden />
                          <span className="visually-hidden">Reset password for {user.name}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          disabled={user.id === currentUser?.id || statusMutation.isPending}
                          title={
                            user.id === currentUser?.id
                              ? 'You cannot deactivate your own account'
                              : user.status === 'ACTIVE'
                                ? 'Deactivate'
                                : 'Reactivate'
                          }
                          onClick={() =>
                            statusMutation.mutate({
                              id: user.id,
                              status: user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                            })
                          }
                        >
                          {user.status === 'ACTIVE' ? (
                            <UserX size={14} aria-hidden />
                          ) : (
                            <UserCheck size={14} aria-hidden />
                          )}
                          <span className="visually-hidden">
                            {user.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'} {user.name}
                          </span>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {usersQuery.isError && (
          <ErrorState
            message={
              usersQuery.error instanceof ApiError ? usersQuery.error.message : 'Unexpected error.'
            }
            onRetry={() => void usersQuery.refetch()}
          />
        )}

        {!usersQuery.isLoading && !usersQuery.isError && rows.length === 0 && (
          <EmptyState
            title={search ? 'No users match that search' : 'No users yet'}
            description={search ? 'Try a different name or email address.' : undefined}
          />
        )}

        {usersQuery.data && rows.length > 0 && (
          <div className="card-footer bg-white">
            <Pagination meta={usersQuery.data.meta} onPageChange={setPage} />
          </div>
        )}
      </div>

      <UserFormModal
        open={formOpen}
        user={editing}
        roles={rolesQuery.data ?? []}
        onClose={() => setFormOpen(false)}
      />

      <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
    </>
  );
};

import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Save } from 'lucide-react';
import { PERMISSIONS, PERMISSION_MODULES, type Permission, type RoleSummary } from '@app/shared';
import { ErrorState } from '@/components/states';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { roleKeys, rolesApi } from './users-api';

/**
 * The role → permission matrix, grouped by module.
 *
 * Editable because permissions are data, not code — moving a capability between
 * Admin and Super Admin is a settings change. Super Admin always holds everything
 * and the read-only role refuses write permissions; both rules are enforced by the
 * API as well, this just avoids offering an action that will be rejected.
 */
export const RolesPanel = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.ROLE_UPDATE);

  const rolesQuery = useQuery({ queryKey: roleKeys.list(), queryFn: () => rolesApi.list() });
  const [draft, setDraft] = useState<Record<number, Set<Permission>> | null>(null);

  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);

  const mutation = useMutation({
    mutationFn: ({ roleId, permissions }: { roleId: number; permissions: Permission[] }) =>
      rolesApi.updatePermissions(roleId, permissions),
    onSuccess: async (role) => {
      await queryClient.invalidateQueries({ queryKey: roleKeys.all });
      /* Permissions are resolved per request on the server, so this takes effect at
         once — refresh the session too in case the current user's role changed. */
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      setDraft(null);
      toast.success(`${role.name} permissions updated`);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not save the permissions.'),
  });

  const selectionFor = (role: RoleSummary): Set<Permission> =>
    draft?.[role.id] ?? new Set(role.permissions);

  const toggle = (role: RoleSummary, permission: Permission) => {
    const current = new Set(selectionFor(role));
    if (current.has(permission)) current.delete(permission);
    else current.add(permission);
    setDraft({ ...(draft ?? {}), [role.id]: current });
  };

  if (rolesQuery.isError) {
    return (
      <ErrorState
        message={
          rolesQuery.error instanceof ApiError ? rolesQuery.error.message : 'Unexpected error.'
        }
        onRetry={() => void rolesQuery.refetch()}
      />
    );
  }

  return (
    <div className="card">
      <div className="card-header bg-white d-flex flex-wrap justify-content-between align-items-center gap-2">
        <span className="label-caps">Role permissions</span>
        <span className="small text-secondary">
          Enforced by the API — hiding a button in the UI is presentation, not security.
        </span>
      </div>

      <div className="table-scroll">
        <table className="table table-sm align-middle mb-0">
          <thead>
            <tr>
              <th scope="col" style={{ minWidth: '18rem' }}>
                Permission
              </th>
              {roles.map((role) => (
                <th key={role.id} scope="col" className="text-center" style={{ minWidth: '9rem' }}>
                  <div>{role.name}</div>
                  <div className="fw-normal text-secondary small">
                    {role.userCount} {role.userCount === 1 ? 'user' : 'users'}
                    {role.isReadOnly && ' · read only'}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(PERMISSION_MODULES).map(([moduleKey, module]) => (
              <Fragment key={moduleKey}>
                <tr className="table-light">
                  <th scope="rowgroup" colSpan={roles.length + 1} className="small">
                    {module.label}
                  </th>
                </tr>
                {module.permissions.map((permission) => (
                  <tr key={permission}>
                    <td className="text-mono small">{permission}</td>
                    {roles.map((role) => {
                      const locked = role.key === 'SUPER_ADMIN';
                      const checked = locked || selectionFor(role).has(permission);
                      return (
                        <td key={role.id} className="text-center">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={checked}
                            disabled={!canEdit || locked || mutation.isPending}
                            aria-label={`${permission} for ${role.name}`}
                            onChange={() => toggle(role, permission)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="card-footer bg-white d-flex flex-wrap gap-2 align-items-center">
          <Lock size={14} className="text-secondary" aria-hidden />
          <span className="small text-secondary flex-grow-1">
            Super Admin always holds every permission and cannot be reduced.
          </span>
          {draft &&
            Object.keys(draft).map((roleId) => {
              const role = roles.find((entry) => entry.id === Number(roleId));
              if (!role) return null;
              return (
                <button
                  key={roleId}
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({
                      roleId: role.id,
                      permissions: [...selectionFor(role)],
                    })
                  }
                >
                  <Save size={14} className="me-1" aria-hidden />
                  Save {role.name}
                </button>
              );
            })}
          {draft && (
            <button type="button" className="btn btn-sm btn-light" onClick={() => setDraft(null)}>
              Discard
            </button>
          )}
        </div>
      )}
    </div>
  );
};

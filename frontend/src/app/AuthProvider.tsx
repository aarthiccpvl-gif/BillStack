import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser, LoginInput, Permission } from '@app/shared';
import { authApi } from '@/services/auth-api';
import { ApiError } from '@/services/api-client';

/**
 * Session state.
 *
 * The tokens themselves live in httpOnly cookies and are never visible here — the
 * browser only ever knows *who* is signed in, from GET /auth/me. `hasPermission`
 * drives what the UI offers; the API enforces the same rules independently, so a
 * gap here is a usability bug rather than a security one.
 */

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (...permissions: Permission[]) => boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const authQueryKey = ['auth', 'me'] as const;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: authQueryKey,
    queryFn: async () => {
      try {
        const { user } = await authApi.me();
        return user;
      } catch (error) {
        /* Not signed in is a normal state, not an error to surface. */
        if (error instanceof ApiError && error.isUnauthenticated) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(authQueryKey, user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      /* Clear everything: another user may sign in on this machine next. */
      queryClient.setQueryData(authQueryKey, null);
      queryClient.clear();
    },
  });

  const user = sessionQuery.data ?? null;

  const hasPermission = useCallback(
    (permission: Permission) => user?.permissions.includes(permission) ?? false,
    [user],
  );

  const hasAnyPermission = useCallback(
    (...permissions: Permission[]) =>
      permissions.some((permission) => user?.permissions.includes(permission) ?? false),
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: sessionQuery.isLoading,
      isAuthenticated: user !== null,
      hasPermission,
      hasAnyPermission,
      login: async (input) => (await loginMutation.mutateAsync(input)).user,
      logout: async () => {
        await logoutMutation.mutateAsync();
      },
      refresh: async () => {
        await queryClient.invalidateQueries({ queryKey: authQueryKey });
      },
    }),
    [
      user,
      sessionQuery.isLoading,
      hasPermission,
      hasAnyPermission,
      loginMutation,
      logoutMutation,
      queryClient,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
};

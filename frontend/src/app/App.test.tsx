import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { PERMISSIONS, ROLE_PERMISSIONS, type AuthUser, type Permission } from '@app/shared';
import { AppProviders } from './providers';
import { AppRoutes } from './routes';
import * as apiClientModule from '@/services/api-client';

const HEALTH = {
  status: 'ok',
  version: '0.1.0',
  environment: 'test',
  uptimeSeconds: 1,
  timestamp: new Date().toISOString(),
  checks: { database: 'up' },
};

const buildUser = (
  roleKey: 'SUPER_ADMIN' | 'ADMIN' | 'FINANCE_VIEWER',
  overrides: Partial<AuthUser> = {},
): AuthUser => ({
  id: 1,
  name: roleKey === 'FINANCE_VIEWER' ? 'Fiona Finance' : 'Alex Admin',
  email: 'user@example.com',
  phone: null,
  role: {
    id: 1,
    key: roleKey,
    name: roleKey,
    isReadOnly: roleKey === 'FINANCE_VIEWER',
  },
  permissions: (ROLE_PERMISSIONS[roleKey] ?? []) as Permission[],
  mustChangePassword: false,
  lastLoginAt: null,
  ...overrides,
});

/** Routes the mocked client by URL, so each test only declares what it cares about. */
const mockApi = (user: AuthUser | null) => {
  vi.spyOn(apiClientModule.apiClient, 'get').mockImplementation(((url: string) => {
    if (url === '/health') return Promise.resolve(HEALTH);
    if (url === '/auth/me') {
      return user
        ? Promise.resolve({ user })
        : Promise.reject(
            new apiClientModule.ApiError({
              code: 'UNAUTHENTICATED',
              status: 401,
              message: 'Please sign in to continue.',
            }),
          );
    }
    return Promise.resolve([]);
  }) as never);

  vi.spyOn(apiClientModule.apiClient, 'getPaginated').mockResolvedValue({
    items: [],
    meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
  } as never);
};

const silentQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const renderAt = (path: string) =>
  render(
    <AppProviders queryClient={silentQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );

describe('when nobody is signed in', () => {
  it('sends a visitor to the sign-in screen instead of the application', async () => {
    mockApi(null);
    renderAt('/');

    expect(await screen.findByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /main navigation/i })).not.toBeInTheDocument();
  });

  it('asks for both fields on the sign-in form', async () => {
    mockApi(null);
    renderAt('/login');

    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});

describe('when a Super Admin is signed in', () => {
  it('shows the shell with the administration section', async () => {
    mockApi(buildUser('SUPER_ADMIN'));
    renderAt('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Invoices' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users & Roles' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Company Settings' })).toBeInTheDocument();
  });

  it('opens the users administration screen', async () => {
    mockApi(buildUser('SUPER_ADMIN'));
    renderAt('/admin/users');

    expect(
      await screen.findByRole('heading', { level: 1, name: /users & roles/i }),
    ).toBeInTheDocument();
  });
});

describe('when a Finance Viewer is signed in', () => {
  it('shows only the read-only surface PRD §44 describes', async () => {
    mockApi(buildUser('FINANCE_VIEWER'));
    renderAt('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();

    for (const label of ['Quotations', 'Invoices', 'Customers', 'Reports']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }

    /* No authoring or administration entries. */
    for (const label of [
      'Products & Services',
      'Templates',
      'Users & Roles',
      'Company Settings',
      'Masters & Numbering',
    ]) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
    }

    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
  });

  it('refuses an administration URL typed directly, rather than silently redirecting', async () => {
    mockApi(buildUser('FINANCE_VIEWER'));
    renderAt('/admin/users');

    expect(
      await screen.findByRole('heading', { level: 1, name: /do not have access/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(PERMISSIONS.USER_READ)).toBeInTheDocument();
  });

  it('can still reach the documents it is allowed to read', async () => {
    mockApi(buildUser('FINANCE_VIEWER'));
    renderAt('/invoices');

    expect(await screen.findByRole('heading', { level: 1, name: 'Invoices' })).toBeInTheDocument();
  });
});

describe('a temporary password blocks everything else', () => {
  it('forces the change-password screen', async () => {
    mockApi(buildUser('ADMIN', { mustChangePassword: true }));
    renderAt('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: /set a new password/i }),
    ).toBeInTheDocument();
  });
});

describe('routing', () => {
  it('shows a not-found page for an unknown address', async () => {
    mockApi(buildUser('ADMIN'));
    renderAt('/nope');

    expect(
      await screen.findByRole('heading', { level: 1, name: /page not found/i }),
    ).toBeInTheDocument();
  });

  it('reports an unreachable API in the topbar', async () => {
    vi.spyOn(apiClientModule.apiClient, 'get').mockImplementation(((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ user: buildUser('ADMIN') });
      return Promise.reject(new Error('offline'));
    }) as never);

    renderAt('/');

    expect(await screen.findByText(/API unreachable/i)).toBeInTheDocument();
  });
});

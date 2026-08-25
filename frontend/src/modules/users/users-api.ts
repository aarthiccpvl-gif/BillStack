import type {
  CreateUserInput,
  Permission,
  ResetPasswordInput,
  RoleSummary,
  UpdateUserInput,
  UserSummary,
} from '@app/shared';
import { apiClient } from '@/services/api-client';

export interface UserListParams {
  page: number;
  pageSize: number;
  search?: string;
  sort?: string;
}

export interface PermissionRecord {
  id: number;
  key: Permission;
  module: string;
  action: string;
  description: string | null;
}

export const usersApi = {
  list: (params: UserListParams) => apiClient.getPaginated<UserSummary>('/users', { ...params }),
  get: (id: number) => apiClient.get<UserSummary>(`/users/${id}`),
  create: (input: CreateUserInput) => apiClient.post<UserSummary>('/users', input),
  update: (id: number, input: UpdateUserInput) =>
    apiClient.patch<UserSummary>(`/users/${id}`, input),
  resetPassword: (id: number, input: ResetPasswordInput) =>
    apiClient.post<{ passwordReset: boolean }>(`/users/${id}/reset-password`, input),
};

export const rolesApi = {
  list: () => apiClient.get<RoleSummary[]>('/roles'),
  listPermissions: () => apiClient.get<PermissionRecord[]>('/permissions'),
  updatePermissions: (id: number, permissions: Permission[]) =>
    apiClient.patch<RoleSummary>(`/roles/${id}/permissions`, { permissions }),
};

export const userKeys = {
  all: ['users'] as const,
  list: (params: UserListParams) => [...userKeys.all, 'list', params] as const,
  detail: (id: number) => [...userKeys.all, 'detail', id] as const,
};

export const roleKeys = {
  all: ['roles'] as const,
  list: () => [...roleKeys.all, 'list'] as const,
  permissions: () => ['permissions'] as const,
};

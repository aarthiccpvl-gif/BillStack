import type { AuthUser, ChangePasswordInput, LoginInput } from '@app/shared';
import { apiClient } from './api-client';

interface SessionResponse {
  user: AuthUser;
}

export const authApi = {
  login: (input: LoginInput) => apiClient.post<SessionResponse>('/auth/login', input),
  logout: () => apiClient.post<{ loggedOut: boolean }>('/auth/logout'),
  me: () => apiClient.get<SessionResponse>('/auth/me'),
  changePassword: (input: ChangePasswordInput) =>
    apiClient.post<{ passwordChanged: boolean }>('/auth/change-password', input),
};

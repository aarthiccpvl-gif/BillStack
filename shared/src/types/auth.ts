import type { Permission } from '../constants/permissions';
import type { RoleKey } from '../constants/roles';

/** The principal as the browser sees it — returned by GET /api/auth/me. */
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  role: {
    id: number;
    key: RoleKey;
    name: string;
    /** True for roles the API blocks from every non-GET request. */
    isReadOnly: boolean;
  };
  /**
   * Resolved permission keys. Loaded per request on the server rather than embedded
   * in the token, so revoking a permission takes effect immediately.
   */
  permissions: Permission[];
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

export interface LoginResponse {
  user: AuthUser;
}

export interface RoleSummary {
  id: number;
  key: RoleKey;
  name: string;
  description: string | null;
  isSystem: boolean;
  isReadOnly: boolean;
  userCount: number;
  permissions: Permission[];
}

export interface UserSummary {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  role: { id: number; key: RoleKey; name: string };
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  createdAt: string;
}

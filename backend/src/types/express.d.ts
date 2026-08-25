import type { Permission, RoleKey } from '@app/shared';

/**
 * The authenticated principal, attached by the authenticate middleware and read by
 * the authorisation guards and the service layer.
 */
export interface AuthContext {
  userId: number;
  email: string;
  name: string;
  roleId: number;
  roleKey: RoleKey;
  isReadOnly: boolean;
  permissions: Permission[];
  mustChangePassword: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};

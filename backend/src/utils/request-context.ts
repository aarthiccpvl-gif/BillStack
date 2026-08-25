import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Ambient per-request information.
 *
 * This exists so the audit and revision services can record who did what, from
 * where, without every service signature having to carry `actor`, `ip` and
 * `requestId` down through the call stack.
 */
export interface RequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
  userId?: number;
  userEmail?: string;
  roleKey?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithContext = <T>(context: RequestContext, fn: () => T): T =>
  storage.run(context, fn);

export const getContext = (): RequestContext | undefined => storage.getStore();

export const getRequestId = (): string | undefined => storage.getStore()?.requestId;

/** Attaches the authenticated principal once auth middleware has run (Phase 2). */
export const setContextUser = (user: {
  userId: number;
  userEmail: string;
  roleKey: string;
}): void => {
  const context = storage.getStore();
  if (!context) return;
  context.userId = user.userId;
  context.userEmail = user.userEmail;
  context.roleKey = user.roleKey;
};

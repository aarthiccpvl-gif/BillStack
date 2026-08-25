import type { RequestHandler } from 'express';
import type { Permission } from '@app/shared';
import { ForbiddenError, UnauthenticatedError } from '../utils/errors';

/**
 * Route-level authorisation.
 *
 * Each handler produced here is tagged with the permission it enforces, which lets
 * `assertRoutesProtected` walk the router at startup and prove that no mutating
 * route shipped without a declared permission.
 */

export const PERMISSION_TAG = Symbol.for('app.requiredPermission');

export interface TaggedHandler extends RequestHandler {
  [PERMISSION_TAG]?: Permission | 'PUBLIC' | 'AUTHENTICATED';
}

const tag = (handler: RequestHandler, value: Permission | 'PUBLIC' | 'AUTHENTICATED') => {
  (handler as TaggedHandler)[PERMISSION_TAG] = value;
  return handler as TaggedHandler;
};

/** Requires a specific permission. This is the normal guard for a mutating route. */
export const requirePermission = (permission: Permission): TaggedHandler =>
  tag((req, _res, next) => {
    if (!req.auth) {
      next(new UnauthenticatedError());
      return;
    }

    if (!req.auth.permissions.includes(permission)) {
      next(new ForbiddenError('You do not have permission to perform this action.'));
      return;
    }

    next();
  }, permission);

/** Requires any one of several permissions — used where two roles reach the same read. */
export const requireAnyPermission = (...permissions: Permission[]): TaggedHandler =>
  tag((req, _res, next) => {
    if (!req.auth) {
      next(new UnauthenticatedError());
      return;
    }

    if (!permissions.some((permission) => req.auth?.permissions.includes(permission))) {
      next(new ForbiddenError('You do not have permission to perform this action.'));
      return;
    }

    next();
  }, permissions[0] ?? 'AUTHENTICATED');

/**
 * Marks a route that any signed-in user may call regardless of role — the profile
 * and session endpoints. Explicit, so the startup check can tell "deliberately open
 * to all signed-in users" from "someone forgot a guard".
 */
export const authenticatedOnly = (): TaggedHandler =>
  tag((req, _res, next) => {
    if (!req.auth) {
      next(new UnauthenticatedError());
      return;
    }
    next();
  }, 'AUTHENTICATED');

/** Marks a deliberately public route (health, the public share link). */
export const publicRoute = (): TaggedHandler => tag((_req, _res, next) => next(), 'PUBLIC');

import { Router } from 'express';
import { asyncHandler } from '../../utils/http';
import { publicRoute } from '../../middleware/authorize';
import { health, ready } from './health.controller';

/**
 * Public routes — the only ones in the application that need no authentication.
 * Every other router registered from Phase 2 onward declares a permission.
 *
 * Tagged `publicRoute()` even though nothing enforces it: that is what makes
 * "deliberately open" distinguishable from "someone forgot a guard" when the RBAC
 * matrix walks the router.
 */
export const healthRouter = Router();

healthRouter.get('/', publicRoute(), asyncHandler(health));
healthRouter.get('/ready', publicRoute(), asyncHandler(ready));

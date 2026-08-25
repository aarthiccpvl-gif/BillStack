import { Router } from 'express';
import { asyncHandler } from '../../utils/http';
import { health, ready } from './health.controller';

/**
 * Public routes — the only ones in the application that need no authentication.
 * Every other router registered from Phase 2 onward declares a permission.
 */
export const healthRouter = Router();

healthRouter.get('/', asyncHandler(health));
healthRouter.get('/ready', asyncHandler(ready));

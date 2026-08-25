import { Router } from 'express';
import { changePasswordSchema, loginSchema } from '@app/shared';
import { asyncHandler } from '../../utils/http';
import { validateBody } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { authenticatedOnly, publicRoute } from '../../middleware/authorize';
import { authRateLimiter } from '../../middleware/security';
import * as controller from './auth.controller';

export const authRouter = Router();

/* Public — a session is what these create. The strict limiter blunts credential
   stuffing; the service itself locks an account after repeated failures. */
authRouter.post(
  '/login',
  publicRoute(),
  authRateLimiter(),
  validateBody(loginSchema),
  asyncHandler(controller.login),
);

authRouter.post('/refresh', publicRoute(), authRateLimiter(), asyncHandler(controller.refresh));

/* Logout works with or without a valid access token: a user whose token has just
   expired must still be able to clear their session. */
authRouter.post('/logout', publicRoute(), asyncHandler(controller.logout));

/* Signed in, any role. */
authRouter.get('/me', authenticate, authenticatedOnly(), asyncHandler(controller.me));

authRouter.post(
  '/change-password',
  authenticate,
  authenticatedOnly(),
  validateBody(changePasswordSchema),
  asyncHandler(controller.changePassword),
);

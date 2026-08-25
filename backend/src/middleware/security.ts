import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { ERROR_CODES } from '@app/shared';
import { env, isTest } from '../config/env';
import { sendFailure } from '../utils/http';
import { getRequestId } from '../utils/request-context';

/**
 * Baseline hardening. Everything here is deliberately conservative: this is an
 * internal finance application, so a slightly stricter default is preferable to a
 * convenient one.
 */

export const securityHeaders = (): RequestHandler =>
  helmet({
    // The API serves JSON and file streams, never HTML pages, so a tight CSP is free.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  });

export const corsPolicy = (): RequestHandler =>
  cors({
    origin: [env.FRONTEND_URL],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    maxAge: 600,
  });

export const globalRateLimiter = (): RequestHandler =>
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTest,
    handler: (_req, res) => {
      sendFailure(res, 429, {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many requests. Please slow down.',
        ...(getRequestId() ? { requestId: getRequestId() as string } : {}),
      });
    },
  });

/**
 * A much tighter limiter for the login route, mounted in Phase 2.
 * Kept here so the two limiter policies live side by side.
 */
export const authRateLimiter = (): RequestHandler =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: () => isTest,
    handler: (_req, res) => {
      sendFailure(res, 429, {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many sign-in attempts. Please try again later.',
      });
    },
  });

import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { ERROR_CODES } from '@app/shared';
import { env, isProduction, isTest } from '../config/env';
import { sendFailure } from '../utils/http';
import { logger } from '../utils/logger';
import { getRequestId } from '../utils/request-context';

/**
 * Baseline hardening. Everything here is deliberately conservative: this is an
 * internal finance application, so a slightly stricter default is preferable to a
 * convenient one.
 */

/**
 * The CSP has two shapes because the process has two jobs.
 *
 * API-only, it serves JSON and file streams and never a page, so forbidding
 * everything costs nothing. Serving the built web app as well, it has to allow
 * that app's own bundle - and inline *style*, because the document preview is an
 * `srcdoc` iframe carrying the print stylesheet inside it, and a sandboxed srcdoc
 * frame inherits this policy. Inline script stays forbidden either way, which is
 * the half that matters.
 */
export const securityHeaders = ({ servesWebApp }: { servesWebApp: boolean }): RequestHandler =>
  helmet({
    contentSecurityPolicy: {
      directives: servesWebApp
        ? {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            frameSrc: ["'self'", 'blob:'],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
          }
        : {
            defaultSrc: ["'none'"],
            frameAncestors: ["'none'"],
          },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  });

export const corsPolicy = (): RequestHandler =>
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    maxAge: 600,
  });

/**
 * A cross-site deployment fails in a way that reads as a server fault: every
 * endpoint answers 401 because the browser never sends a Lax cookie across sites,
 * and the CORS preflight fails separately on top of it. Neither symptom points at
 * the configuration that caused it, so say so at boot instead.
 *
 * `onrender.com`, `vercel.app`, `netlify.app` and friends are on the Public Suffix
 * List, which means two hostnames under them are different *sites*, not merely
 * different hosts - so a host mismatch is enough to warn on.
 */
export const warnOnCrossSiteAuth = (): void => {
  if (!isProduction) return;

  const apiHost = new URL(env.APP_URL).host;
  const foreign = env.FRONTEND_URL.filter((origin) => new URL(origin).host !== apiHost);

  if (foreign.length === 0) return;

  if (env.COOKIE_SAMESITE === 'none') {
    logger.warn(
      { apiHost, foreign },
      'the web app is on a different site from the API, so the auth cookies are third-party: Safari blocks these by default and Chrome is retiring them. Serving the built app from this process is the durable fix.',
    );
    return;
  }

  logger.error(
    { apiHost, foreign, cookieSameSite: env.COOKIE_SAMESITE },
    'the web app is on a different site from the API but the auth cookies are SameSite=' +
      `${env.COOKIE_SAMESITE}, which a browser will not send cross-site: every authenticated request will answer 401. ` +
      'Either serve the built app from this process (one origin, nothing to configure) or set COOKIE_SAMESITE=none.',
  );
};

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

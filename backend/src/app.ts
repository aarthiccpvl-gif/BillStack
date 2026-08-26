import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { API_PREFIX } from './config/app-info';
import { isTest } from './config/env';
import { apiRouter } from './routes';
import { publicRoute } from './middleware/authorize';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestContextMiddleware } from './middleware/request-context';
import { corsPolicy, globalRateLimiter, securityHeaders } from './middleware/security';
import { logger } from './utils/logger';
import { getRequestId } from './utils/request-context';
import { assertRoutesProtected } from './utils/route-audit';

/**
 * Builds the Express application. Kept free of listening/lifecycle concerns so the
 * test suite can mount it with Supertest without opening a port.
 */

/**
 * Where the built web app lives, or null when there is no build to serve.
 *
 * Resolved from this file rather than from `process.cwd()`, because the working
 * directory differs between `npm run dev -w backend` (backend/), a Render start
 * command (repo root) and a container (/app). `FRONTEND_DIST` overrides it for a
 * layout none of those guesses fit.
 */
const resolveFrontendDist = (): string | null => {
  const candidates = [
    process.env.FRONTEND_DIST,
    /* backend/src/app.ts and backend/dist/app.js are both two levels down. */
    path.resolve(__dirname, '../../frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(path.join(candidate, 'index.html'))) ?? null;
};

export const createApp = (): Express => {
  const app = express();

  /* Resolved before the first middleware: whether this process also serves the
     built web app decides how tight the CSP can be. */
  const frontendDist = isTest ? null : resolveFrontendDist();

  // Behind a reverse proxy in production; needed for correct client IPs in audit rows.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(securityHeaders({ servesWebApp: frontendDist !== null }));
  app.use(corsPolicy());
  app.use(requestContextMiddleware);

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: () => getRequestId() ?? '',
        autoLogging: {
          ignore: (req) => req.url === `${API_PREFIX}/health`,
        },
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      }),
    );
  }

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(globalRateLimiter());

  app.use(API_PREFIX, apiRouter);

  /* Fails the boot if a mutating route shipped without a declared permission. */
  assertRoutesProtected(app);

  /**
   * Single-service deployment: one Express process serves both the API and the
   * built web app, so there is one origin and the httpOnly auth cookies work with
   * no CORS or SameSite gymnastics.
   *
   * In development Vite serves the app on its own port and this stays dormant; in
   * tests it is switched off so the API's own 404 contract is what gets exercised.
   */
  if (frontendDist) {
    logger.info({ frontendDist }, 'serving the built web app from the API process');

    app.use(express.static(frontendDist));

    /* Client-side routing: /login, /quotations/12 and friends are React routes, so
       an unmatched GET returns the shell and lets the router decide.

       Anything under the API prefix is deliberately excluded — an unknown endpoint
       must stay a JSON 404 rather than quietly returning an HTML page, which is
       exactly the failure that makes a broken fetch look like a broken parser. */
    app.get('*', publicRoute(), (req, res, next) => {
      if (req.path.startsWith(API_PREFIX)) {
        next();
        return;
      }

      res.sendFile(path.join(frontendDist, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

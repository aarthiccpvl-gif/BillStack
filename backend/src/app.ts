import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { API_PREFIX } from './config/app-info';
import { isTest } from './config/env';
import { apiRouter } from './routes';
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
export const createApp = (): Express => {
  const app = express();

  // Behind a reverse proxy in production; needed for correct client IPs in audit rows.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(securityHeaders());
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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

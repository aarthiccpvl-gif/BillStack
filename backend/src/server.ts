import { createApp } from './app';
import { APP_NAME, APP_VERSION } from './config/app-info';
import { env } from './config/env';
import { disconnectDatabase } from './db/prisma';
import { startDailyJob, stopDailyJob } from './jobs/daily.job';
import { warnOnCrossSiteAuth } from './middleware/security';
import { logger } from './utils/logger';

process.env.TZ = env.TZ;

const app = createApp();
const server = app.listen(env.PORT, () => {
  startDailyJob();
  warnOnCrossSiteAuth();
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, tz: env.TZ },
    `${APP_NAME} v${APP_VERSION} listening on ${env.APP_URL}`,
  );
});

/** Finish in-flight requests, release the database, then exit. */
const shutdown = (signal: string): void => {
  logger.info({ signal }, 'shutting down');

  const forceExit = setTimeout(() => {
    logger.error('shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  stopDailyJob();

  /* Give in-flight requests a moment, then drop whatever is still connected. */
  const dropLingering = setTimeout(() => server.closeAllConnections(), 3_000);
  dropLingering.unref();

  /* Keep-alive sockets would otherwise hold the port open well past the close
     callback — which makes a dev-server restart fail with EADDRINUSE, and delays
     a production rolling restart for no good reason. */
  server.closeIdleConnections();
  server.close(() => {
    void disconnectDatabase().finally(() => {
      clearTimeout(forceExit);
      process.exit(0);
    });
  });
};

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => shutdown(signal));
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception — exiting');
  process.exit(1);
});

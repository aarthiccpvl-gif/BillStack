import type { HealthPayload } from '@app/shared';
import { APP_VERSION } from '../../config/app-info';
import { env } from '../../config/env';
import { checkDatabase } from '../../db/prisma';

export const getHealth = async (): Promise<HealthPayload> => {
  const database = await checkDatabase();

  return {
    status: database === 'up' ? 'ok' : 'degraded',
    version: APP_VERSION,
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: { database },
  };
};

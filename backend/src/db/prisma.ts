import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { isProduction, isTest } from '../config/env';

/**
 * The Prisma client singleton.
 *
 * Nothing connects at import time — the first query opens the pool — so the API
 * still boots and reports honestly when the database is unavailable.
 */
export const prisma = new PrismaClient({
  log: isProduction ? ['warn', 'error'] : isTest ? [] : ['warn', 'error'],
});

export type Prisma = typeof prisma;

/** A transaction handle. Services accept this so callers can compose one transaction. */
export type TransactionClient = Parameters<Parameters<Prisma['$transaction']>[0]>[0];

/** Either the singleton or an open transaction — the shape every service takes. */
export type Db = Prisma | TransactionClient;

export type DatabaseStatus = 'up' | 'down' | 'not_configured';

/** A probe must answer fast; Prisma's own connect timeout is far too long for one. */
const PROBE_TIMEOUT_MS = 1_500;
/** Repeated polling (the topbar indicator refetches) must not hammer the database. */
const PROBE_CACHE_MS = 5_000;

let lastProbe: { status: DatabaseStatus; at: number } | null = null;

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`probe timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/** A cheap liveness probe used by the health endpoint. */
export const checkDatabase = async (): Promise<DatabaseStatus> => {
  if (lastProbe && Date.now() - lastProbe.at < PROBE_CACHE_MS) {
    return lastProbe.status;
  }

  const record = (status: DatabaseStatus): DatabaseStatus => {
    lastProbe = { status, at: Date.now() };
    return status;
  };

  try {
    await withTimeout(prisma.$queryRawUnsafe('SELECT 1'), PROBE_TIMEOUT_MS);
    return record('up');
  } catch (error) {
    logger.debug({ err: error instanceof Error ? error.message : error }, 'database probe failed');
    return record('down');
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  lastProbe = null;
  await prisma.$disconnect().catch(() => undefined);
};

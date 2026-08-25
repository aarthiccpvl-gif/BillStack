import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/http';
import { ServiceUnavailableError } from '../../utils/errors';
import { getHealth } from './health.service';

/**
 * Liveness: always 200 while the process can answer. Deliberately separate from
 * readiness, so a database outage does not make an otherwise healthy process look
 * dead to a restart-happy orchestrator.
 */
export const health = async (_req: Request, res: Response): Promise<void> => {
  sendSuccess(res, await getHealth());
};

/** Readiness: fails while a dependency the API genuinely needs is unavailable. */
export const ready = async (_req: Request, res: Response): Promise<void> => {
  const payload = await getHealth();

  if (payload.checks.database !== 'up') {
    throw new ServiceUnavailableError(`Database is ${payload.checks.database.replace('_', ' ')}.`);
  }

  sendSuccess(res, payload);
};

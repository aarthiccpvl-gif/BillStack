import { expireOverdueQuotations } from '../modules/quotations/quotations.lifecycle';
import { logger } from '../utils/logger';

/**
 * The daily job.
 *
 * There is exactly one thing to do, and it is worth saying why the obvious second
 * thing is absent: **overdue is not stamped**. An invoice is overdue when its due
 * date has passed and it has not been settled, which is computed on every read —
 * so it is correct on a Monday whether or not anything ran over the weekend.
 *
 * A quotation is different. `EXPIRED` is a real, stored status a user can act on
 * and move out of, so something has to write it; the read path still derives
 * `isExpired` independently, which means a missed run makes the list slightly
 * stale rather than wrong.
 *
 * Scheduled in-process rather than by cron: this is a single-instance internal
 * application, and an operations story that needs a second moving part to keep
 * a status accurate is a worse trade than a timer.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DailyJobResult {
  expiredQuotations: number;
  ranAt: string;
}

export const runDailyJob = async (): Promise<DailyJobResult> => {
  const started = Date.now();

  try {
    const expiredQuotations = await expireOverdueQuotations();

    logger.info(
      { expiredQuotations, ms: Date.now() - started },
      expiredQuotations > 0 ? 'daily job: quotations expired' : 'daily job: nothing to do',
    );

    return { expiredQuotations, ranAt: new Date().toISOString() };
  } catch (error) {
    /* A failed run must not take the process with it; tomorrow's run will catch up,
       and the derived flags mean nothing is wrong in the meantime. */
    logger.error({ err: error }, 'daily job failed');
    return { expiredQuotations: 0, ranAt: new Date().toISOString() };
  }
};

let timer: NodeJS.Timeout | null = null;

/** Milliseconds until the next 02:00 local time. */
const untilNextRun = (): number => {
  const now = new Date();
  const next = new Date(now);
  next.setHours(2, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
};

/**
 * Starts the schedule: once shortly after boot so a long-stopped instance catches
 * up, then every night at 02:00.
 */
export const startDailyJob = (): void => {
  if (timer) return;

  const catchUp = setTimeout(() => void runDailyJob(), 30_000);
  catchUp.unref();

  const schedule = () => {
    timer = setTimeout(() => {
      void runDailyJob().finally(schedule);
    }, untilNextRun());
    timer.unref();
  };

  schedule();
  logger.info({ nextRunInMs: untilNextRun(), everyMs: DAY_MS }, 'daily job scheduled');
};

export const stopDailyJob = (): void => {
  if (timer) clearTimeout(timer);
  timer = null;
};

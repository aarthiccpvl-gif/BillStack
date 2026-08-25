import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithContext } from '../utils/request-context';

/**
 * Establishes the ambient request context and echoes the correlation id back, so
 * a user reporting a problem can quote the same id that appears in the logs.
 */
export const requestContextMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.header('x-request-id');
  const requestId = incoming && incoming.length <= 64 ? incoming : randomUUID();

  res.setHeader('x-request-id', requestId);

  runWithContext(
    {
      requestId,
      ip: req.ip,
      userAgent: req.header('user-agent')?.slice(0, 255),
    },
    () => next(),
  );
};

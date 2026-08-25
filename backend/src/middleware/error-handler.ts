import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ERROR_CODES, type ApiErrorBody, type ApiErrorDetail } from '@app/shared';
import { AppError, NotFoundError, isAppError } from '../utils/errors';
import { sendFailure } from '../utils/http';
import { getRequestId } from '../utils/request-context';
import { logger } from '../utils/logger';
import { isProduction } from '../config/env';

/** Anything that reaches the router without matching a route. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl}`));
};

const zodToDetails = (error: ZodError): ApiErrorDetail[] =>
  error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

/** Maps Prisma's error codes onto ours without importing Prisma into every service. */
const fromPrismaCode = (code: string): AppError | null => {
  switch (code) {
    case 'P2002':
      return new AppError(ERROR_CODES.DUPLICATE_RESOURCE, 409);
    case 'P2025':
      return new AppError(ERROR_CODES.NOT_FOUND, 404);
    case 'P2003':
      return new AppError(ERROR_CODES.INVALID_REFERENCE, 422);
    default:
      return null;
  }
};

const normalise = (error: unknown): AppError => {
  if (isAppError(error)) return error;

  if (error instanceof ZodError) {
    return new AppError(ERROR_CODES.VALIDATION_ERROR, 422, undefined, zodToDetails(error));
  }

  if (error && typeof error === 'object' && 'code' in error) {
    const { code } = error as { code?: unknown };
    if (typeof code === 'string') {
      const mapped = fromPrismaCode(code);
      if (mapped) return mapped;
    }
  }

  // Malformed JSON bodies surface as a SyntaxError from the body parser.
  if (error instanceof SyntaxError && 'body' in error) {
    return new AppError(ERROR_CODES.VALIDATION_ERROR, 400, 'The request body is not valid JSON.');
  }

  return new AppError(
    ERROR_CODES.INTERNAL_ERROR,
    500,
    undefined,
    undefined,
    false /* unexpected */,
  );
};

/**
 * The single exit point for every failure. Stack traces are logged, never sent;
 * the client gets a stable code, a readable message and the correlation id.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const appError = normalise(error);
  const requestId = getRequestId();

  if (appError.isExpected) {
    logger.warn(
      { requestId, code: appError.code, status: appError.httpStatus, message: appError.message },
      'request failed',
    );
  } else {
    logger.error({ requestId, err: error }, 'unhandled error');
  }

  const body: ApiErrorBody = {
    code: appError.code,
    message: appError.message,
    ...(appError.details ? { details: appError.details } : {}),
    ...(requestId ? { requestId } : {}),
  };

  // In development the original message is far more useful than a generic one.
  if (!appError.isExpected && !isProduction && error instanceof Error) {
    body.message = error.message;
  }

  if (res.headersSent) return;
  sendFailure(res, appError.httpStatus, body);
};

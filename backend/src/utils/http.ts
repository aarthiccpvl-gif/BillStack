import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiErrorBody, ApiSuccess, PaginationMeta } from '@app/shared';

/**
 * The only two functions that write a response body. Controllers never assemble
 * an envelope by hand, which is what keeps the API shape uniform.
 */

export const sendSuccess = <T>(
  res: Response,
  data: T,
  options: { status?: number; meta?: ApiSuccess<T>['meta'] } = {},
): void => {
  const body: ApiSuccess<T> = { success: true, data };
  if (options.meta) body.meta = options.meta;
  res.status(options.status ?? 200).json(body);
};

export const sendFailure = (res: Response, status: number, error: ApiErrorBody): void => {
  res.status(status).json({ success: false, error });
};

export const paginationMeta = (page: number, pageSize: number, total: number): PaginationMeta => ({
  page,
  pageSize,
  total,
  totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
});

/**
 * Wraps an async handler so a rejected promise reaches the error middleware
 * instead of hanging the request. Every async route is registered through this.
 */
export const asyncHandler =
  <T extends RequestHandler>(handler: T): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };

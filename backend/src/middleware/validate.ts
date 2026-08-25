import type { Request, RequestHandler, Response } from 'express';
import type { ZodError, ZodTypeAny, z } from 'zod';
import type { ApiErrorDetail } from '@app/shared';
import { ValidationError } from '../utils/errors';

/**
 * Request validation.
 *
 * The parsed result replaces the raw input, so a handler downstream can only see
 * values that passed the schema. That is also the mechanism by which fields the API
 * refuses to accept — totals, document numbers, status — are stripped rather than
 * merely ignored.
 *
 * Express 4 exposes `req.query` and `req.params` through prototype getters with no
 * setter, so parsed values are published on `res.locals` instead of overwriting them.
 */

const toDetails = (error: ZodError): ApiErrorDetail[] =>
  error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));

export const validateBody =
  <T extends ZodTypeAny>(schema: T): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new ValidationError(undefined, toDetails(result.error)));
      return;
    }
    req.body = result.data as unknown;
    next();
  };

export const validateQuery =
  <T extends ZodTypeAny>(schema: T): RequestHandler =>
  (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new ValidationError('Some of the filters are not valid.', toDetails(result.error)));
      return;
    }
    res.locals.query = result.data;
    next();
  };

export const validateParams =
  <T extends ZodTypeAny>(schema: T): RequestHandler =>
  (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(new ValidationError('That address is not valid.', toDetails(result.error)));
      return;
    }
    res.locals.params = result.data;
    next();
  };

/** Reads the value produced by validateQuery, typed by the same schema. */
export const parsedQuery = <T extends ZodTypeAny>(res: Response, _schema: T): z.infer<T> =>
  res.locals.query as z.infer<T>;

/** Reads the value produced by validateParams, typed by the same schema. */
export const parsedParams = <T extends ZodTypeAny>(res: Response, _schema: T): z.infer<T> =>
  res.locals.params as z.infer<T>;

/** Typed access to a body already validated by validateBody. */
export const parsedBody = <T extends ZodTypeAny>(req: Request, _schema: T): z.infer<T> =>
  req.body as z.infer<T>;

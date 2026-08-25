import { ERROR_CODES, ERROR_MESSAGES, type ApiErrorDetail, type ErrorCode } from '@app/shared';

/**
 * Every failure the API reports deliberately is one of these. The error handler
 * maps them to the response envelope; nothing else decides a status code.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly details?: ApiErrorDetail[];
  /** false for genuinely unexpected failures, which are logged at error level. */
  public readonly isExpected: boolean;

  constructor(
    code: ErrorCode,
    httpStatus: number,
    message?: string,
    details?: ApiErrorDetail[],
    isExpected = true,
  ) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    this.isExpected = isExpected;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message?: string, details?: ApiErrorDetail[]) {
    super(ERROR_CODES.VALIDATION_ERROR, 422, message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message?: string) {
    super(ERROR_CODES.UNAUTHENTICATED, 401, message);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message?: string) {
    super(ERROR_CODES.INVALID_CREDENTIALS, 401, message);
  }
}

export class AccountLockedError extends AppError {
  constructor(message?: string) {
    super(ERROR_CODES.ACCOUNT_LOCKED, 423, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message?: string) {
    super(ERROR_CODES.FORBIDDEN, 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource?: string) {
    super(ERROR_CODES.NOT_FOUND, 404, resource ? `${resource} was not found.` : undefined);
  }
}

export class ConflictError extends AppError {
  constructor(message?: string, code: ErrorCode = ERROR_CODES.DUPLICATE_RESOURCE) {
    super(code, 409, message);
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, code: ErrorCode = ERROR_CODES.BUSINESS_RULE_ERROR) {
    super(code, 422, message);
  }
}

export class ImmutableResourceError extends AppError {
  constructor(message?: string) {
    super(ERROR_CODES.IMMUTABLE_RESOURCE, 422, message);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message?: string, code: ErrorCode = ERROR_CODES.SERVICE_UNAVAILABLE) {
    super(code, 503, message);
  }
}

export class InternalError extends AppError {
  constructor(message?: string) {
    super(ERROR_CODES.INTERNAL_ERROR, 500, message, undefined, false);
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

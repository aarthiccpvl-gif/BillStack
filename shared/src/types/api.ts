import type { ErrorCode } from '../constants/errorCodes';

/** One field-level problem, addressed by its path in the submitted payload. */
export interface ApiErrorDetail {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: ApiErrorDetail[];
  /** Correlation id a user can quote; the stack trace never leaves the server. */
  requestId?: string;
}

/* A type alias rather than an interface: only aliases carry an implicit index
   signature, which is what lets a meta object also satisfy Record<string, unknown>
   when an endpoint adds extra keys alongside the paging figures. */
export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta & Record<string, unknown>;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export const isApiSuccess = <T>(envelope: ApiEnvelope<T>): envelope is ApiSuccess<T> =>
  envelope.success;

/** Shape of a paginated list response, used by every list endpoint. */
export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface HealthPayload {
  status: 'ok' | 'degraded';
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: 'up' | 'down' | 'not_configured';
  };
}

import type { AxiosError } from 'axios';
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import {
  ERROR_CODES,
  type ApiEnvelope,
  type ApiErrorDetail,
  type ErrorCode,
  type PaginationMeta,
} from '@app/shared';

/**
 * The one HTTP client. Two jobs beyond transport:
 *
 *  1. Unwrap the success envelope so callers receive `data` directly.
 *  2. Normalise every failure into ApiError, so components and forms never have
 *     to guess at the shape of what went wrong.
 *
 * Requests go to the same origin and are proxied to the API by Vite in
 * development, which keeps the httpOnly auth cookies working without CORS.
 */

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ApiErrorDetail[];
  readonly requestId?: string;

  constructor(params: {
    code: ErrorCode;
    status: number;
    message: string;
    details?: ApiErrorDetail[];
    requestId?: string;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.code = params.code;
    this.status = params.status;
    this.details = params.details ?? [];
    this.requestId = params.requestId;
  }

  /** True when the user simply is not signed in — the app redirects rather than toasts. */
  get isUnauthenticated(): boolean {
    return this.code === ERROR_CODES.UNAUTHENTICATED;
  }

  /** True when the API refused the action; the Finance Viewer sees this on writes. */
  get isForbidden(): boolean {
    return this.code === ERROR_CODES.FORBIDDEN;
  }

  /** Field errors keyed by path, ready to hand to react-hook-form's setError. */
  fieldErrors(): Record<string, string> {
    return this.details.reduce<Record<string, string>>((acc, detail) => {
      if (detail.path) acc[detail.path] = detail.message;
      return acc;
    }, {});
  }
}

/**
 * Where the API lives.
 *
 * The default — and the right answer in development and in the single-service
 * deployment alike — is the relative `/api`: Vite proxies it to the backend, and
 * in production the same Express process serves both. Same origin is not a
 * detail here, it is what makes the httpOnly `SameSite=Lax` session cookies work
 * at all; point this at another origin and the browser will simply not send them.
 *
 * `VITE_API_URL` stays as an escape hatch for a genuinely separate API host, and
 * must then include the `/api` path. A bare origin gets `/api` appended rather
 * than silently producing `POST /auth/login`, which the API does not serve.
 */
const resolveBaseUrl = (): string => {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (!configured) return '/api';

  const withoutTrailingSlash = configured.replace(/\/+$/, '');
  const hasPath = /^https?:\/\/[^/]+\/.+/i.test(withoutTrailingSlash) || configured.startsWith('/');

  const baseUrl = hasPath ? withoutTrailingSlash : `${withoutTrailingSlash}/api`;

  if (import.meta.env.DEV && !baseUrl.startsWith('/')) {
    console.warn(
      `[api] VITE_API_URL points at ${baseUrl}. Sign-in cookies are SameSite=Lax, so they are ` +
        'not sent cross-origin — remove the variable to use the Vite proxy instead.',
    );
  }

  return baseUrl;
};

export const http: AxiosInstance = axios.create({
  baseURL: resolveBaseUrl(),
  withCredentials: true,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    /* Paired with SameSite=Lax cookies, this header is the CSRF check. */
    'X-Requested-With': 'XMLHttpRequest',
  },
});

const toApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) return error;

  const axiosError = error as AxiosError<ApiEnvelope<unknown>>;
  const status = axiosError.response?.status ?? 0;
  const body = axiosError.response?.data;

  if (body && typeof body === 'object' && 'error' in body && body.error) {
    return new ApiError({
      code: body.error.code,
      status,
      message: body.error.message,
      details: body.error.details,
      requestId: body.error.requestId,
    });
  }

  if (axiosError.code === 'ECONNABORTED') {
    return new ApiError({
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      status: 0,
      message: 'The request timed out. Please try again.',
    });
  }

  return new ApiError({
    code: status === 0 ? ERROR_CODES.SERVICE_UNAVAILABLE : ERROR_CODES.INTERNAL_ERROR,
    status,
    message:
      status === 0
        ? 'Cannot reach the server. Check that the API is running.'
        : 'Something went wrong. Please try again.',
  });
};

/**
 * 401 → refresh once → retry.
 *
 * The access token lives 15 minutes, so an idle tab will hit an expired one. A
 * single in-flight refresh is shared by every request that fails at the same
 * moment, and each request is retried at most once — a refresh that itself fails
 * must not become a loop.
 */
const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

let refreshInFlight: Promise<void> | null = null;

const refreshSession = (): Promise<void> => {
  refreshInFlight ??= http
    .post('/auth/refresh')
    .then(() => undefined)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
};

http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const axiosError = error as AxiosError & {
      config?: AxiosRequestConfig & { _retried?: boolean };
    };
    const config = axiosError.config;
    const url = config?.url ?? '';

    const shouldRefresh =
      axiosError.response?.status === 401 &&
      config !== undefined &&
      !config._retried &&
      !AUTH_PATHS.some((path) => url.startsWith(path));

    if (shouldRefresh) {
      try {
        await refreshSession();
        config._retried = true;
        return await http.request(config);
      } catch {
        /* The refresh failed too — fall through and report the original 401. */
      }
    }

    return Promise.reject(toApiError(error));
  },
);

/** Unwraps the envelope. Phase 2 adds the 401 → refresh → retry-once step here. */
const request = async <T>(config: AxiosRequestConfig): Promise<T> => {
  const response = await http.request<ApiEnvelope<T>>(config);
  const body = response.data;

  if (!body.success) {
    throw new ApiError({
      code: body.error.code,
      status: response.status,
      message: body.error.message,
      details: body.error.details,
      requestId: body.error.requestId,
    });
  }

  return body.data;
};

/** Like `request`, but keeps the paging metadata a list endpoint returns alongside the rows. */
const requestPaginated = async <T>(
  config: AxiosRequestConfig,
): Promise<{ items: T[]; meta: PaginationMeta }> => {
  const response = await http.request<ApiEnvelope<T[]>>(config);
  const body = response.data;

  if (!body.success) {
    throw new ApiError({
      code: body.error.code,
      status: response.status,
      message: body.error.message,
      details: body.error.details,
      requestId: body.error.requestId,
    });
  }

  return {
    items: body.data,
    meta: (body.meta as PaginationMeta | undefined) ?? {
      page: 1,
      pageSize: body.data.length,
      total: body.data.length,
      totalPages: 1,
    },
  };
};

export const apiClient = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'GET', url }),
  getPaginated: <T>(url: string, params?: Record<string, unknown>) =>
    requestPaginated<T>({ method: 'GET', url, params }),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'POST', url, data }),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PATCH', url, data }),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'DELETE', url }),
};

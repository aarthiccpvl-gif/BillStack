import { z } from 'zod';

/**
 * Query conventions shared by every list endpoint, so paging, sorting and searching
 * behave identically across the application — and so the frontend can build a query
 * string from the same definition the API validates against.
 */

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  /** "documentDate" ascending, "-documentDate" descending. */
  sort: z.string().trim().max(60).optional(),
  search: z.string().trim().max(120).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** Documents use BigInt ids, which stay strings on the wire. */
export const documentIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Not a valid id'),
});

/** Turns "-documentDate" into { field, direction }, restricted to a whitelist. */
export const parseSort = <T extends string>(
  sort: string | undefined,
  allowed: readonly T[],
  fallback: { field: T; direction: 'asc' | 'desc' },
): { field: T; direction: 'asc' | 'desc' } => {
  if (!sort) return fallback;

  const direction = sort.startsWith('-') ? 'desc' : 'asc';
  const field = (sort.startsWith('-') ? sort.slice(1) : sort) as T;

  return allowed.includes(field) ? { field, direction } : fallback;
};

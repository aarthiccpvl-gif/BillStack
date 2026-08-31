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

/**
 * An optional free-text field.
 *
 * Accepts a string, an empty string, `undefined` **or `null`**, and always
 * produces `null` for "nothing". Null matters: the API returns null for an empty
 * field, so a client that reads a record and sends it straight back — which every
 * edit form does — must not be told its own data is invalid.
 */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value === '' || value == null ? null : value));

/**
 * An optional value that must match a pattern whenever it is actually given.
 *
 * `''`, `null` and `undefined` all mean "not given" and all become `null`. The
 * `null` branch is the one that is easy to leave out and expensive to omit: a
 * form's empty value for a cleared field is `null`, and a bare `.optional()`
 * rejects it. That failure sinks the whole object — and a Zod `.refine()` never
 * runs on an object that already failed, so the message the user actually needed
 * ("a registered business needs a GSTIN") never appears either.
 */
export const optionalPattern = (schema: z.ZodType<string, z.ZodTypeDef, string>) =>
  z
    .union([z.literal(''), schema])
    .nullish()
    .transform((value): string | null => (value === '' || value == null ? null : value));

/** The same tolerance for an optional email address. */
export const optionalEmail = z
  .union([z.literal(''), z.string().trim().email('Enter a valid email address').max(190)])
  .nullish()
  .transform((value) => (value === '' || value == null ? null : value));

/**
 * An optional reference to another record.
 *
 * A `<select>` with nothing chosen submits an empty string, and `z.coerce.number()`
 * turns that into 0 — which then fails `.positive()` and tells the user their
 * blank optional field is invalid. Treating '' as "none" is what the control
 * actually means.
 */
export const optionalId = z
  .union([z.literal(''), z.coerce.number().int().positive()])
  .nullish()
  .transform((value) => (value === '' || value == null ? null : value));

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

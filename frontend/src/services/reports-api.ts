import type { AuditLogEntry, AuditLogRow, ReportResult } from '@app/shared';
import { apiClient, http } from './api-client';

export interface ReportParams {
  dateFrom?: string;
  dateTo?: string;
  customerId?: number;
  currencyCode?: string;
  status?: string;
  createdById?: number;
  search?: string;
  outstandingOnly?: string;
  [key: string]: unknown;
}

export interface AuditParams extends ReportParams {
  page: number;
  pageSize: number;
  userId?: number;
  action?: string;
  entityType?: string;
}

/** Drops empty values so the URL carries only what was actually chosen. */
const toQuery = (params: Record<string, unknown>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== null) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const reportsApi = {
  run: (kind: string, params: ReportParams) =>
    apiClient.get<ReportResult>(`/reports/${kind}${toQuery(params)}`),

  /**
   * The export takes the same query the report took.
   *
   * Fetched as a blob rather than followed as a link, so the client's
   * refresh-once interceptor still applies and an expired token produces a retry
   * rather than a JSON error page where a spreadsheet should be.
   */
  export: async (
    kind: string,
    format: 'csv' | 'xlsx' | 'pdf',
    params: ReportParams,
  ): Promise<{ blob: Blob; fileName: string }> => {
    const response = await http.get<Blob>(`/export/${kind}${toQuery({ ...params, format })}`, {
      responseType: 'blob',
      /* A five-thousand-row spreadsheet takes longer than an ordinary request. */
      timeout: 120_000,
    });

    const disposition = String(response.headers['content-disposition'] ?? '');
    const match = /filename="?([^"]+)"?/.exec(disposition);

    return { blob: response.data, fileName: match?.[1] ?? `${kind}.${format}` };
  },
};

export const auditApi = {
  list: (params: AuditParams) => apiClient.getPaginated<AuditLogRow>('/audit-logs', params),
  entry: (id: string) => apiClient.get<AuditLogEntry>(`/audit-logs/entry/${id}`),
  forEntity: (entityType: string, entityId: string) =>
    apiClient.get<AuditLogEntry[]>(`/audit-logs/${entityType}/${entityId}`),
};

export const reportKeys = {
  all: ['reports'] as const,
  report: (kind: string, params: ReportParams) => [...reportKeys.all, kind, params] as const,
};

export const auditKeys = {
  all: ['audit-logs'] as const,
  list: (params: AuditParams) => [...auditKeys.all, 'list', params] as const,
  entry: (id: string) => [...auditKeys.all, 'entry', id] as const,
  entity: (type: string, id: string) => [...auditKeys.all, 'entity', type, id] as const,
};

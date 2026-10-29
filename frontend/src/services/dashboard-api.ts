import type { DashboardCharts, DashboardSummary, RecentDocument, SearchResults } from '@app/shared';
import { apiClient, http } from './api-client';

/** `ALL` is sent explicitly; the API treats a missing year as "current". */
const withYear = (path: string, selection?: number | 'ALL'): string => {
  const value = selection === 'ALL' ? 'all' : selection;
  return value === undefined
    ? path
    : `${path}${path.includes('?') ? '&' : '?'}financialYearId=${value}`;
};

export const dashboardApi = {
  summary: (selection?: number | 'ALL') =>
    apiClient.get<DashboardSummary>(withYear('/dashboard/summary', selection)),
  charts: (range: 'FY' | '12M', selection?: number | 'ALL') =>
    apiClient.get<DashboardCharts>(withYear(`/dashboard/charts?range=${range}`, selection)),
  recent: (limit = 8, selection?: number | 'ALL') =>
    apiClient.get<RecentDocument[]>(
      withYear(`/dashboard/recent-documents?limit=${limit}`, selection),
    ),
  search: (query: string) => apiClient.get<SearchResults>(`/search?q=${encodeURIComponent(query)}`),
};

export const downloadsApi = {
  /**
   * Bulk PDF download.
   *
   * A POST that returns a file, so it cannot go through the JSON envelope: the
   * archive is streamed straight into a blob and handed to the browser.
   */
  bulkPdf: async (
    type: 'QUOTATION' | 'INVOICE',
    ids: string[],
  ): Promise<{ blob: Blob; fileName: string }> => {
    const response = await http.post<Blob>(
      '/export/documents/bulk-pdf',
      { type, ids },
      { responseType: 'blob' },
    );

    const disposition = String(response.headers['content-disposition'] ?? '');
    const match = /filename="?([^"]+)"?/.exec(disposition);

    return { blob: response.data, fileName: match?.[1] ?? 'documents.zip' };
  },
};

export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: (selection?: number | 'ALL') =>
    [...dashboardKeys.all, 'summary', selection ?? 'default'] as const,
  charts: (range: string, selection?: number | 'ALL') =>
    [...dashboardKeys.all, 'charts', range, selection ?? 'default'] as const,
  recent: (limit: number, selection?: number | 'ALL') =>
    [...dashboardKeys.all, 'recent', limit, selection ?? 'default'] as const,
  search: (query: string) => ['search', query] as const,
};

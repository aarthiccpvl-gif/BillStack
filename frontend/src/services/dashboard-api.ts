import type { DashboardCharts, DashboardSummary, RecentDocument, SearchResults } from '@app/shared';
import { apiClient, http } from './api-client';

export const dashboardApi = {
  summary: () => apiClient.get<DashboardSummary>('/dashboard/summary'),
  charts: (range: 'FY' | '12M') =>
    apiClient.get<DashboardCharts>(`/dashboard/charts?range=${range}`),
  recent: (limit = 8) =>
    apiClient.get<RecentDocument[]>(`/dashboard/recent-documents?limit=${limit}`),
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
  summary: () => [...dashboardKeys.all, 'summary'] as const,
  charts: (range: string) => [...dashboardKeys.all, 'charts', range] as const,
  recent: (limit: number) => [...dashboardKeys.all, 'recent', limit] as const,
  search: (query: string) => ['search', query] as const,
};

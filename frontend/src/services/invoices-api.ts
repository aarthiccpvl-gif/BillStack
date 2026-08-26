import type {
  CreateInvoiceInput,
  DocumentRevisionRecord,
  InvoiceListRow,
  InvoiceRecord,
  InvoiceStatusInput,
  PaymentUpdateInput,
  ShareLinkRecord,
  UpdateInvoiceInput,
} from '@app/shared';
import { apiClient, http } from './api-client';

export interface InvoiceListParams {
  page: number;
  pageSize: number;
  sort?: string;
  search?: string;
  status?: string;
  customerId?: number;
  currencyCode?: string;
  dateFrom?: string;
  dateTo?: string;
  [key: string]: unknown;
}

export const invoicesApi = {
  list: (params: InvoiceListParams) => apiClient.getPaginated<InvoiceListRow>('/invoices', params),
  get: (id: string) => apiClient.get<InvoiceRecord>(`/invoices/${id}`),
  create: (input: CreateInvoiceInput) => apiClient.post<InvoiceRecord>('/invoices', input),
  update: (id: string, input: UpdateInvoiceInput) =>
    apiClient.patch<InvoiceRecord>(`/invoices/${id}`, input),
  remove: (id: string) => apiClient.delete<{ deleted: boolean }>(`/invoices/${id}`),

  issue: (id: string) => apiClient.post<InvoiceRecord>(`/invoices/${id}/issue`),
  changeStatus: (id: string, input: InvoiceStatusInput) =>
    apiClient.post<InvoiceRecord>(`/invoices/${id}/status`, input),
  cancel: (id: string, reason: string) =>
    apiClient.post<InvoiceRecord>(`/invoices/${id}/cancel`, { reason }),
  void: (id: string, reason: string) =>
    apiClient.post<InvoiceRecord>(`/invoices/${id}/void`, { reason }),
  recordPayment: (id: string, input: PaymentUpdateInput) =>
    apiClient.post<InvoiceRecord>(`/invoices/${id}/payment`, input),
  duplicate: (id: string) => apiClient.post<InvoiceRecord>(`/invoices/${id}/duplicate`),

  history: (id: string) => apiClient.get<DocumentRevisionRecord[]>(`/invoices/${id}/history`),

  shareLinks: (id: string) => apiClient.get<ShareLinkRecord[]>(`/invoices/${id}/share-links`),
  createShareLink: (id: string, expiresInDays?: number) =>
    apiClient.post<ShareLinkRecord>(`/invoices/${id}/share-links`, { expiresInDays }),
  revokeShareLink: (id: string, shareId: string) =>
    apiClient.delete<{ revoked: boolean }>(`/invoices/${id}/share-links/${shareId}`),

  /** Raw HTML for the preview pane — the same markup the PDF is made from. */
  previewHtml: async (id: string): Promise<string> => {
    const response = await http.get<string>(`/invoices/${id}/preview`, {
      responseType: 'text',
      transformResponse: [(data: string) => data],
    });
    return response.data;
  },

  /**
   * Fetches the PDF as a blob rather than pointing a link at the API.
   *
   * A plain <a href> would bypass the client's refresh-once interceptor, so an
   * expired access token would hand the user a JSON error page instead of a file.
   */
  downloadPdf: async (id: string): Promise<{ blob: Blob; fileName: string }> => {
    const response = await http.get<Blob>(`/invoices/${id}/pdf`, { responseType: 'blob' });
    const disposition = String(response.headers['content-disposition'] ?? '');
    const match = /filename="?([^"]+)"?/.exec(disposition);

    return { blob: response.data, fileName: match?.[1] ?? `invoice-${id}.pdf` };
  },
};

export const invoiceKeys = {
  all: ['invoices'] as const,
  list: (params: InvoiceListParams) => [...invoiceKeys.all, 'list', params] as const,
  detail: (id: string) => [...invoiceKeys.all, 'detail', id] as const,
  history: (id: string) => [...invoiceKeys.all, 'history', id] as const,
  shares: (id: string) => [...invoiceKeys.all, 'shares', id] as const,
};

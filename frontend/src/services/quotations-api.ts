import type {
  ConvertQuotationInput,
  CreateQuotationInput,
  DocumentAttachmentRecord,
  DocumentRevisionRecord,
  InvoiceRecord,
  QuotationListRow,
  QuotationRecord,
  QuotationStatusInput,
  ShareLinkRecord,
  UpdateQuotationInput,
} from '@app/shared';
import { apiClient, http } from './api-client';

export interface QuotationListParams {
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

export const quotationsApi = {
  list: (params: QuotationListParams) =>
    apiClient.getPaginated<QuotationListRow>('/quotations', params),
  get: (id: string) => apiClient.get<QuotationRecord>(`/quotations/${id}`),
  create: (input: CreateQuotationInput) => apiClient.post<QuotationRecord>('/quotations', input),
  update: (id: string, input: UpdateQuotationInput) =>
    apiClient.patch<QuotationRecord>(`/quotations/${id}`, input),
  remove: (id: string) => apiClient.delete<{ deleted: boolean }>(`/quotations/${id}`),

  changeStatus: (id: string, input: QuotationStatusInput) =>
    apiClient.post<QuotationRecord>(`/quotations/${id}/status`, input),
  duplicate: (id: string) => apiClient.post<QuotationRecord>(`/quotations/${id}/duplicate`),

  /** Returns the new invoice; the quotation becomes CONVERTED in the same call. */
  convert: (id: string, input: ConvertQuotationInput) =>
    apiClient.post<InvoiceRecord>(`/quotations/${id}/convert`, input),

  history: (id: string) => apiClient.get<DocumentRevisionRecord[]>(`/quotations/${id}/history`),

  attachments: (id: string) =>
    apiClient.get<DocumentAttachmentRecord[]>(`/quotations/${id}/attachments`),
  uploadAttachment: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    /* Let the browser set the multipart boundary — overriding Content-Type breaks it. */
    return apiClient.post<DocumentAttachmentRecord>(`/quotations/${id}/attachments`, form, {
      headers: { 'Content-Type': undefined },
    });
  },
  deleteAttachment: (id: string, fileId: string) =>
    apiClient.delete<{ removed: boolean }>(`/quotations/${id}/attachments/${fileId}`),
  downloadAttachment: async (
    id: string,
    fileId: string,
  ): Promise<{ blob: Blob; fileName: string | null }> => {
    const response = await http.get<Blob>(`/quotations/${id}/attachments/${fileId}`, {
      responseType: 'blob',
    });
    const disposition = String(response.headers['content-disposition'] ?? '');
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const encoded = match?.[1];
    let fileName: string | null = encoded ?? null;
    if (encoded) {
      try {
        fileName = decodeURIComponent(encoded);
      } catch {
        fileName = encoded;
      }
    }
    return { blob: response.data, fileName };
  },

  shareLinks: (id: string) => apiClient.get<ShareLinkRecord[]>(`/quotations/${id}/share-links`),
  createShareLink: (id: string, expiresInDays?: number) =>
    apiClient.post<ShareLinkRecord>(`/quotations/${id}/share-links`, { expiresInDays }),
  revokeShareLink: (id: string, shareId: string) =>
    apiClient.delete<{ revoked: boolean }>(`/quotations/${id}/share-links/${shareId}`),

  /** Raw HTML for the preview pane — the same markup the PDF is made from. */
  previewHtml: async (id: string): Promise<string> => {
    const response = await http.get<string>(`/quotations/${id}/preview`, {
      responseType: 'text',
      transformResponse: [(data: string) => data],
    });
    return response.data;
  },

  generatePdf: (id: string) =>
    apiClient.post<{ fileId: string; fileName: string; sizeBytes: number; cached: boolean }>(
      `/quotations/${id}/pdf`,
    ),

  /**
   * Fetches the PDF as a blob rather than pointing a link at the API.
   *
   * A plain <a href> would bypass the client's refresh-once interceptor, so an
   * expired access token would hand the user a JSON error page instead of a file.
   */
  downloadPdf: async (id: string): Promise<{ blob: Blob; fileName: string }> => {
    const response = await http.get<Blob>(`/quotations/${id}/pdf`, { responseType: 'blob' });
    const disposition = String(response.headers['content-disposition'] ?? '');
    const match = /filename="?([^"]+)"?/.exec(disposition);

    return { blob: response.data, fileName: match?.[1] ?? `quotation-${id}.pdf` };
  },
};

export const quotationKeys = {
  all: ['quotations'] as const,
  list: (params: QuotationListParams) => [...quotationKeys.all, 'list', params] as const,
  detail: (id: string) => [...quotationKeys.all, 'detail', id] as const,
  history: (id: string) => [...quotationKeys.all, 'history', id] as const,
  attachments: (id: string) => [...quotationKeys.all, 'attachments', id] as const,
  shares: (id: string) => [...quotationKeys.all, 'shares', id] as const,
};

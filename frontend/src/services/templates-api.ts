import type { TemplateConfig, TemplateRecord } from '@app/shared';
import { apiClient, http } from './api-client';

export interface LayoutOption {
  key: string;
  name: string;
  description: string;
}

export interface PreviewRequest {
  docType: 'QUOTATION' | 'INVOICE';
  templateId?: number;
  version?: number;
  engineKey?: string;
  config?: TemplateConfig;
  lineCount?: number;
}

export const templatesApi = {
  list: (docType?: 'QUOTATION' | 'INVOICE') =>
    apiClient.get<TemplateRecord[]>(`/templates${docType ? `?docType=${docType}` : ''}`),
  get: (id: number) => apiClient.get<TemplateRecord>(`/templates/${id}`),
  layouts: () => apiClient.get<LayoutOption[]>('/templates/layouts'),

  versionConfig: (id: number, version: number) =>
    apiClient.get<TemplateConfig>(`/templates/${id}/versions/${version}/config`),

  create: (input: {
    name: string;
    docType: 'QUOTATION' | 'INVOICE';
    engineKey: string;
    description?: string | null;
  }) => apiClient.post<TemplateRecord>('/templates', input),

  duplicate: (id: number) => apiClient.post<TemplateRecord>(`/templates/${id}/duplicate`),
  setDefault: (id: number) => apiClient.post<TemplateRecord>(`/templates/${id}/set-default`),

  createDraft: (id: number, changeNote?: string | null) =>
    apiClient.post<TemplateRecord>(`/templates/${id}/versions`, { changeNote }),

  saveConfig: (id: number, version: number, config: TemplateConfig) =>
    apiClient.patch<TemplateRecord>(`/templates/${id}/versions/${version}`, config),

  publish: (id: number, version: number) =>
    apiClient.post<TemplateRecord>(`/templates/${id}/versions/${version}/publish`),

  /** Returns raw HTML, not the JSON envelope — it goes straight into an iframe. */
  previewHtml: async (input: PreviewRequest): Promise<string> => {
    const response = await http.post<string>('/templates/preview', input, {
      responseType: 'text',
      transformResponse: [(data: string) => data],
    });
    return response.data;
  },

  previewPdfUrl: async (input: PreviewRequest): Promise<string> => {
    const response = await http.post<Blob>('/templates/preview.pdf', input, {
      responseType: 'blob',
    });
    return URL.createObjectURL(response.data);
  },
};

export const templateKeys = {
  all: ['templates'] as const,
  list: (docType?: string) => [...templateKeys.all, 'list', docType ?? 'all'] as const,
  detail: (id: number) => [...templateKeys.all, 'detail', id] as const,
  config: (id: number, version: number) => [...templateKeys.all, 'config', id, version] as const,
  layouts: () => [...templateKeys.all, 'layouts'] as const,
};

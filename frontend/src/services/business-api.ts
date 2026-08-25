import type {
  CreateCustomerInput,
  CreateItemInput,
  CustomerRecord,
  CustomerSummary,
  ItemRecord,
  UpdateCustomerInput,
  UpdateItemInput,
} from '@app/shared';
import { apiClient } from './api-client';

export interface ListParams {
  page: number;
  pageSize: number;
  search?: string;
  sort?: string;
  status?: string;
  [key: string]: unknown;
}

export const customersApi = {
  list: (params: ListParams) => apiClient.getPaginated<CustomerRecord>('/customers', params),
  get: (id: number) => apiClient.get<CustomerRecord>(`/customers/${id}`),
  summary: (id: number) => apiClient.get<CustomerSummary>(`/customers/${id}/summary`),
  create: (input: CreateCustomerInput) => apiClient.post<CustomerRecord>('/customers', input),
  update: (id: number, input: UpdateCustomerInput) =>
    apiClient.patch<CustomerRecord>(`/customers/${id}`, input),
  archive: (id: number, archive: boolean) =>
    apiClient.post<CustomerRecord>(`/customers/${id}/archive`, { archive }),
};

export const itemsApi = {
  list: (params: ListParams) => apiClient.getPaginated<ItemRecord>('/items', params),
  get: (id: number) => apiClient.get<ItemRecord>(`/items/${id}`),
  create: (input: CreateItemInput) => apiClient.post<ItemRecord>('/items', input),
  update: (id: number, input: UpdateItemInput) =>
    apiClient.patch<ItemRecord>(`/items/${id}`, input),
  archive: (id: number, archive: boolean) =>
    apiClient.post<ItemRecord>(`/items/${id}/archive`, { archive }),
};

export const customerKeys = {
  all: ['customers'] as const,
  list: (params: ListParams) => [...customerKeys.all, 'list', params] as const,
  detail: (id: number) => [...customerKeys.all, 'detail', id] as const,
  summary: (id: number) => [...customerKeys.all, 'summary', id] as const,
};

export const itemKeys = {
  all: ['items'] as const,
  list: (params: ListParams) => [...itemKeys.all, 'list', params] as const,
  detail: (id: number) => [...itemKeys.all, 'detail', id] as const,
};

import { useQuery } from '@tanstack/react-query';
import { MAX_PAGE_SIZE, type PaginationMeta } from '@app/shared';
import { customersApi, itemsApi, type ListParams } from '@/services/business-api';
import { companyApi, companyKeys } from '@/services/masters-api';

/**
 * Pickers for the document editor.
 *
 * These are reference lists rather than browsable pages, so they are fetched once
 * per session and shared through the query cache.
 *
 * They page through to the end rather than taking the first page: a picker that
 * silently shows the first 100 of 300 customers looks like the customer has been
 * deleted. The API caps a page at MAX_PAGE_SIZE, so "all of them" means asking
 * repeatedly, with a ceiling so a runaway list cannot hang the editor.
 */

const LOOKUP_STALE_TIME = 5 * 60 * 1000;
const MAX_LOOKUP_PAGES = 20;

const fetchAll = async <T>(
  fetchPage: (params: ListParams) => Promise<{ items: T[]; meta: PaginationMeta }>,
  params: Omit<ListParams, 'page' | 'pageSize'>,
): Promise<T[]> => {
  const collected: T[] = [];

  for (let page = 1; page <= MAX_LOOKUP_PAGES; page += 1) {
    const result = await fetchPage({ ...params, page, pageSize: MAX_PAGE_SIZE });
    collected.push(...result.items);
    if (page >= result.meta.totalPages) break;
  }

  return collected;
};

const customerParams = { sort: 'name', status: 'ACTIVE' };
const itemParams = { sort: 'name', status: 'ACTIVE' };

export const lookupKeys = {
  customers: () => ['lookups', 'customers', customerParams] as const,
  items: () => ['lookups', 'items', itemParams] as const,
};

export const useCustomerOptions = () =>
  useQuery({
    queryKey: lookupKeys.customers(),
    queryFn: () => fetchAll(customersApi.list, customerParams),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useItemOptions = () =>
  useQuery({
    queryKey: lookupKeys.items(),
    queryFn: () => fetchAll(itemsApi.list, itemParams),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useCompanySettings = () =>
  useQuery({
    queryKey: companyKeys.settings(),
    queryFn: () => companyApi.get(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useBankAccounts = () =>
  useQuery({
    queryKey: companyKeys.bankAccounts(),
    queryFn: () => companyApi.listBankAccounts(),
    staleTime: LOOKUP_STALE_TIME,
  });

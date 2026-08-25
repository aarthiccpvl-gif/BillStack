import { useQuery } from '@tanstack/react-query';
import { customerKeys, customersApi, itemKeys, itemsApi } from '@/services/business-api';
import { companyApi, companyKeys } from '@/services/masters-api';

/**
 * Pickers for the document editor.
 *
 * These are read-only reference lists rather than browsable pages, so they are
 * fetched once per session and shared through the query cache. The page size is
 * deliberately generous: a picker that silently shows the first 25 of 300
 * customers is worse than a slightly larger response.
 */

const LOOKUP_STALE_TIME = 5 * 60 * 1000;
const LOOKUP_PAGE_SIZE = 500;

const customerParams = { page: 1, pageSize: LOOKUP_PAGE_SIZE, sort: 'name', status: 'ACTIVE' };
const itemParams = { page: 1, pageSize: LOOKUP_PAGE_SIZE, sort: 'name', status: 'ACTIVE' };

export const useCustomerOptions = () =>
  useQuery({
    queryKey: customerKeys.list(customerParams),
    queryFn: () => customersApi.list(customerParams),
    staleTime: LOOKUP_STALE_TIME,
    select: (page) => page.items,
  });

export const useItemOptions = () =>
  useQuery({
    queryKey: itemKeys.list(itemParams),
    queryFn: () => itemsApi.list(itemParams),
    staleTime: LOOKUP_STALE_TIME,
    select: (page) => page.items,
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

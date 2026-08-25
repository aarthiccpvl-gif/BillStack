import { useQuery } from '@tanstack/react-query';
import { MASTER_STALE_TIME, masterKeys, mastersApi } from '@/services/masters-api';

/**
 * Master-data hooks.
 *
 * Every screen that shows money, tax or units needs these, so they are fetched
 * once and shared through the query cache rather than passed down as props.
 */

export const useCurrencies = (includeInactive = false) =>
  useQuery({
    queryKey: masterKeys.currencies(includeInactive),
    queryFn: () => mastersApi.currencies(includeInactive),
    staleTime: MASTER_STALE_TIME,
  });

export const useTaxTypes = () =>
  useQuery({
    queryKey: masterKeys.taxTypes(),
    queryFn: () => mastersApi.taxTypes(),
    staleTime: MASTER_STALE_TIME,
  });

export const useTaxRates = (includeInactive = false) =>
  useQuery({
    queryKey: masterKeys.taxRates(includeInactive),
    queryFn: () => mastersApi.taxRates(includeInactive),
    staleTime: MASTER_STALE_TIME,
  });

export const useTaxGroups = (includeInactive = false) =>
  useQuery({
    queryKey: masterKeys.taxGroups(includeInactive),
    queryFn: () => mastersApi.taxGroups(includeInactive),
    staleTime: MASTER_STALE_TIME,
  });

export const useUnits = (includeInactive = false) =>
  useQuery({
    queryKey: masterKeys.units(includeInactive),
    queryFn: () => mastersApi.units(includeInactive),
    staleTime: MASTER_STALE_TIME,
  });

export const useItemCategories = () =>
  useQuery({
    queryKey: masterKeys.categories(),
    queryFn: () => mastersApi.itemCategories(),
    staleTime: MASTER_STALE_TIME,
  });

export const useFinancialYears = () =>
  useQuery({
    queryKey: masterKeys.financialYears(),
    queryFn: () => mastersApi.financialYears(),
    staleTime: MASTER_STALE_TIME,
  });

export const useNumberingSeries = () =>
  useQuery({
    queryKey: masterKeys.numbering(),
    queryFn: () => mastersApi.numberingSeries(),
    staleTime: MASTER_STALE_TIME,
  });

/** Currency formatting metadata for a code, with a sane fallback. */
export const useCurrencyFormat = (code: string) => {
  const { data } = useCurrencies(true);
  const currency = data?.find((entry) => entry.code === code);

  return (
    currency ?? {
      code,
      name: code,
      symbol: code,
      decimalPlaces: 2,
      symbolPosition: 'PREFIX' as const,
      separatorStyle: 'WESTERN' as const,
      isActive: true,
      sortOrder: 0,
    }
  );
};

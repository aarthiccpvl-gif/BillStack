import { useQuery } from '@tanstack/react-query';
import type { CurrencyFormat } from '@app/shared';
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

/**
 * Formats a figure that arrives with its own currency snapshot.
 *
 * A saved document carries the symbol and decimal places it was raised with, but
 * not how the digits should be grouped — and ₹10,00,000 versus $1,000,000 is not
 * a cosmetic difference. The row supplies what it froze; the master supplies the
 * grouping, falling back to western when the code is unknown.
 */
export const useCurrencyFormatter = () => {
  const { data } = useCurrencies(true);

  return (row: {
    currencyCode: string;
    currencySymbol?: string;
    currencyDecimalPlaces?: number;
  }): CurrencyFormat => {
    const master = data?.find((currency) => currency.code === row.currencyCode);

    return {
      code: row.currencyCode,
      symbol: row.currencySymbol ?? master?.symbol ?? row.currencyCode,
      decimalPlaces: row.currencyDecimalPlaces ?? master?.decimalPlaces ?? 2,
      symbolPosition: master?.symbolPosition ?? 'PREFIX',
      separatorStyle: master?.separatorStyle ?? 'WESTERN',
    };
  };
};

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

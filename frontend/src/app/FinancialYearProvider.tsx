import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FinancialYearRecord } from '@app/shared';
import { MASTER_STALE_TIME, masterKeys, mastersApi } from '@/services/masters-api';
import { useAuth } from './AuthProvider';

/**
 * The financial-year scope for every screen that lists or totals documents.
 *
 * The default is the current financial year, but the default is never written to
 * storage — only a choice the user made is. Otherwise the first load in April
 * would pin the application to last year for ever.
 *
 * `ALL` is a value, not "no selection", so screens can say plainly that nothing
 * is being hidden.
 */

export type FinancialYearSelection = number | 'ALL';

const STORAGE_KEY = 'billstack.financial-year';

interface FinancialYearContextValue {
  years: FinancialYearRecord[];
  selection: FinancialYearSelection;
  selectedYear: FinancialYearRecord | null;
  isAll: boolean;
  /** A short label for controls: "FY 2026-27" or "All financial years". */
  label: string;
  /** Undefined means no server-side filter, i.e. all years. */
  financialYearId: number | undefined;
  setSelection: (selection: FinancialYearSelection) => void;
  isLoading: boolean;
}

const FinancialYearContext = createContext<FinancialYearContextValue | null>(null);

const readStored = (): FinancialYearSelection | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'ALL') return 'ALL';
    if (raw && /^\d+$/.test(raw)) {
      const id = Number(raw);
      return Number.isSafeInteger(id) && id > 0 ? id : null;
    }
  } catch {
    /* Storage can be disabled; the current year is still a usable default. */
  }
  return null;
};

const writeStored = (selection: FinancialYearSelection): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, selection === 'ALL' ? 'ALL' : String(selection));
  } catch {
    /* A private-mode browser refusing storage must not break the selector. */
  }
};

export const FinancialYearProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [choice, setChoice] = useState<FinancialYearSelection | null>(readStored);

  const query = useQuery({
    queryKey: masterKeys.financialYears(),
    queryFn: mastersApi.financialYears,
    enabled: Boolean(user),
    staleTime: MASTER_STALE_TIME,
  });

  const years = useMemo(() => query.data ?? [], [query.data]);
  const current = years.find((year) => year.isCurrent) ?? years[0] ?? null;

  /* A stored id that no longer exists falls back to the current year rather than
     silently showing an empty list. */
  const selection: FinancialYearSelection =
    choice === 'ALL'
      ? 'ALL'
      : choice !== null && years.some((year) => year.id === choice)
        ? choice
        : (current?.id ?? 'ALL');

  const selectedYear =
    selection === 'ALL' ? null : (years.find((year) => year.id === selection) ?? null);

  const setSelection = useCallback((next: FinancialYearSelection) => {
    setChoice(next);
    writeStored(next);
  }, []);

  const value = useMemo<FinancialYearContextValue>(
    () => ({
      years,
      selection,
      selectedYear,
      isAll: selection === 'ALL',
      label:
        selection === 'ALL'
          ? 'All financial years'
          : selectedYear
            ? `FY ${selectedYear.code}`
            : 'Current financial year',
      financialYearId: selection === 'ALL' ? undefined : selection,
      setSelection,
      /* Pending includes the first fetch, which starts in the same commit that
         makes the user available. Screens wait for a resolved list so they never
         fire once with "all years" and then refetch with the current year. */
      isLoading: Boolean(user) && query.isPending,
    }),
    [years, selection, selectedYear, setSelection, user, query.isPending],
  );

  return <FinancialYearContext.Provider value={value}>{children}</FinancialYearContext.Provider>;
};

export const useFinancialYear = (): FinancialYearContextValue => {
  const context = useContext(FinancialYearContext);
  if (!context) {
    throw new Error('useFinancialYear must be used inside <FinancialYearProvider>');
  }
  return context;
};

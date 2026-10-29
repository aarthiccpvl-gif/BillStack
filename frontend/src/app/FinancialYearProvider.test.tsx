import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '@/app/providers';
import { useFinancialYear } from './FinancialYearProvider';
import { FINANCIAL_YEARS, buildUser, mockApi } from '@/test/harness';

/**
 * The global financial-year selection.
 *
 * The default is the current year, but it is not a choice the user made and is
 * therefore never persisted. Only an explicit selection survives a reload.
 */

const Probe = () => {
  const { selection, label, isAll, financialYearId, setSelection } = useFinancialYear();

  return (
    <div>
      <span data-testid="selection">{String(selection)}</span>
      <span data-testid="label">{label}</span>
      <span data-testid="is-all">{String(isAll)}</span>
      <span data-testid="filter">{financialYearId ?? 'none'}</span>
      <button type="button" onClick={() => setSelection('ALL')}>
        All years
      </button>
      <button type="button" onClick={() => setSelection(1)}>
        Previous year
      </button>
    </div>
  );
};

const renderProvider = () => {
  mockApi(buildUser('ADMIN'), {
    get: { '/masters/financial-years': FINANCIAL_YEARS },
  });
  render(
    <AppProviders>
      <Probe />
    </AppProviders>,
  );
};

const STORAGE_KEY = 'billstack.financial-year';

beforeEach(() => localStorage.clear());

describe('the financial-year context', () => {
  it('defaults to the current financial year without persisting the default', async () => {
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('FY 2026-27'));
    expect(screen.getByTestId('selection')).toHaveTextContent('2');
    expect(screen.getByTestId('filter')).toHaveTextContent('2');
    expect(screen.getByTestId('is-all')).toHaveTextContent('false');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('persists an explicit choice, including All', async () => {
    const user = userEvent.setup();
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('FY 2026-27'));

    await user.click(screen.getByRole('button', { name: 'All years' }));

    expect(screen.getByTestId('label')).toHaveTextContent('All financial years');
    expect(screen.getByTestId('filter')).toHaveTextContent('none');
    expect(screen.getByTestId('is-all')).toHaveTextContent('true');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('ALL');
  });

  it('restores a stored year on the next load', async () => {
    localStorage.setItem(STORAGE_KEY, '1');
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('FY 2025-26'));
    expect(screen.getByTestId('filter')).toHaveTextContent('1');
  });

  it('restores an explicit All selection', async () => {
    localStorage.setItem(STORAGE_KEY, 'ALL');
    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId('label')).toHaveTextContent('All financial years'),
    );
    expect(screen.getByTestId('filter')).toHaveTextContent('none');
  });

  it('falls back to the current year when a stored year no longer exists', async () => {
    localStorage.setItem(STORAGE_KEY, '999');
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('FY 2026-27'));
    expect(screen.getByTestId('filter')).toHaveTextContent('2');
  });
});

import { useState } from 'react';
import { PERMISSIONS } from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/app/AuthProvider';
import { CurrenciesTab } from './CurrenciesTab';
import { TaxesTab } from './TaxesTab';
import { UnitsTab } from './UnitsTab';
import { FinancialYearsTab } from './FinancialYearsTab';
import { NumberingTab } from './NumberingTab';

type Tab = 'currencies' | 'taxes' | 'units' | 'years' | 'numbering';

const TABS: { key: Tab; label: string }[] = [
  { key: 'numbering', label: 'Document numbering' },
  { key: 'currencies', label: 'Currencies' },
  { key: 'taxes', label: 'Taxes' },
  { key: 'units', label: 'Units & categories' },
  { key: 'years', label: 'Financial years' },
];

/**
 * Master data.
 *
 * These tables are what keep tax rates, currencies and the numbering format out of
 * the code. Reading is open to anyone who can read a document; changing them is
 * Super Admin only.
 */
export const MastersPage = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.MASTER_MANAGE);
  const [tab, setTab] = useState<Tab>('numbering');

  return (
    <>
      <PageHeader
        title="Masters & Numbering"
        description="Currencies, taxes, units, financial years and the document number format."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Masters & Numbering' }]}
      />

      {!canManage && (
        <div className="alert alert-light border py-2 small" role="status">
          You can view master data but not change it.
        </div>
      )}

      <ul className="nav nav-tabs mb-3">
        {TABS.map((entry) => (
          <li className="nav-item" key={entry.key}>
            <button
              type="button"
              className={`nav-link${tab === entry.key ? ' active' : ''}`}
              aria-current={tab === entry.key ? 'page' : undefined}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
            </button>
          </li>
        ))}
      </ul>

      {tab === 'numbering' && <NumberingTab canManage={canManage} />}
      {tab === 'currencies' && <CurrenciesTab canManage={canManage} />}
      {tab === 'taxes' && <TaxesTab />}
      {tab === 'units' && <UnitsTab />}
      {tab === 'years' && <FinancialYearsTab />}
    </>
  );
};

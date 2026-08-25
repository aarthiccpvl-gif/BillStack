import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { PERMISSIONS } from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/states';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { companyApi, companyKeys } from '@/services/masters-api';
import { CompanyProfileTab } from './CompanyProfileTab';
import { CompanyBrandingTab } from './CompanyBrandingTab';
import { BankAccountsTab } from './BankAccountsTab';

type Tab = 'profile' | 'branding' | 'bank';

const TABS: { key: Tab; label: string }[] = [
  { key: 'profile', label: 'Company profile' },
  { key: 'branding', label: 'Branding' },
  { key: 'bank', label: 'Bank accounts' },
];

export const CompanySettingsPage = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.COMPANY_UPDATE);
  const [tab, setTab] = useState<Tab>('profile');

  const companyQuery = useQuery({
    queryKey: companyKeys.settings(),
    queryFn: () => companyApi.get(),
  });

  return (
    <>
      <PageHeader
        title="Company Settings"
        description="Everything documents print about your own business."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Company Settings' }]}
      />

      {!canEdit && (
        <div className="alert alert-light border py-2 small" role="status">
          You can view these settings but not change them.
        </div>
      )}

      {companyQuery.data && !companyQuery.data.isConfigured && (
        <div className="alert alert-warning d-flex align-items-start gap-2" role="status">
          <AlertTriangle size={18} className="flex-shrink-0 mt-1" aria-hidden />
          <div>
            <div className="fw-medium">This company profile is still the placeholder.</div>
            <div className="small">
              Fill in the name, address and GST state code before issuing documents — every invoice
              snapshots these details at the moment it is saved.
            </div>
          </div>
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

      {companyQuery.isLoading && (
        <div className="card">
          <div className="card-body placeholder-glow">
            <span className="placeholder col-4 mb-2 d-block" />
            <span className="placeholder col-8 mb-2 d-block" />
            <span className="placeholder col-6 d-block" />
          </div>
        </div>
      )}

      {companyQuery.isError && (
        <ErrorState
          message={
            companyQuery.error instanceof ApiError
              ? companyQuery.error.message
              : 'Unexpected error.'
          }
          onRetry={() => void companyQuery.refetch()}
        />
      )}

      {companyQuery.data && (
        <>
          {tab === 'profile' && <CompanyProfileTab company={companyQuery.data} canEdit={canEdit} />}
          {tab === 'branding' && (
            <CompanyBrandingTab company={companyQuery.data} canEdit={canEdit} />
          )}
          {tab === 'bank' && <BankAccountsTab canEdit={canEdit} />}
        </>
      )}
    </>
  );
};

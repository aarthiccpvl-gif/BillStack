import type {
  BankAccountInput,
  BankAccountRecord,
  CompanySettingsRecord,
  CurrencyRecord,
  ExchangeRateInput,
  ExchangeRateRecord,
  FinancialYearRecord,
  ItemCategoryRecord,
  NumberingSeriesRecord,
  TaxGroupRecord,
  TaxRateRecord,
  TaxTypeRecord,
  UnitRecord,
  UpdateBankAccountInput,
  UpdateCompanyInput,
  UpdateCurrencyInput,
  UpdateNumberingSeriesInput,
} from '@app/shared';
import { apiClient, http } from './api-client';

/**
 * Company and master data.
 *
 * Master lists change rarely and are needed by nearly every screen, so they are
 * cached longer than transactional data (see the query keys below).
 */

export const companyApi = {
  get: () => apiClient.get<CompanySettingsRecord>('/company'),
  /* Partial: the settings screen saves one tab at a time, so a call carries only
     the fields that tab owns. */
  update: (input: Partial<UpdateCompanyInput>) =>
    apiClient.patch<CompanySettingsRecord>('/company', input),
  uploadAsset: async (kind: 'logo' | 'favicon' | 'signature' | 'seal', file: File) => {
    const form = new FormData();
    form.append('file', file);
    /* Let the browser set the multipart boundary — overriding Content-Type breaks it. */
    const response = await http.post<{ success: true; data: CompanySettingsRecord }>(
      `/company/assets/${kind}`,
      form,
      { headers: { 'Content-Type': undefined } },
    );
    return response.data.data;
  },
  removeAsset: (kind: 'logo' | 'favicon' | 'signature' | 'seal') =>
    apiClient.delete<CompanySettingsRecord>(`/company/assets/${kind}`),

  listBankAccounts: () => apiClient.get<BankAccountRecord[]>('/company/bank-accounts'),
  createBankAccount: (input: BankAccountInput) =>
    apiClient.post<BankAccountRecord>('/company/bank-accounts', input),
  updateBankAccount: (id: number, input: UpdateBankAccountInput) =>
    apiClient.patch<BankAccountRecord>(`/company/bank-accounts/${id}`, input),
  archiveBankAccount: (id: number) =>
    apiClient.delete<{ archived: boolean }>(`/company/bank-accounts/${id}`),
};

export const mastersApi = {
  currencies: (includeInactive = false) =>
    apiClient.get<CurrencyRecord[]>(`/masters/currencies?includeInactive=${includeInactive}`),
  updateCurrency: (code: string, input: UpdateCurrencyInput) =>
    apiClient.patch<CurrencyRecord>(`/masters/currencies/${code}`, input),

  taxTypes: () => apiClient.get<TaxTypeRecord[]>('/masters/tax-types'),
  taxRates: (includeInactive = false) =>
    apiClient.get<TaxRateRecord[]>(`/masters/tax-rates?includeInactive=${includeInactive}`),
  taxGroups: (includeInactive = false) =>
    apiClient.get<TaxGroupRecord[]>(`/masters/tax-groups?includeInactive=${includeInactive}`),

  units: (includeInactive = false) =>
    apiClient.get<UnitRecord[]>(`/masters/units?includeInactive=${includeInactive}`),
  itemCategories: () => apiClient.get<ItemCategoryRecord[]>('/masters/item-categories'),

  financialYears: () => apiClient.get<FinancialYearRecord[]>('/masters/financial-years'),

  numberingSeries: () => apiClient.get<NumberingSeriesRecord[]>('/masters/numbering-series'),
  updateNumberingSeries: (id: number, input: UpdateNumberingSeriesInput) =>
    apiClient.patch<NumberingSeriesRecord>(`/masters/numbering-series/${id}`, input),

  exchangeRates: () => apiClient.get<ExchangeRateRecord[]>('/masters/exchange-rates'),
  upsertExchangeRate: (input: ExchangeRateInput) =>
    apiClient.post<ExchangeRateRecord>('/masters/exchange-rates', input),
};

export const companyKeys = {
  all: ['company'] as const,
  settings: () => [...companyKeys.all, 'settings'] as const,
  bankAccounts: () => [...companyKeys.all, 'bank-accounts'] as const,
};

export const masterKeys = {
  all: ['masters'] as const,
  currencies: (includeInactive: boolean) =>
    [...masterKeys.all, 'currencies', includeInactive] as const,
  taxTypes: () => [...masterKeys.all, 'tax-types'] as const,
  taxRates: (includeInactive: boolean) =>
    [...masterKeys.all, 'tax-rates', includeInactive] as const,
  taxGroups: (includeInactive: boolean) =>
    [...masterKeys.all, 'tax-groups', includeInactive] as const,
  units: (includeInactive: boolean) => [...masterKeys.all, 'units', includeInactive] as const,
  categories: () => [...masterKeys.all, 'item-categories'] as const,
  financialYears: () => [...masterKeys.all, 'financial-years'] as const,
  numbering: () => [...masterKeys.all, 'numbering'] as const,
  exchangeRates: () => [...masterKeys.all, 'exchange-rates'] as const,
};

/** Masters barely change; ten minutes avoids refetching them on every screen. */
export const MASTER_STALE_TIME = 10 * 60 * 1000;

import type {
  BankAccountInput,
  BankAccountRecord,
  CompanyAssetRef,
  CompanySettingsRecord,
  UpdateBankAccountInput,
  UpdateCompanyInput,
} from '@app/shared';
import type { FileKind } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { BusinessRuleError, NotFoundError } from '../../utils/errors';
import { recordAudit } from '../../services/audit.service';
import { invalidateFinancialYearCache } from '../../services/financial-year.service';
import { companyAssetKey, getStorage } from '../../storage/storage.service';
import type { UploadedFile } from '../../middleware/upload';

/** The single company row. Created by the seed; this only ever updates it. */
const COMPANY_ID = 1;

export type AssetKind = 'logo' | 'favicon' | 'signature' | 'seal';

const ASSET_FIELD: Record<
  AssetKind,
  'logoFileId' | 'faviconFileId' | 'signatureFileId' | 'sealFileId'
> = {
  logo: 'logoFileId',
  favicon: 'faviconFileId',
  signature: 'signatureFileId',
  seal: 'sealFileId',
};

const ASSET_FILE_KIND: Record<AssetKind, FileKind> = {
  logo: 'LOGO',
  favicon: 'FAVICON',
  signature: 'SIGNATURE',
  seal: 'SEAL',
};

const toAssetRef = (
  file: {
    id: bigint;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  } | null,
): CompanyAssetRef | null =>
  file
    ? {
        id: file.id.toString(),
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        /* Always proxied through the API so permissions and audit apply. */
        url: `/api/files/${file.id.toString()}`,
      }
    : null;

export const getCompany = async (): Promise<CompanySettingsRecord> => {
  const company = await prisma.companySettings.findUnique({ where: { id: COMPANY_ID } });
  if (!company) {
    throw new NotFoundError('Company settings — run the database seed first');
  }

  const assetIds = [
    company.logoFileId,
    company.faviconFileId,
    company.signatureFileId,
    company.sealFileId,
  ].filter((id): id is bigint => id !== null);

  const files = assetIds.length
    ? await prisma.documentFile.findMany({
        where: { id: { in: assetIds } },
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
      })
    : [];

  const byId = new Map(files.map((file) => [file.id.toString(), file]));
  const asset = (id: bigint | null) => toAssetRef(id ? (byId.get(id.toString()) ?? null) : null);

  return {
    companyName: company.companyName,
    legalName: company.legalName,
    addressLine1: company.addressLine1,
    addressLine2: company.addressLine2,
    city: company.city,
    state: company.state,
    stateCode: company.stateCode,
    country: company.country,
    postalCode: company.postalCode,
    phone: company.phone,
    email: company.email,
    website: company.website,
    gstin: company.gstin,
    pan: company.pan,
    cin: company.cin,
    primaryColor: company.primaryColor,
    secondaryColor: company.secondaryColor,
    defaultFont: company.defaultFont,
    signatureLabel: company.signatureLabel,
    baseCurrencyCode: company.baseCurrencyCode,
    financialYearStartMonth: company.financialYearStartMonth,
    defaultTermsInvoice: company.defaultTermsInvoice,
    defaultTermsQuotation: company.defaultTermsQuotation,
    defaultNotes: company.defaultNotes,
    isConfigured: company.isConfigured,
    logo: asset(company.logoFileId),
    favicon: asset(company.faviconFileId),
    signature: asset(company.signatureFileId),
    seal: asset(company.sealFileId),
    updatedAt: company.updatedAt.toISOString(),
  };
};

/** Enough detail filled in that a document would not look unfinished. */
const looksConfigured = (company: {
  companyName: string;
  addressLine1: string | null;
  city: string | null;
  stateCode: string | null;
}): boolean =>
  company.companyName.trim().length > 2 &&
  company.companyName.trim().toLowerCase() !== 'your company' &&
  Boolean(company.addressLine1) &&
  Boolean(company.city) &&
  Boolean(company.stateCode);

export const updateCompany = async (
  input: UpdateCompanyInput,
  actorId: number,
): Promise<CompanySettingsRecord> => {
  const existing = await prisma.companySettings.findUnique({ where: { id: COMPANY_ID } });
  if (!existing) throw new NotFoundError('Company settings');

  if (input.baseCurrencyCode) {
    const currency = await prisma.currency.findUnique({
      where: { code: input.baseCurrencyCode },
    });
    if (!currency || !currency.isActive) {
      throw new BusinessRuleError(`${input.baseCurrencyCode} is not an active currency.`);
    }

    /* Changing the base currency would silently reinterpret every stored base
       total, so it is refused once documents exist. */
    if (input.baseCurrencyCode !== existing.baseCurrencyCode) {
      const [quotations, invoices] = await Promise.all([
        prisma.quotation.count(),
        prisma.invoice.count(),
      ]);
      if (quotations + invoices > 0) {
        throw new BusinessRuleError(
          'The base currency cannot change once documents exist — their stored base totals were calculated against it.',
        );
      }
    }
  }

  const merged = {
    companyName: input.companyName ?? existing.companyName,
    addressLine1: input.addressLine1 ?? existing.addressLine1,
    city: input.city ?? existing.city,
    stateCode: input.stateCode ?? existing.stateCode,
  };

  const updated = await prisma.$transaction(async (tx) => {
    const company = await tx.companySettings.update({
      where: { id: COMPANY_ID },
      data: {
        ...input,
        isConfigured: looksConfigured(merged),
        updatedById: actorId,
      },
    });

    await recordAudit(
      {
        action: 'COMPANY_UPDATED',
        entityType: 'COMPANY',
        entityId: COMPANY_ID,
        entityLabel: company.companyName,
        previousData: existing,
        newData: company,
      },
      tx,
    );

    return company;
  });

  if (input.financialYearStartMonth !== undefined) invalidateFinancialYearCache();
  void updated;

  return getCompany();
};

export const setCompanyAsset = async (
  kind: AssetKind,
  file: UploadedFile,
  actorId: number,
): Promise<CompanySettingsRecord> => {
  const storage = getStorage();
  /* Timestamped key: replacing a logo must not overwrite the bytes a previously
     generated PDF still refers to. */
  const key = companyAssetKey(kind, file.extension, `${Date.now()}`);
  const stored = await storage.put(key, file.buffer, file.mimeType);

  await prisma.$transaction(async (tx) => {
    const record = await tx.documentFile.create({
      data: {
        entityType: 'COMPANY',
        entityId: BigInt(COMPANY_ID),
        kind: ASSET_FILE_KIND[kind],
        storageKey: stored.storageKey,
        fileName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
        createdById: actorId,
      },
    });

    await tx.companySettings.update({
      where: { id: COMPANY_ID },
      data: { [ASSET_FIELD[kind]]: record.id, updatedById: actorId },
    });

    await recordAudit(
      {
        action: 'COMPANY_ASSET_UPDATED',
        entityType: 'COMPANY',
        entityId: COMPANY_ID,
        entityLabel: kind,
        newData: { kind, fileName: file.originalName, sizeBytes: stored.sizeBytes },
      },
      tx,
    );
  });

  return getCompany();
};

export const removeCompanyAsset = async (
  kind: AssetKind,
  actorId: number,
): Promise<CompanySettingsRecord> => {
  await prisma.$transaction(async (tx) => {
    await tx.companySettings.update({
      where: { id: COMPANY_ID },
      data: { [ASSET_FIELD[kind]]: null, updatedById: actorId },
    });

    await recordAudit(
      {
        action: 'COMPANY_ASSET_UPDATED',
        entityType: 'COMPANY',
        entityId: COMPANY_ID,
        entityLabel: kind,
        newData: { kind, removed: true },
      },
      tx,
    );
  });

  /* The DocumentFile row and its bytes are kept: a previously generated PDF may
     still reference them, and retention is permanent. */
  return getCompany();
};

// ---------------------------------------------------------- bank accounts ---

const toBankRecord = (account: {
  id: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string | null;
  swift: string | null;
  branch: string | null;
  currencyCode: string | null;
  paymentInstructions: string | null;
  isDefault: boolean;
  status: string;
}): BankAccountRecord => ({
  id: account.id,
  bankName: account.bankName,
  accountName: account.accountName,
  accountNumber: account.accountNumber,
  ifsc: account.ifsc,
  swift: account.swift,
  branch: account.branch,
  currencyCode: account.currencyCode,
  paymentInstructions: account.paymentInstructions,
  isDefault: account.isDefault,
  status: account.status as BankAccountRecord['status'],
});

export const listBankAccounts = async (): Promise<BankAccountRecord[]> => {
  const accounts = await prisma.companyBankAccount.findMany({
    where: { status: { not: 'ARCHIVED' } },
    orderBy: [{ isDefault: 'desc' }, { bankName: 'asc' }],
  });
  return accounts.map(toBankRecord);
};

export const createBankAccount = async (input: BankAccountInput): Promise<BankAccountRecord> => {
  const account = await prisma.$transaction(async (tx) => {
    const existingCount = await tx.companyBankAccount.count({
      where: { status: { not: 'ARCHIVED' } },
    });
    /* The first account is the default whether or not the box was ticked. */
    const isDefault = input.isDefault || existingCount === 0;

    if (isDefault) {
      await tx.companyBankAccount.updateMany({ data: { isDefault: false } });
    }

    const created = await tx.companyBankAccount.create({
      data: { ...input, isDefault, companyId: COMPANY_ID },
    });

    await recordAudit(
      {
        action: 'BANK_ACCOUNT_CREATED',
        entityType: 'COMPANY',
        entityId: created.id,
        entityLabel: `${created.bankName} · ${created.accountNumber.slice(-4)}`,
        newData: { ...created, accountNumber: `••••${created.accountNumber.slice(-4)}` },
      },
      tx,
    );

    return created;
  });

  return toBankRecord(account);
};

export const updateBankAccount = async (
  id: number,
  input: UpdateBankAccountInput,
): Promise<BankAccountRecord> => {
  const existing = await prisma.companyBankAccount.findUnique({ where: { id } });
  if (!existing || existing.status === 'ARCHIVED') throw new NotFoundError('Bank account');

  const account = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.companyBankAccount.updateMany({ data: { isDefault: false } });
    }

    const updated = await tx.companyBankAccount.update({ where: { id }, data: input });

    await recordAudit(
      {
        action: 'BANK_ACCOUNT_UPDATED',
        entityType: 'COMPANY',
        entityId: id,
        entityLabel: `${updated.bankName} · ${updated.accountNumber.slice(-4)}`,
        previousData: { ...existing, accountNumber: `••••${existing.accountNumber.slice(-4)}` },
        newData: { ...updated, accountNumber: `••••${updated.accountNumber.slice(-4)}` },
      },
      tx,
    );

    return updated;
  });

  return toBankRecord(account);
};

export const archiveBankAccount = async (id: number): Promise<void> => {
  const existing = await prisma.companyBankAccount.findUnique({ where: { id } });
  if (!existing || existing.status === 'ARCHIVED') throw new NotFoundError('Bank account');

  const remaining = await prisma.companyBankAccount.count({
    where: { status: { not: 'ARCHIVED' }, id: { not: id } },
  });

  if (existing.isDefault && remaining > 0) {
    throw new BusinessRuleError('Make another account the default before archiving this one.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.companyBankAccount.update({
      where: { id },
      data: { status: 'ARCHIVED', isDefault: false },
    });

    await recordAudit(
      {
        action: 'BANK_ACCOUNT_DELETED',
        entityType: 'COMPANY',
        entityId: id,
        entityLabel: `${existing.bankName} · ${existing.accountNumber.slice(-4)}`,
      },
      tx,
    );
  });
};

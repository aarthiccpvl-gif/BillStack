import type {
  CurrencyInput,
  CurrencyRecord,
  ExchangeRateInput,
  ItemCategoryInput,
  ItemCategoryRecord,
  NumberingSeriesRecord,
  TaxGroupInput,
  TaxGroupRecord,
  TaxRateInput,
  TaxRateRecord,
  TaxTypeRecord,
  UnitInput,
  UnitRecord,
  UpdateCurrencyInput,
  UpdateNumberingSeriesInput,
  UpdateTaxGroupInput,
  UpdateTaxRateInput,
} from '@app/shared';
import { toDateOnlyString } from '@app/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../utils/errors';
import { recordAudit } from '../../services/audit.service';
import { previewSeries } from '../../services/numbering.service';

/**
 * Master data.
 *
 * Two rules run through all of it:
 *   1. A master that a document already references can be deactivated but never
 *      deleted — history must stay readable.
 *   2. Rates and codes are validated against use before they change, because a
 *      document snapshots them and a silent edit would make old and new disagree.
 */

const decimalToString = (value: Prisma.Decimal): string => value.toString();

// ------------------------------------------------------------ currencies ---

export const listCurrencies = async (includeInactive = false): Promise<CurrencyRecord[]> => {
  const currencies = await prisma.currency.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    include: {
      _count: { select: { quotations: true, invoices: true, customers: true, items: true } },
    },
  });

  return currencies.map((currency) => ({
    code: currency.code,
    name: currency.name,
    symbol: currency.symbol,
    decimalPlaces: currency.decimalPlaces,
    symbolPosition: currency.symbolPosition,
    separatorStyle: currency.separatorStyle,
    isActive: currency.isActive,
    sortOrder: currency.sortOrder,
    inUse:
      currency._count.quotations +
        currency._count.invoices +
        currency._count.customers +
        currency._count.items >
      0,
  }));
};

export const createCurrency = async (input: CurrencyInput): Promise<CurrencyRecord> => {
  const existing = await prisma.currency.findUnique({ where: { code: input.code } });
  if (existing) throw new ConflictError(`${input.code} already exists.`);

  await prisma.$transaction(async (tx) => {
    const created = await tx.currency.create({ data: input });
    await recordAudit(
      {
        action: 'MASTER_CREATED',
        entityType: 'MASTER',
        entityLabel: `Currency ${created.code}`,
        newData: created,
      },
      tx,
    );
  });

  const [currency] = await listCurrencies(true).then((all) =>
    all.filter((entry) => entry.code === input.code),
  );
  if (!currency) throw new NotFoundError('Currency');
  return currency;
};

export const updateCurrency = async (
  code: string,
  input: UpdateCurrencyInput,
): Promise<CurrencyRecord> => {
  const existing = await prisma.currency.findUnique({ where: { code } });
  if (!existing) throw new NotFoundError('Currency');

  if (input.decimalPlaces !== undefined && input.decimalPlaces !== existing.decimalPlaces) {
    const used = await prisma.invoice.count({ where: { currencyCode: code } });
    const usedQ = await prisma.quotation.count({ where: { currencyCode: code } });
    if (used + usedQ > 0) {
      throw new BusinessRuleError(
        'The decimal precision cannot change once documents use this currency — their stored totals were rounded to it.',
      );
    }
  }

  if (input.isActive === false) {
    const company = await prisma.companySettings.findUnique({
      where: { id: 1 },
      select: { baseCurrencyCode: true },
    });
    if (company?.baseCurrencyCode === code) {
      throw new BusinessRuleError('The base currency cannot be deactivated.');
    }
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.currency.update({ where: { code }, data: input });
    await recordAudit(
      {
        action: 'MASTER_UPDATED',
        entityType: 'MASTER',
        entityLabel: `Currency ${code}`,
        previousData: existing,
        newData: updated,
      },
      tx,
    );
  });

  const currency = (await listCurrencies(true)).find((entry) => entry.code === code);
  if (!currency) throw new NotFoundError('Currency');
  return currency;
};

// ------------------------------------------------------------------ taxes ---

export const listTaxTypes = async (): Promise<TaxTypeRecord[]> => {
  const types = await prisma.taxType.findMany({ orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] });
  return types.map((type) => ({
    id: type.id,
    key: type.key,
    name: type.name,
    scope: type.scope,
    isActive: type.isActive,
    sortOrder: type.sortOrder,
  }));
};

export const listTaxRates = async (includeInactive = false): Promise<TaxRateRecord[]> => {
  const rates = await prisma.taxRate.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ taxTypeId: 'asc' }, { rate: 'asc' }],
    include: { taxType: { select: { key: true } } },
  });

  return rates.map((rate) => ({
    id: rate.id,
    taxTypeId: rate.taxTypeId,
    taxTypeKey: rate.taxType.key,
    name: rate.name,
    rate: decimalToString(rate.rate),
    effectiveFrom: rate.effectiveFrom ? toDateOnlyString(rate.effectiveFrom) : null,
    effectiveTo: rate.effectiveTo ? toDateOnlyString(rate.effectiveTo) : null,
    isActive: rate.isActive,
  }));
};

const toDate = (value: string | null | undefined): Date | null =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;

export const createTaxRate = async (input: TaxRateInput): Promise<TaxRateRecord> => {
  const type = await prisma.taxType.findUnique({ where: { id: input.taxTypeId } });
  if (!type) throw new BusinessRuleError('That tax type does not exist.');

  const created = await prisma.$transaction(async (tx) => {
    const rate = await tx.taxRate.create({
      data: {
        taxTypeId: input.taxTypeId,
        name: input.name,
        rate: new Prisma.Decimal(input.rate),
        effectiveFrom: toDate(input.effectiveFrom),
        effectiveTo: toDate(input.effectiveTo),
        isActive: input.isActive,
      },
    });

    await recordAudit(
      {
        action: 'MASTER_CREATED',
        entityType: 'MASTER',
        entityId: rate.id,
        entityLabel: `Tax rate ${rate.name}`,
        newData: { ...rate, rate: decimalToString(rate.rate) },
      },
      tx,
    );

    return rate;
  });

  const rates = await listTaxRates(true);
  const record = rates.find((entry) => entry.id === created.id);
  if (!record) throw new NotFoundError('Tax rate');
  return record;
};

export const updateTaxRate = async (
  id: number,
  input: UpdateTaxRateInput,
): Promise<TaxRateRecord> => {
  const existing = await prisma.taxRate.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Tax rate');

  /* Changing a percentage that documents already used would make the stored tax
     amounts unexplainable. Create a new rate and retire this one instead. */
  if (input.rate !== undefined && !new Prisma.Decimal(input.rate).equals(existing.rate)) {
    const used =
      (await prisma.invoiceItemTax.count({ where: { taxRateId: id } })) +
      (await prisma.quotationItemTax.count({ where: { taxRateId: id } }));
    if (used > 0) {
      throw new BusinessRuleError(
        `${existing.name} is already used on ${used} document line(s). Deactivate it and add a new rate instead of changing the percentage.`,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.taxRate.update({
      where: { id },
      data: {
        name: input.name,
        taxTypeId: input.taxTypeId,
        rate: input.rate === undefined ? undefined : new Prisma.Decimal(input.rate),
        effectiveFrom: input.effectiveFrom === undefined ? undefined : toDate(input.effectiveFrom),
        effectiveTo: input.effectiveTo === undefined ? undefined : toDate(input.effectiveTo),
        isActive: input.isActive,
      },
    });

    await recordAudit(
      {
        action: 'MASTER_UPDATED',
        entityType: 'MASTER',
        entityId: id,
        entityLabel: `Tax rate ${updated.name}`,
        previousData: { ...existing, rate: decimalToString(existing.rate) },
        newData: { ...updated, rate: decimalToString(updated.rate) },
      },
      tx,
    );
  });

  const record = (await listTaxRates(true)).find((entry) => entry.id === id);
  if (!record) throw new NotFoundError('Tax rate');
  return record;
};

export const listTaxGroups = async (includeInactive = false): Promise<TaxGroupRecord[]> => {
  const groups = await prisma.taxGroup.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { rates: { include: { rate: { include: { taxType: true } } } } },
  });

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    scope: group.scope,
    totalRate: decimalToString(group.totalRate),
    isActive: group.isActive,
    sortOrder: group.sortOrder,
    rates: group.rates.map((link) => ({
      id: link.rate.id,
      name: link.rate.name,
      taxTypeKey: link.rate.taxType.key,
      rate: decimalToString(link.rate.rate),
    })),
  }));
};

const sumRates = async (taxRateIds: number[]): Promise<Prisma.Decimal> => {
  const rates = await prisma.taxRate.findMany({ where: { id: { in: taxRateIds } } });
  if (rates.length !== taxRateIds.length) {
    throw new BusinessRuleError('One of the selected tax rates does not exist.');
  }
  return rates.reduce((total, rate) => total.plus(rate.rate), new Prisma.Decimal(0));
};

export const createTaxGroup = async (input: TaxGroupInput): Promise<TaxGroupRecord> => {
  const existing = await prisma.taxGroup.findUnique({ where: { name: input.name } });
  if (existing) throw new ConflictError('A tax group with that name already exists.');

  const totalRate = await sumRates(input.taxRateIds);

  const created = await prisma.$transaction(async (tx) => {
    const group = await tx.taxGroup.create({
      data: {
        name: input.name,
        scope: input.scope,
        totalRate,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
        rates: { create: input.taxRateIds.map((taxRateId) => ({ taxRateId })) },
      },
    });

    await recordAudit(
      {
        action: 'MASTER_CREATED',
        entityType: 'MASTER',
        entityId: group.id,
        entityLabel: `Tax group ${group.name}`,
        newData: { name: group.name, totalRate: totalRate.toString(), rates: input.taxRateIds },
      },
      tx,
    );

    return group;
  });

  const record = (await listTaxGroups(true)).find((entry) => entry.id === created.id);
  if (!record) throw new NotFoundError('Tax group');
  return record;
};

export const updateTaxGroup = async (
  id: number,
  input: UpdateTaxGroupInput,
): Promise<TaxGroupRecord> => {
  const existing = await prisma.taxGroup.findUnique({ where: { id }, include: { rates: true } });
  if (!existing) throw new NotFoundError('Tax group');

  const totalRate =
    input.taxRateIds === undefined ? existing.totalRate : await sumRates(input.taxRateIds);

  await prisma.$transaction(async (tx) => {
    if (input.taxRateIds) {
      await tx.taxGroupRate.deleteMany({ where: { taxGroupId: id } });
      await tx.taxGroupRate.createMany({
        data: input.taxRateIds.map((taxRateId) => ({ taxGroupId: id, taxRateId })),
      });
    }

    const updated = await tx.taxGroup.update({
      where: { id },
      data: {
        name: input.name,
        scope: input.scope,
        totalRate,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });

    await recordAudit(
      {
        action: 'MASTER_UPDATED',
        entityType: 'MASTER',
        entityId: id,
        entityLabel: `Tax group ${updated.name}`,
        previousData: {
          name: existing.name,
          rates: existing.rates.map((rate) => rate.taxRateId),
        },
        newData: { name: updated.name, rates: input.taxRateIds ?? 'unchanged' },
      },
      tx,
    );
  });

  const record = (await listTaxGroups(true)).find((entry) => entry.id === id);
  if (!record) throw new NotFoundError('Tax group');
  return record;
};

// ------------------------------------------------------ units & categories ---

export const listUnits = async (includeInactive = false): Promise<UnitRecord[]> => {
  const units = await prisma.unit.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { code: 'asc' },
  });
  return units.map((unit) => ({
    id: unit.id,
    code: unit.code,
    name: unit.name,
    isActive: unit.isActive,
  }));
};

export const createUnit = async (input: UnitInput): Promise<UnitRecord> => {
  const existing = await prisma.unit.findUnique({ where: { code: input.code } });
  if (existing) throw new ConflictError(`Unit ${input.code} already exists.`);

  const unit = await prisma.$transaction(async (tx) => {
    const created = await tx.unit.create({ data: input });
    await recordAudit(
      {
        action: 'MASTER_CREATED',
        entityType: 'MASTER',
        entityId: created.id,
        entityLabel: `Unit ${created.code}`,
        newData: created,
      },
      tx,
    );
    return created;
  });

  return { id: unit.id, code: unit.code, name: unit.name, isActive: unit.isActive };
};

export const updateUnit = async (id: number, input: Partial<UnitInput>): Promise<UnitRecord> => {
  const existing = await prisma.unit.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Unit');

  const unit = await prisma.$transaction(async (tx) => {
    const updated = await tx.unit.update({
      where: { id },
      data: { name: input.name, isActive: input.isActive },
    });
    await recordAudit(
      {
        action: 'MASTER_UPDATED',
        entityType: 'MASTER',
        entityId: id,
        entityLabel: `Unit ${updated.code}`,
        previousData: existing,
        newData: updated,
      },
      tx,
    );
    return updated;
  });

  return { id: unit.id, code: unit.code, name: unit.name, isActive: unit.isActive };
};

export const listItemCategories = async (): Promise<ItemCategoryRecord[]> => {
  const categories = await prisma.itemCategory.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { items: true } } },
  });
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    status: category.status,
    itemCount: category._count.items,
  }));
};

export const createItemCategory = async (input: ItemCategoryInput): Promise<ItemCategoryRecord> => {
  const existing = await prisma.itemCategory.findUnique({ where: { name: input.name } });
  if (existing) throw new ConflictError('A category with that name already exists.');

  const category = await prisma.$transaction(async (tx) => {
    const created = await tx.itemCategory.create({
      data: { name: input.name, parentId: input.parentId ?? null },
    });
    await recordAudit(
      {
        action: 'MASTER_CREATED',
        entityType: 'MASTER',
        entityId: created.id,
        entityLabel: `Category ${created.name}`,
        newData: created,
      },
      tx,
    );
    return created;
  });

  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    status: category.status,
    itemCount: 0,
  };
};

// -------------------------------------------------------------- numbering ---

export const listNumberingSeries = async (): Promise<NumberingSeriesRecord[]> => {
  const series = await prisma.numberingSeries.findMany({
    where: { docType: { in: ['QUOTATION', 'INVOICE'] } },
    orderBy: { docType: 'asc' },
  });

  return Promise.all(
    series.map(async (entry) => {
      const { preview, lastNumber } = await previewSeries(entry.id);
      return {
        id: entry.id,
        docType: entry.docType as 'QUOTATION' | 'INVOICE',
        prefix: entry.prefix,
        pattern: entry.pattern,
        padding: entry.padding,
        startNumber: entry.startNumber,
        resetPolicy: entry.resetPolicy,
        isActive: entry.isActive,
        preview,
        lastNumber,
      };
    }),
  );
};

export const updateNumberingSeries = async (
  id: number,
  input: UpdateNumberingSeriesInput,
): Promise<NumberingSeriesRecord> => {
  const existing = await prisma.numberingSeries.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Numbering series');

  /* Once numbers have been issued in the current year, changing the format would
     produce two shapes inside one series — confusing on a ledger and hard to sort. */
  const { lastNumber } = await previewSeries(id);
  const changingFormat =
    (input.pattern !== undefined && input.pattern !== existing.pattern) ||
    (input.prefix !== undefined && input.prefix !== existing.prefix) ||
    (input.padding !== undefined && input.padding !== existing.padding);

  if (changingFormat && lastNumber > 0) {
    throw new BusinessRuleError(
      `${lastNumber} document(s) have already been numbered in this financial year. The format can only be changed at the start of a year, otherwise one series would contain two different shapes.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.numberingSeries.update({ where: { id }, data: input });
    await recordAudit(
      {
        action: 'MASTER_UPDATED',
        entityType: 'MASTER',
        entityId: id,
        entityLabel: `Numbering ${updated.docType}`,
        previousData: existing,
        newData: updated,
      },
      tx,
    );
  });

  const record = (await listNumberingSeries()).find((entry) => entry.id === id);
  if (!record) throw new NotFoundError('Numbering series');
  return record;
};

// --------------------------------------------------------- exchange rates ---

export const listExchangeRates = async (limit = 50) => {
  const rates = await prisma.exchangeRate.findMany({
    orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
    take: limit,
  });

  return rates.map((rate) => ({
    id: rate.id.toString(),
    fromCurrency: rate.fromCurrency,
    toCurrency: rate.toCurrency,
    rate: decimalToString(rate.rate),
    effectiveDate: toDateOnlyString(rate.effectiveDate),
    source: rate.source,
  }));
};

export const upsertExchangeRate = async (input: ExchangeRateInput, actorId: number) => {
  if (input.fromCurrency === input.toCurrency) {
    throw new BusinessRuleError('The two currencies must be different.');
  }

  const effectiveDate = new Date(`${input.effectiveDate}T00:00:00.000Z`);

  const rate = await prisma.exchangeRate.upsert({
    where: {
      fromCurrency_toCurrency_effectiveDate: {
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        effectiveDate,
      },
    },
    update: { rate: new Prisma.Decimal(input.rate), createdById: actorId },
    create: {
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      rate: new Prisma.Decimal(input.rate),
      effectiveDate,
      createdById: actorId,
    },
  });

  await recordAudit({
    action: 'MASTER_UPDATED',
    entityType: 'MASTER',
    entityId: rate.id,
    entityLabel: `Exchange rate ${rate.fromCurrency}→${rate.toCurrency}`,
    newData: { rate: decimalToString(rate.rate), effectiveDate: input.effectiveDate },
  });

  return {
    id: rate.id.toString(),
    fromCurrency: rate.fromCurrency,
    toCurrency: rate.toCurrency,
    rate: decimalToString(rate.rate),
    effectiveDate: toDateOnlyString(rate.effectiveDate),
    source: rate.source,
  };
};

/**
 * The rate to use for a document: the most recent one on or before its date.
 * Returns 1 when the currencies match, so the caller never special-cases it.
 */
export const resolveExchangeRate = async (
  fromCurrency: string,
  toCurrency: string,
  onDate: string,
): Promise<Prisma.Decimal> => {
  if (fromCurrency === toCurrency) return new Prisma.Decimal(1);

  const rate = await prisma.exchangeRate.findFirst({
    where: {
      fromCurrency,
      toCurrency,
      effectiveDate: { lte: new Date(`${onDate}T00:00:00.000Z`) },
    },
    orderBy: { effectiveDate: 'desc' },
  });

  return rate?.rate ?? new Prisma.Decimal(1);
};

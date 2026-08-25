import type {
  CreateItemInput,
  ItemFilters,
  ItemRecord,
  ItemType,
  PaginationQuery,
  UpdateItemInput,
} from '@app/shared';
import { parseSort } from '@app/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../utils/errors';
import { recordAudit } from '../../services/audit.service';
import { allocateItemCode } from '../../services/numbering.service';

const SORTABLE = ['name', 'itemCode', 'defaultRate', 'createdAt'] as const;

type ItemWithRelations = Prisma.ItemGetPayload<{
  include: { unit: true; category: true; defaultTaxGroup: true };
}>;

const toRecord = (item: ItemWithRelations): ItemRecord => ({
  id: item.id,
  itemCode: item.itemCode,
  name: item.name,
  description: item.description,
  type: item.type as ItemType,
  unitId: item.unitId,
  unitCode: item.unit?.code ?? null,
  defaultRate: item.defaultRate.toString(),
  currencyCode: item.currencyCode,
  defaultTaxGroupId: item.defaultTaxGroupId,
  defaultTaxGroupName: item.defaultTaxGroup?.name ?? null,
  hsnSacCode: item.hsnSacCode,
  categoryId: item.categoryId,
  categoryName: item.category?.name ?? null,
  status: item.status,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
});

const include = { unit: true, category: true, defaultTaxGroup: true } as const;

export const listItems = async (query: PaginationQuery & ItemFilters) => {
  const { field, direction } = parseSort(query.sort, SORTABLE, {
    field: 'name',
    direction: 'asc',
  });

  const where: Prisma.ItemWhereInput = {
    ...(query.status ? { status: query.status } : { status: { not: 'ARCHIVED' } }),
    ...(query.type ? { type: query.type } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search } },
            { itemCode: { contains: query.search } },
            { description: { contains: query.search } },
            { hsnSacCode: { contains: query.search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.item.findMany({
      where,
      include,
      orderBy: { [field]: direction },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.item.count({ where }),
  ]);

  return { items: rows.map(toRecord), total };
};

export const getItem = async (id: number): Promise<ItemRecord> => {
  const item = await prisma.item.findUnique({ where: { id }, include });
  if (!item) throw new NotFoundError('Item');
  return toRecord(item);
};

const assertReferences = async (input: {
  currencyCode?: string;
  unitId?: number | null;
  defaultTaxGroupId?: number | null;
  categoryId?: number | null;
}): Promise<void> => {
  if (input.currencyCode) {
    const currency = await prisma.currency.findUnique({ where: { code: input.currencyCode } });
    if (!currency || !currency.isActive) {
      throw new BusinessRuleError(`${input.currencyCode} is not an active currency.`);
    }
  }

  if (input.unitId) {
    const unit = await prisma.unit.findUnique({ where: { id: input.unitId } });
    if (!unit || !unit.isActive) throw new BusinessRuleError('That unit does not exist.');
  }

  if (input.defaultTaxGroupId) {
    const group = await prisma.taxGroup.findUnique({ where: { id: input.defaultTaxGroupId } });
    if (!group || !group.isActive) throw new BusinessRuleError('That tax group does not exist.');
  }

  if (input.categoryId) {
    const category = await prisma.itemCategory.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new BusinessRuleError('That category does not exist.');
  }
};

export const createItem = async (input: CreateItemInput, actorId: number): Promise<ItemRecord> => {
  await assertReferences(input);

  if (input.itemCode) {
    const existing = await prisma.item.findUnique({ where: { itemCode: input.itemCode } });
    if (existing) throw new ConflictError(`Item code ${input.itemCode} is already in use.`);
  }

  const created = await prisma.$transaction(async (tx) => {
    const itemCode = input.itemCode ?? (await allocateItemCode(tx));

    const item = await tx.item.create({
      data: {
        itemCode,
        name: input.name,
        description: input.description,
        type: input.type,
        unitId: input.unitId ?? null,
        /* String in, Decimal at rest — money never becomes a float. */
        defaultRate: new Prisma.Decimal(input.defaultRate),
        currencyCode: input.currencyCode,
        defaultTaxGroupId: input.defaultTaxGroupId ?? null,
        hsnSacCode: input.hsnSacCode,
        categoryId: input.categoryId ?? null,
        createdById: actorId,
      },
      include,
    });

    await recordAudit(
      {
        action: 'ITEM_CREATED',
        entityType: 'ITEM',
        entityId: item.id,
        entityLabel: `${item.itemCode} · ${item.name}`,
        newData: {
          name: item.name,
          rate: item.defaultRate.toString(),
          currency: item.currencyCode,
          hsnSac: item.hsnSacCode,
        },
      },
      tx,
    );

    return item;
  });

  return toRecord(created);
};

export const updateItem = async (id: number, input: UpdateItemInput): Promise<ItemRecord> => {
  const existing = await prisma.item.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Item');

  await assertReferences(input);

  if (input.itemCode && input.itemCode !== existing.itemCode) {
    const clash = await prisma.item.findUnique({ where: { itemCode: input.itemCode } });
    if (clash) throw new ConflictError(`Item code ${input.itemCode} is already in use.`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.item.update({
      where: { id },
      data: {
        /* The column is NOT NULL; an omitted code means "leave unchanged". */
        itemCode: input.itemCode ?? undefined,
        name: input.name,
        description: input.description,
        type: input.type,
        unitId: input.unitId,
        defaultRate:
          input.defaultRate === undefined ? undefined : new Prisma.Decimal(input.defaultRate),
        currencyCode: input.currencyCode,
        defaultTaxGroupId: input.defaultTaxGroupId,
        hsnSacCode: input.hsnSacCode,
        categoryId: input.categoryId,
      },
      include,
    });

    await recordAudit(
      {
        action: 'ITEM_UPDATED',
        entityType: 'ITEM',
        entityId: id,
        entityLabel: `${item.itemCode} · ${item.name}`,
        previousData: { name: existing.name, rate: existing.defaultRate.toString() },
        newData: { name: item.name, rate: item.defaultRate.toString() },
      },
      tx,
    );

    return item;
  });

  /* Changing a master rate never touches an existing document: every line
     snapshots its own rate at save time. */
  return toRecord(updated);
};

export const archiveItem = async (id: number, archive: boolean): Promise<ItemRecord> => {
  const existing = await prisma.item.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Item');

  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.item.update({
      where: { id },
      data: { status: archive ? 'ARCHIVED' : 'ACTIVE' },
      include,
    });

    await recordAudit(
      {
        action: 'ITEM_ARCHIVED',
        entityType: 'ITEM',
        entityId: id,
        entityLabel: `${item.itemCode} · ${item.name}`,
        newData: { status: item.status },
      },
      tx,
    );

    return item;
  });

  return toRecord(updated);
};

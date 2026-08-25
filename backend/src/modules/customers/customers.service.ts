import type {
  CreateCustomerInput,
  CustomerFilters,
  CustomerRecord,
  CustomerSummary,
  PaginationQuery,
  TaxTreatment,
  UpdateCustomerInput,
} from '@app/shared';
import { parseSort, toAmountString } from '@app/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../utils/errors';
import { recordAudit } from '../../services/audit.service';
import { allocateCustomerCode } from '../../services/numbering.service';

const SORTABLE = ['name', 'customerCode', 'createdAt', 'updatedAt'] as const;

type CustomerWithRelations = Prisma.CustomerGetPayload<{
  include: { addresses: true; contacts: true };
}>;

const toRecord = (customer: CustomerWithRelations): CustomerRecord => ({
  id: customer.id,
  customerCode: customer.customerCode,
  name: customer.name,
  companyName: customer.companyName,
  contactPerson: customer.contactPerson,
  email: customer.email,
  phone: customer.phone,
  altPhone: customer.altPhone,
  gstin: customer.gstin,
  pan: customer.pan,
  otherTaxId: customer.otherTaxId,
  taxTreatment: customer.taxTreatment as TaxTreatment,
  placeOfSupplyStateCode: customer.placeOfSupplyStateCode,
  defaultCurrencyCode: customer.defaultCurrencyCode,
  paymentTermsDays: customer.paymentTermsDays,
  notes: customer.notes,
  status: customer.status,
  createdAt: customer.createdAt.toISOString(),
  updatedAt: customer.updatedAt.toISOString(),
  addresses: customer.addresses.map((address) => ({
    id: address.id,
    type: address.type,
    label: address.label,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    stateCode: address.stateCode,
    country: address.country,
    postalCode: address.postalCode,
    isDefault: address.isDefault,
  })),
  contacts: customer.contacts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    designation: contact.designation,
    email: contact.email,
    phone: contact.phone,
    isPrimary: contact.isPrimary,
  })),
});

export const listCustomers = async (query: PaginationQuery & CustomerFilters) => {
  const { field, direction } = parseSort(query.sort, SORTABLE, {
    field: 'name',
    direction: 'asc',
  });

  const where: Prisma.CustomerWhereInput = {
    ...(query.status ? { status: query.status } : { status: { not: 'ARCHIVED' } }),
    ...(query.currencyCode ? { defaultCurrencyCode: query.currencyCode } : {}),
    ...(query.taxTreatment ? { taxTreatment: query.taxTreatment } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search } },
            { companyName: { contains: query.search } },
            { customerCode: { contains: query.search } },
            { email: { contains: query.search } },
            { phone: { contains: query.search } },
            { gstin: { contains: query.search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { addresses: true, contacts: true },
      orderBy: { [field]: direction },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return { items: rows.map(toRecord), total };
};

export const getCustomer = async (id: number): Promise<CustomerRecord> => {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { addresses: true, contacts: true },
  });
  if (!customer) throw new NotFoundError('Customer');
  return toRecord(customer);
};

/** A registered business needs a GSTIN; checked against the merged record on update. */
const assertGstinRule = (taxTreatment: string, gstin: string | null | undefined): void => {
  if (taxTreatment === 'REGISTERED' && !gstin) {
    throw new BusinessRuleError('A registered business needs a GSTIN.');
  }
};

const assertCurrencyActive = async (code: string): Promise<void> => {
  const currency = await prisma.currency.findUnique({ where: { code } });
  if (!currency || !currency.isActive) {
    throw new BusinessRuleError(`${code} is not an active currency.`);
  }
};

export const createCustomer = async (
  input: CreateCustomerInput,
  actorId: number,
): Promise<CustomerRecord> => {
  await assertCurrencyActive(input.defaultCurrencyCode);

  if (input.customerCode) {
    const existing = await prisma.customer.findUnique({
      where: { customerCode: input.customerCode },
    });
    if (existing) throw new ConflictError(`Customer code ${input.customerCode} is already in use.`);
  }

  const created = await prisma.$transaction(async (tx) => {
    const customerCode = input.customerCode ?? (await allocateCustomerCode(tx));

    const customer = await tx.customer.create({
      data: {
        customerCode,
        name: input.name,
        companyName: input.companyName,
        contactPerson: input.contactPerson,
        email: input.email,
        phone: input.phone,
        altPhone: input.altPhone,
        gstin: input.gstin,
        pan: input.pan,
        otherTaxId: input.otherTaxId,
        taxTreatment: input.taxTreatment,
        placeOfSupplyStateCode: input.placeOfSupplyStateCode,
        defaultCurrencyCode: input.defaultCurrencyCode,
        paymentTermsDays: input.paymentTermsDays,
        notes: input.notes,
        createdById: actorId,
        addresses: { create: input.addresses },
        contacts: { create: input.contacts },
      },
      include: { addresses: true, contacts: true },
    });

    await recordAudit(
      {
        action: 'CUSTOMER_CREATED',
        entityType: 'CUSTOMER',
        entityId: customer.id,
        entityLabel: `${customer.customerCode} · ${customer.name}`,
        newData: {
          name: customer.name,
          gstin: customer.gstin,
          currency: customer.defaultCurrencyCode,
        },
      },
      tx,
    );

    return customer;
  });

  return toRecord(created);
};

export const updateCustomer = async (
  id: number,
  input: UpdateCustomerInput,
): Promise<CustomerRecord> => {
  const existing = await prisma.customer.findUnique({
    where: { id },
    include: { addresses: true, contacts: true },
  });
  if (!existing) throw new NotFoundError('Customer');

  const taxTreatment = input.taxTreatment ?? existing.taxTreatment;
  const gstin = input.gstin === undefined ? existing.gstin : input.gstin;
  assertGstinRule(taxTreatment, gstin);

  if (input.defaultCurrencyCode && input.defaultCurrencyCode !== existing.defaultCurrencyCode) {
    await assertCurrencyActive(input.defaultCurrencyCode);
  }

  if (input.customerCode && input.customerCode !== existing.customerCode) {
    const clash = await prisma.customer.findUnique({
      where: { customerCode: input.customerCode },
    });
    if (clash) throw new ConflictError(`Customer code ${input.customerCode} is already in use.`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    /* Addresses and contacts are replaced wholesale when supplied: the editor
       submits the full set, and diffing rows client-side would be error-prone. */
    if (input.addresses) {
      await tx.customerAddress.deleteMany({ where: { customerId: id } });
      await tx.customerAddress.createMany({
        data: input.addresses.map((address) => ({ ...address, customerId: id })),
      });
    }

    if (input.contacts) {
      await tx.customerContact.deleteMany({ where: { customerId: id } });
      await tx.customerContact.createMany({
        data: input.contacts.map((contact) => ({ ...contact, customerId: id })),
      });
    }

    const customer = await tx.customer.update({
      where: { id },
      data: {
        /* The column is NOT NULL; an omitted code means "leave unchanged". */
        customerCode: input.customerCode ?? undefined,
        name: input.name,
        companyName: input.companyName,
        contactPerson: input.contactPerson,
        email: input.email,
        phone: input.phone,
        altPhone: input.altPhone,
        gstin: input.gstin,
        pan: input.pan,
        otherTaxId: input.otherTaxId,
        taxTreatment: input.taxTreatment,
        placeOfSupplyStateCode: input.placeOfSupplyStateCode,
        defaultCurrencyCode: input.defaultCurrencyCode,
        paymentTermsDays: input.paymentTermsDays,
        notes: input.notes,
      },
      include: { addresses: true, contacts: true },
    });

    await recordAudit(
      {
        action: 'CUSTOMER_UPDATED',
        entityType: 'CUSTOMER',
        entityId: id,
        entityLabel: `${customer.customerCode} · ${customer.name}`,
        previousData: {
          name: existing.name,
          gstin: existing.gstin,
          currency: existing.defaultCurrencyCode,
          paymentTermsDays: existing.paymentTermsDays,
        },
        newData: {
          name: customer.name,
          gstin: customer.gstin,
          currency: customer.defaultCurrencyCode,
          paymentTermsDays: customer.paymentTermsDays,
        },
      },
      tx,
    );

    return customer;
  });

  return toRecord(updated);
};

/**
 * Archive rather than delete: a customer referenced by a document can never be
 * removed, and the reference is exactly why the record still matters.
 */
export const archiveCustomer = async (id: number, archive: boolean): Promise<CustomerRecord> => {
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Customer');

  const updated = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.update({
      where: { id },
      data: { status: archive ? 'ARCHIVED' : 'ACTIVE' },
      include: { addresses: true, contacts: true },
    });

    await recordAudit(
      {
        action: 'CUSTOMER_ARCHIVED',
        entityType: 'CUSTOMER',
        entityId: id,
        entityLabel: `${customer.customerCode} · ${customer.name}`,
        newData: { status: customer.status },
      },
      tx,
    );

    return customer;
  });

  return toRecord(updated);
};

/**
 * Totals for the detail page, grouped by currency.
 *
 * Deliberately not one figure: adding INR to USD would be meaningless, so each
 * currency is reported separately alongside a base-currency roll-up (decision Q3).
 */
export const getCustomerSummary = async (id: number): Promise<CustomerSummary> => {
  const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
  if (!customer) throw new NotFoundError('Customer');

  const company = await prisma.companySettings.findUnique({
    where: { id: 1 },
    select: { baseCurrencyCode: true },
  });
  const baseCurrencyCode = company?.baseCurrencyCode ?? 'INR';

  const [quotationTotals, invoiceTotals, quotationCount, invoiceCount] = await Promise.all([
    prisma.quotation.groupBy({
      by: ['currencyCode'],
      where: { customerId: id, deletedAt: null },
      _sum: { grandTotal: true },
    }),
    prisma.invoice.groupBy({
      by: ['currencyCode'],
      where: { customerId: id, deletedAt: null, status: { notIn: ['CANCELLED', 'VOID'] } },
      _sum: { grandTotal: true, amountPaid: true, baseTotal: true },
    }),
    prisma.quotation.count({ where: { customerId: id, deletedAt: null } }),
    prisma.invoice.count({ where: { customerId: id, deletedAt: null } }),
  ]);

  const codes = new Set<string>([
    ...quotationTotals.map((row) => row.currencyCode),
    ...invoiceTotals.map((row) => row.currencyCode),
  ]);

  const byCurrency = [...codes].sort().map((currencyCode) => {
    const quotation = quotationTotals.find((row) => row.currencyCode === currencyCode);
    const invoice = invoiceTotals.find((row) => row.currencyCode === currencyCode);
    const invoiced = invoice?._sum.grandTotal ?? new Prisma.Decimal(0);
    const paid = invoice?._sum.amountPaid ?? new Prisma.Decimal(0);

    return {
      currencyCode,
      quotationTotal: (quotation?._sum.grandTotal ?? new Prisma.Decimal(0)).toString(),
      invoiceTotal: invoiced.toString(),
      outstanding: invoiced.minus(paid).toString(),
    };
  });

  const baseInvoiceTotal = invoiceTotals.reduce(
    (total, row) => total.plus(row._sum.baseTotal ?? 0),
    new Prisma.Decimal(0),
  );

  /* Outstanding in base currency uses each document's own captured rate, which is
     why it is derived from baseTotal rather than converted here. */
  const baseOutstanding = invoiceTotals.reduce((total, row) => {
    const invoiced = row._sum.grandTotal ?? new Prisma.Decimal(0);
    const paid = row._sum.amountPaid ?? new Prisma.Decimal(0);
    const base = row._sum.baseTotal ?? new Prisma.Decimal(0);
    if (invoiced.isZero()) return total;
    const unpaidShare = invoiced.minus(paid).dividedBy(invoiced);
    return total.plus(base.times(unpaidShare));
  }, new Prisma.Decimal(0));

  return {
    quotationCount,
    invoiceCount,
    byCurrency,
    baseCurrencyCode,
    /* Through the shared money helper so the rounding rule is the same one the
       documents and the PDFs use. */
    baseInvoiceTotal: toAmountString(baseInvoiceTotal.toString(), 4),
    baseOutstanding: toAmountString(baseOutstanding.toString(), 4),
  };
};

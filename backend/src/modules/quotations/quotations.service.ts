import { Prisma, type QuotationStatus } from '@prisma/client';
import {
  amountInWords,
  calculateDocument,
  parseSort,
  toDateOnlyString,
  type CalcLineInput,
  type CreateQuotationInput,
  type DocumentFilters,
  type PaginationQuery,
  type QuotationListRow,
  type QuotationRecord,
  type UpdateQuotationInput,
} from '@app/shared';
import { prisma, type TransactionClient } from '../../db/prisma';
import {
  BusinessRuleError,
  ImmutableResourceError,
  NotFoundError,
} from '../../utils/errors';
import { recordAudit } from '../../services/audit.service';
import { allocateNumber } from '../../services/numbering.service';
import { resolveTaxGroups } from '../../services/tax.service';
import { assertChangeReason, recordRevision } from '../../services/revision.service';
import { quotationInclude, type QuotationWithRelations } from './document-data';
import { toQuotationRecord } from './quotations.mapper';

/**
 * Quotations.
 *
 * Every figure on a saved quotation is produced here, by the shared calculation
 * engine, inside the same transaction that assigns the number. Nothing the client
 * sends about money is trusted — the request schema does not even carry totals.
 */

const SORTABLE = ['number', 'documentDate', 'grandTotal', 'createdAt'] as const;

const toDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

/** Statuses after which an edit must record a revision with a reason. */
const isDraft = (status: QuotationStatus): boolean => status === 'DRAFT';

/** Derived, never stored, so it cannot go stale (PRD §18). */
export const isExpired = (quotation: {
  status: QuotationStatus;
  expiryDate: Date | null;
}): boolean => {
  if (!quotation.expiryDate) return false;
  if (['ACCEPTED', 'CONVERTED', 'DECLINED', 'CANCELLED'].includes(quotation.status)) return false;
  return toDateOnlyString(quotation.expiryDate) < toDateOnlyString(new Date());
};

// ------------------------------------------------------------ preparation ---

interface PreparedDocument {
  data: Prisma.QuotationUncheckedCreateInput;
  items: {
    line: Omit<Prisma.QuotationItemUncheckedCreateInput, 'quotationId'>;
    taxes: Omit<Prisma.QuotationItemTaxUncheckedCreateInput, 'quotationItemId'>[];
  }[];
}

/**
 * Turns a validated request into the rows to persist.
 *
 * This is where snapshots are taken and the engine is run. It is deliberately one
 * function for create and update so the two can never diverge in how they compute.
 */
const prepareDocument = async (
  tx: TransactionClient,
  input: CreateQuotationInput,
  actorId: number,
): Promise<PreparedDocument> => {
  const documentDate = toDate(input.documentDate);

  const [customer, currency, company] = await Promise.all([
    tx.customer.findUnique({
      where: { id: input.customerId },
      include: { addresses: true },
    }),
    tx.currency.findUnique({ where: { code: input.currencyCode } }),
    tx.companySettings.findUnique({ where: { id: 1 } }),
  ]);

  if (!customer) throw new BusinessRuleError('That customer does not exist.');
  if (customer.status === 'ARCHIVED') {
    throw new BusinessRuleError(
      `${customer.name} is archived. Restore the customer before raising a document for them.`,
    );
  }
  if (!currency || !currency.isActive) {
    throw new BusinessRuleError(`${input.currencyCode} is not an active currency.`);
  }
  if (!company) throw new BusinessRuleError('Company settings are missing. Run the seed.');

  /* Resolve the template: the one asked for, else the configured default. */
  const templateId = input.templateId ?? company.defaultQuotationTemplateId;
  if (!templateId) {
    throw new BusinessRuleError(
      'No default quotation template is set. Choose one in Templates before creating a quotation.',
    );
  }

  const template = await tx.template.findUnique({
    where: { id: templateId },
    include: { versions: { where: { status: 'PUBLISHED' }, orderBy: { version: 'desc' }, take: 1 } },
  });

  if (!template || template.docType !== 'QUOTATION') {
    throw new BusinessRuleError('That template cannot be used for a quotation.');
  }

  const templateVersion = template.versions[0];
  if (!templateVersion) {
    throw new BusinessRuleError(
      `"${template.name}" has no published version. Publish one before using it.`,
    );
  }

  /* Address snapshots: the chosen address, else the customer's default. */
  const pickAddress = (id: number | null | undefined, type: 'BILLING' | 'SHIPPING') => {
    const address =
      (id ? customer.addresses.find((entry) => entry.id === id) : undefined) ??
      customer.addresses.find((entry) => entry.type === type && entry.isDefault) ??
      customer.addresses.find((entry) => entry.type === type);

    return address
      ? {
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          stateCode: address.stateCode,
          country: address.country,
          postalCode: address.postalCode,
        }
      : null;
  };

  const billingAddress = pickAddress(input.billingAddressId, 'BILLING');
  const shippingAddress = pickAddress(input.shippingAddressId, 'SHIPPING');

  // --- taxes -------------------------------------------------------------
  const groupIds = input.items
    .map((item) => item.taxGroupId)
    .filter((id): id is number => typeof id === 'number');

  const groups = await resolveTaxGroups(groupIds, documentDate, tx);

  const calcLines: CalcLineInput[] = input.items.map((item) => ({
    quantity: item.quantity,
    rate: item.rate,
    discountMode: item.discountMode,
    discountValue: item.discountValue,
    isTaxExempt: item.isTaxExempt,
    taxes: item.taxGroupId ? (groups.get(item.taxGroupId)?.components ?? []) : [],
  }));

  // --- the authoritative calculation --------------------------------------
  const baseCurrency = await tx.currency.findUnique({
    where: { code: company.baseCurrencyCode },
  });

  const calculated = calculateDocument({
    decimalPlaces: currency.decimalPlaces,
    lines: calcLines,
    discountMode: input.discountMode,
    discountValue: input.discountValue,
    adjustment: input.adjustment,
    roundOffEnabled: input.roundOffEnabled,
    exchangeRateToBase: input.exchangeRateToBase,
    baseDecimalPlaces: baseCurrency?.decimalPlaces ?? 2,
  });

  const currencyFormat = {
    code: currency.code,
    symbol: currency.symbol,
    decimalPlaces: currency.decimalPlaces,
    symbolPosition: currency.symbolPosition,
    separatorStyle: currency.separatorStyle,
  };

  /* Frozen so the printed breakdown is reproducible even if tax masters change. */
  const taxSummary = {
    byComponent: calculated.taxSummary.map((row) => ({
      label: row.label,
      taxTypeKey: row.taxTypeKey,
      ratePercent: row.ratePercent,
      taxableAmount: row.taxableAmount,
      taxAmount: row.taxAmount,
    })),
    amountInWords: amountInWords(calculated.grandTotal, currencyFormat),
  };

  const items = input.items.map((item, index) => {
    const computed = calculated.lines[index];
    if (!computed) throw new BusinessRuleError('Line calculation failed.');

    return {
      line: {
        lineNumber: index + 1,
        sortOrder: index,
        itemId: item.itemId ?? null,
        itemCode: null,
        name: item.name,
        description: item.description,
        hsnSacCode: item.hsnSacCode,
        unitCode: item.unitCode,
        quantity: new Prisma.Decimal(item.quantity),
        rate: new Prisma.Decimal(item.rate),
        discountMode: item.discountMode,
        discountValue: new Prisma.Decimal(item.discountValue),
        discountAmount: new Prisma.Decimal(computed.discountAmount),
        lineGross: new Prisma.Decimal(computed.lineGross),
        lineNet: new Prisma.Decimal(computed.lineNet),
        allocatedDocDiscount: new Prisma.Decimal(computed.allocatedDocDiscount),
        taxableAmount: new Prisma.Decimal(computed.taxableAmount),
        taxAmount: new Prisma.Decimal(computed.taxAmount),
        lineTotal: new Prisma.Decimal(computed.lineTotal),
        taxGroupId: item.taxGroupId ?? null,
        isTaxExempt: item.isTaxExempt,
        exemptReason: item.exemptReason,
      },
      taxes: computed.taxes.map((tax) => ({
        taxRateId: tax.taxRateId,
        taxTypeKey: tax.taxTypeKey,
        label: tax.label,
        ratePercent: new Prisma.Decimal(tax.ratePercent),
        taxableAmount: new Prisma.Decimal(tax.taxableAmount),
        taxAmount: new Prisma.Decimal(tax.taxAmount),
      })),
    };
  });

  return {
    data: {
      number: '',
      financialYearId: 0,
      customerId: customer.id,
      customerSnapshot: {
        name: customer.name,
        customerCode: customer.customerCode,
        companyName: customer.companyName,
        contactPerson: customer.contactPerson,
        email: customer.email,
        phone: customer.phone,
        gstin: customer.gstin,
        pan: customer.pan,
        taxTreatment: customer.taxTreatment,
      } as Prisma.InputJsonValue,
      billingAddressSnapshot: (billingAddress ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      shippingAddressSnapshot: (shippingAddress ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      companySnapshot: {
        name: company.companyName,
        legalName: company.legalName,
        address: {
          line1: company.addressLine1,
          line2: company.addressLine2,
          city: company.city,
          state: company.state,
          stateCode: company.stateCode,
          country: company.country,
          postalCode: company.postalCode,
        },
        phone: company.phone,
        email: company.email,
        website: company.website,
        gstin: company.gstin,
        pan: company.pan,
        cin: company.cin,
        stateCode: company.stateCode,
        signatureLabel: company.signatureLabel,
      } as Prisma.InputJsonValue,
      placeOfSupplyStateCode:
        input.placeOfSupplyStateCode ?? customer.placeOfSupplyStateCode ?? null,

      currencyCode: currency.code,
      currencySymbol: currency.symbol,
      currencyDecimalPlaces: currency.decimalPlaces,
      exchangeRateToBase: new Prisma.Decimal(input.exchangeRateToBase),
      baseCurrencyCode: company.baseCurrencyCode,
      baseTotal: new Prisma.Decimal(calculated.baseTotal),

      documentDate,
      expiryDate: input.expiryDate ? toDate(input.expiryDate) : null,
      referenceNumber: input.referenceNumber,
      subject: input.subject,

      discountMode: input.discountMode,
      discountValue: new Prisma.Decimal(input.discountValue),
      subtotal: new Prisma.Decimal(calculated.subtotal),
      discountTotal: new Prisma.Decimal(calculated.discountTotal),
      taxableTotal: new Prisma.Decimal(calculated.taxableTotal),
      taxTotal: new Prisma.Decimal(calculated.taxTotal),
      adjustment: new Prisma.Decimal(calculated.adjustment),
      roundOff: new Prisma.Decimal(calculated.roundOff),
      roundOffEnabled: input.roundOffEnabled,
      grandTotal: new Prisma.Decimal(calculated.grandTotal),
      taxSummaryJson: taxSummary as Prisma.InputJsonValue,

      notes: input.notes,
      terms: input.terms ?? company.defaultTermsQuotation,
      customerMessage: input.customerMessage,
      paymentInstructions: input.paymentInstructions,
      bankAccountId: input.bankAccountId ?? null,
      showBankDetails: input.showBankDetails,

      templateId: template.id,
      templateVersionId: templateVersion.id,
      customFieldsJson: input.customFields as Prisma.InputJsonValue,

      createdById: actorId,
    },
    items,
  };
};

// ---------------------------------------------------------------- queries ---

export const listQuotations = async (query: PaginationQuery & DocumentFilters) => {
  const { field, direction } = parseSort(query.sort, SORTABLE, {
    field: 'documentDate',
    direction: 'desc',
  });

  const where: Prisma.QuotationWhereInput = {
    deletedAt: null,
    ...(query.status ? { status: query.status as QuotationStatus } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.currencyCode ? { currencyCode: query.currencyCode } : {}),
    ...(query.financialYearId ? { financialYearId: query.financialYearId } : {}),
    ...(query.createdById ? { createdById: query.createdById } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          documentDate: {
            ...(query.dateFrom ? { gte: toDate(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: toDate(query.dateTo) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { number: { contains: query.search } },
            { referenceNumber: { contains: query.search } },
            { subject: { contains: query.search } },
            { customer: { name: { contains: query.search } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        currency: true,
        createdBy: { select: { name: true } },
        invoices: { select: { number: true }, take: 1 },
      },
      orderBy: { [field]: direction },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.quotation.count({ where }),
  ]);

  const items: QuotationListRow[] = rows.map((row) => ({
    id: row.id.toString(),
    number: row.number,
    status: row.status,
    customerId: row.customerId,
    customerName: row.customer.name,
    documentDate: toDateOnlyString(row.documentDate),
    expiryDate: row.expiryDate ? toDateOnlyString(row.expiryDate) : null,
    currencyCode: row.currencyCode,
    currencySymbol: row.currencySymbol,
    currencyDecimalPlaces: row.currencyDecimalPlaces,
    grandTotal: row.grandTotal.toString(),
    createdByName: row.createdBy.name,
    createdAt: row.createdAt.toISOString(),
    isExpired: isExpired(row),
    convertedInvoiceNumber: row.invoices[0]?.number ?? null,
  }));

  return { items, total };
};

export const findQuotation = async (id: bigint): Promise<QuotationWithRelations> => {
  const quotation = await prisma.quotation.findFirst({
    where: { id, deletedAt: null },
    include: quotationInclude,
  });
  if (!quotation) throw new NotFoundError('Quotation');
  return quotation;
};

export const getQuotation = async (id: bigint): Promise<QuotationRecord> =>
  toQuotationRecord(await findQuotation(id));

// ----------------------------------------------------------------- writes ---

export const createQuotation = async (
  input: CreateQuotationInput,
  actorId: number,
): Promise<QuotationRecord> => {
  const created = await prisma.$transaction(async (tx) => {
    const prepared = await prepareDocument(tx, input, actorId);

    /* Number and financial year come from the document date, allocated under a
       row lock inside this transaction — so a failed save burns no number. */
    const allocated = await allocateNumber(tx, 'QUOTATION', input.documentDate);

    const quotation = await tx.quotation.create({
      data: {
        ...prepared.data,
        number: allocated.number,
        financialYearId: allocated.financialYearId,
      },
    });

    for (const item of prepared.items) {
      const line = await tx.quotationItem.create({
        data: { ...item.line, quotationId: quotation.id },
      });
      if (item.taxes.length > 0) {
        await tx.quotationItemTax.createMany({
          data: item.taxes.map((tax) => ({ ...tax, quotationItemId: line.id })),
        });
      }
    }

    await recordAudit(
      {
        action: 'QUOTATION_CREATED',
        entityType: 'QUOTATION',
        entityId: quotation.id,
        entityLabel: quotation.number,
        newData: {
          customer: input.customerId,
          currency: quotation.currencyCode,
          grandTotal: quotation.grandTotal.toString(),
          lines: input.items.length,
        },
      },
      tx,
    );

    return quotation.id;
  });

  return getQuotation(created);
};

/** A compact snapshot for the revision history — the shape a diff reads well over. */
const snapshotFor = (quotation: QuotationWithRelations) => ({
  customerId: quotation.customerId,
  documentDate: toDateOnlyString(quotation.documentDate),
  expiryDate: quotation.expiryDate ? toDateOnlyString(quotation.expiryDate) : null,
  referenceNumber: quotation.referenceNumber,
  subject: quotation.subject,
  currencyCode: quotation.currencyCode,
  exchangeRateToBase: quotation.exchangeRateToBase.toString(),
  placeOfSupplyStateCode: quotation.placeOfSupplyStateCode,
  discountMode: quotation.discountMode,
  discountValue: quotation.discountValue.toString(),
  subtotal: quotation.subtotal.toString(),
  discountTotal: quotation.discountTotal.toString(),
  taxableTotal: quotation.taxableTotal.toString(),
  taxTotal: quotation.taxTotal.toString(),
  adjustment: quotation.adjustment.toString(),
  roundOff: quotation.roundOff.toString(),
  roundOffEnabled: quotation.roundOffEnabled,
  grandTotal: quotation.grandTotal.toString(),
  notes: quotation.notes,
  terms: quotation.terms,
  customerMessage: quotation.customerMessage,
  paymentInstructions: quotation.paymentInstructions,
  bankAccountId: quotation.bankAccountId,
  showBankDetails: quotation.showBankDetails,
  templateVersionId: quotation.templateVersionId,
  status: quotation.status,
  items: quotation.items.map((item) => ({
    name: item.name,
    description: item.description,
    quantity: item.quantity.toString(),
    rate: item.rate.toString(),
    discountAmount: item.discountAmount.toString(),
    taxableAmount: item.taxableAmount.toString(),
    taxAmount: item.taxAmount.toString(),
    lineTotal: item.lineTotal.toString(),
  })),
});

export const updateQuotation = async (
  id: bigint,
  input: UpdateQuotationInput,
  actorId: number,
): Promise<QuotationRecord> => {
  const existing = await findQuotation(id);

  if (existing.status === 'CANCELLED' || existing.status === 'CONVERTED') {
    throw new ImmutableResourceError(
      existing.status === 'CONVERTED'
        ? `${existing.number} has been converted to an invoice and can no longer be changed.`
        : `${existing.number} is cancelled and can no longer be changed.`,
    );
  }

  const draft = isDraft(existing.status);
  assertChangeReason(existing.status, input.changeReason);

  const previous = snapshotFor(existing);

  /* Merge the partial payload over the stored document so the engine always sees
     a complete input — a PATCH of one field still recalculates everything. */
  const merged: CreateQuotationInput = {
    customerId: input.customerId ?? existing.customerId,
    documentDate: input.documentDate ?? toDateOnlyString(existing.documentDate),
    expiryDate:
      input.expiryDate !== undefined
        ? input.expiryDate
        : existing.expiryDate
          ? toDateOnlyString(existing.expiryDate)
          : null,
    referenceNumber:
      input.referenceNumber !== undefined ? input.referenceNumber : existing.referenceNumber,
    subject: input.subject !== undefined ? input.subject : existing.subject,
    currencyCode: input.currencyCode ?? existing.currencyCode,
    exchangeRateToBase: input.exchangeRateToBase ?? existing.exchangeRateToBase.toString(),
    placeOfSupplyStateCode:
      input.placeOfSupplyStateCode !== undefined
        ? input.placeOfSupplyStateCode
        : existing.placeOfSupplyStateCode,
    billingAddressId: input.billingAddressId ?? null,
    shippingAddressId: input.shippingAddressId ?? null,
    templateId: input.templateId ?? existing.templateId,
    bankAccountId: input.bankAccountId !== undefined ? input.bankAccountId : existing.bankAccountId,
    showBankDetails: input.showBankDetails ?? existing.showBankDetails,
    discountMode: input.discountMode ?? existing.discountMode,
    discountValue: input.discountValue ?? existing.discountValue.toString(),
    adjustment: input.adjustment ?? existing.adjustment.toString(),
    roundOffEnabled: input.roundOffEnabled ?? existing.roundOffEnabled,
    notes: input.notes !== undefined ? input.notes : existing.notes,
    terms: input.terms !== undefined ? input.terms : existing.terms,
    customerMessage:
      input.customerMessage !== undefined ? input.customerMessage : existing.customerMessage,
    paymentInstructions:
      input.paymentInstructions !== undefined
        ? input.paymentInstructions
        : existing.paymentInstructions,
    customFields:
      input.customFields ??
      (Array.isArray(existing.customFieldsJson)
        ? (existing.customFieldsJson as { label: string; value: string }[])
        : []),
    items:
      input.items ??
      existing.items.map((item) => ({
        itemId: item.itemId,
        name: item.name,
        description: item.description,
        hsnSacCode: item.hsnSacCode,
        unitCode: item.unitCode,
        quantity: item.quantity.toString(),
        rate: item.rate.toString(),
        discountMode: item.discountMode,
        discountValue: item.discountValue.toString(),
        taxGroupId: item.taxGroupId,
        isTaxExempt: item.isTaxExempt,
        exemptReason: item.exemptReason,
      })),
  };

  await prisma.$transaction(async (tx) => {
    const prepared = await prepareDocument(tx, merged, existing.createdById);

    /* The number, financial year and creator never change on an update. */
    const { number: _n, financialYearId: _f, createdById: _c, ...updatable } = prepared.data;

    await tx.quotationItem.deleteMany({ where: { quotationId: id } });

    await tx.quotation.update({
      where: { id },
      data: {
        ...updatable,
        updatedById: actorId,
        /* A revision is recorded only once the document has left DRAFT. */
        currentVersion: draft ? existing.currentVersion : existing.currentVersion + 1,
      },
    });

    for (const item of prepared.items) {
      const line = await tx.quotationItem.create({
        data: { ...item.line, quotationId: id },
      });
      if (item.taxes.length > 0) {
        await tx.quotationItemTax.createMany({
          data: item.taxes.map((tax) => ({ ...tax, quotationItemId: line.id })),
        });
      }
    }

    if (!draft) {
      const updated = await tx.quotation.findUniqueOrThrow({
        where: { id },
        include: quotationInclude,
      });

      await recordRevision(tx, {
        entity: 'QUOTATION',
        documentId: id,
        currentVersion: existing.currentVersion,
        changedById: actorId,
        changeReason: input.changeReason,
        previousData: previous,
        newData: snapshotFor(updated),
      });
    }

    await recordAudit(
      {
        action: 'QUOTATION_UPDATED',
        entityType: 'QUOTATION',
        entityId: id,
        entityLabel: existing.number,
        previousData: { grandTotal: previous.grandTotal, status: previous.status },
        metadata: { reason: input.changeReason ?? null, versioned: !draft },
      },
      tx,
    );
  });

  return getQuotation(id);
};

import { Prisma, type InvoiceStatus, type QuotationStatus } from '@prisma/client';
import {
  STATUS_LABELS,
  toAmountString,
  toDateOnlyString,
  type CurrencyFormat,
  type AuditFilters,
  type ReportColumn,
  type ReportFilters,
} from '@app/shared';
import { prisma } from '../../db/prisma';
import { overdueOf, outstandingOf } from '../invoices/invoices.payments';
import { AUDIT_EXPORT_COLUMNS, auditRows } from '../audit/audit-log.service';

/**
 * The report queries.
 *
 * Each report is defined once — its columns, its `where` clause and how a row
 * becomes cells — and both the screen and every export format read that one
 * definition. There is deliberately no second query for exporting: "the export
 * contains exactly what the list showed" is then a property of the code rather
 * than something that has to be kept true by hand.
 *
 * Rows are produced through an async generator so an export can stream a hundred
 * thousand of them without ever holding more than one page in memory.
 */

const PAGE = 500;

const toDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

export interface ReportDefinition {
  kind: string;
  title: string;
  columns: ReportColumn[];
  /** Counts the whole filtered set, whatever the page size. */
  count: (filters: ReportFilters) => Promise<number>;
  /** Yields every row of the filtered set, a page at a time. */
  rows: (filters: ReportFilters, limit?: number) => AsyncGenerator<Record<string, string>>;
  /** Per-currency totals over the whole filtered set. */
  totals: (filters: ReportFilters) => Promise<
    {
      currencyCode: string;
      currencySymbol: string;
      currencyDecimalPlaces: number;
      count: number;
      values: Record<string, string>;
    }[]
  >;
}

/** Currency metadata, cached per call so a thousand rows do not mean a thousand reads. */
const currencyMap = async (): Promise<Map<string, CurrencyFormat>> => {
  const currencies = await prisma.currency.findMany();
  return new Map(
    currencies.map((currency) => [
      currency.code,
      {
        code: currency.code,
        symbol: currency.symbol,
        decimalPlaces: currency.decimalPlaces,
        symbolPosition: currency.symbolPosition,
        separatorStyle: currency.separatorStyle,
      },
    ]),
  );
};

/**
 * A money cell.
 *
 * Raw and ungrouped — "94400.00", not "94,400.00". The definition produces the
 * value; each renderer decides how it should look. The screen and the PDF group
 * it for reading, the spreadsheet turns it into a real number, and the CSV leaves
 * it exactly as it is so whatever imports it next does not have to strip commas.
 */
const amountIn =
  (currencies: Map<string, CurrencyFormat>, code: string) =>
  (value: Prisma.Decimal): string =>
    toAmountString(value.toString(), currencies.get(code)?.decimalPlaces ?? 2);

const dateWindow = (filters: ReportFilters) =>
  filters.dateFrom || filters.dateTo
    ? {
        documentDate: {
          ...(filters.dateFrom ? { gte: toDate(filters.dateFrom) } : {}),
          ...(filters.dateTo ? { lte: toDate(filters.dateTo) } : {}),
        },
      }
    : {};

/** The global financial-year selector is a document filter, not a customer filter. */
const financialYearWindow = (filters: ReportFilters) =>
  filters.financialYearId ? { financialYearId: filters.financialYearId } : {};

const documentSearch = (search: string | undefined) =>
  search
    ? {
        OR: [
          { number: { contains: search } },
          { referenceNumber: { contains: search } },
          { subject: { contains: search } },
          { customer: { name: { contains: search } } },
        ],
      }
    : {};

// ------------------------------------------------------------- quotations ---

const quotationWhere = (filters: ReportFilters): Prisma.QuotationWhereInput => ({
  deletedAt: null,
  ...(filters.status ? { status: filters.status as QuotationStatus } : {}),
  ...(filters.customerId ? { customerId: filters.customerId } : {}),
  ...(filters.currencyCode ? { currencyCode: filters.currencyCode } : {}),
  ...financialYearWindow(filters),
  ...(filters.createdById ? { createdById: filters.createdById } : {}),
  ...dateWindow(filters),
  ...documentSearch(filters.search),
});

const quotationReport: ReportDefinition = {
  kind: 'quotations',
  title: 'Quotations',
  columns: [
    { key: 'number', label: 'Number' },
    { key: 'documentDate', label: 'Date', date: true },
    { key: 'expiryDate', label: 'Valid until', date: true, secondary: true },
    { key: 'customerName', label: 'Customer' },
    { key: 'subject', label: 'Subject', secondary: true },
    { key: 'status', label: 'Status' },
    { key: 'currencyCode', label: 'Currency', secondary: true },
    { key: 'subtotal', label: 'Subtotal', numeric: true, secondary: true },
    { key: 'taxTotal', label: 'Tax', numeric: true, secondary: true },
    { key: 'grandTotal', label: 'Total', numeric: true },
    { key: 'convertedTo', label: 'Invoice', secondary: true },
    { key: 'createdByName', label: 'Raised by', secondary: true },
  ],

  count: (filters) => prisma.quotation.count({ where: quotationWhere(filters) }),

  async *rows(filters, limit) {
    const currencies = await currencyMap();
    let skip = 0;
    let yielded = 0;

    for (;;) {
      const batch = await prisma.quotation.findMany({
        where: quotationWhere(filters),
        include: {
          customer: { select: { name: true } },
          createdBy: { select: { name: true } },
          invoices: { select: { number: true }, take: 1 },
        },
        orderBy: [{ documentDate: 'desc' }, { id: 'desc' }],
        skip,
        take: PAGE,
      });

      if (batch.length === 0) return;

      for (const row of batch) {
        const money = amountIn(currencies, row.currencyCode);

        yield {
          number: row.number,
          documentDate: toDateOnlyString(row.documentDate),
          expiryDate: row.expiryDate ? toDateOnlyString(row.expiryDate) : '',
          customerName: row.customer.name,
          subject: row.subject ?? '',
          status: STATUS_LABELS[row.status] ?? row.status,
          currencyCode: row.currencyCode,
          subtotal: money(row.subtotal),
          taxTotal: money(row.taxTotal),
          grandTotal: money(row.grandTotal),
          convertedTo: row.invoices[0]?.number ?? '',
          createdByName: row.createdBy.name,
        };

        yielded += 1;
        if (limit && yielded >= limit) return;
      }

      skip += batch.length;
      if (batch.length < PAGE) return;
    }
  },

  async totals(filters) {
    const currencies = await currencyMap();
    const grouped = await prisma.quotation.groupBy({
      by: ['currencyCode'],
      where: quotationWhere(filters),
      _sum: { subtotal: true, taxTotal: true, grandTotal: true },
      _count: { _all: true },
    });

    return grouped.map((group) => {
      const currency = currencies.get(group.currencyCode);
      const places = currency?.decimalPlaces ?? 2;

      return {
        currencyCode: group.currencyCode,
        currencySymbol: currency?.symbol ?? group.currencyCode,
        currencyDecimalPlaces: places,
        count: group._count._all,
        values: {
          subtotal: toAmountString(group._sum.subtotal?.toString() ?? '0', places),
          taxTotal: toAmountString(group._sum.taxTotal?.toString() ?? '0', places),
          grandTotal: toAmountString(group._sum.grandTotal?.toString() ?? '0', places),
        },
      };
    });
  },
};

// --------------------------------------------------------------- invoices ---

const invoiceWhere = (filters: ReportFilters): Prisma.InvoiceWhereInput => {
  const today = toDate(toDateOnlyString(new Date()));

  return {
    deletedAt: null,
    ...(filters.status === 'OVERDUE'
      ? {
          status: { in: ['ISSUED', 'SENT', 'VIEWED', 'PARTIALLY_PAID'] },
          dueDate: { lt: today },
        }
      : filters.status
        ? { status: filters.status as InvoiceStatus }
        : {}),
    ...(filters.outstandingOnly
      ? { status: { in: ['ISSUED', 'SENT', 'VIEWED', 'PARTIALLY_PAID'] } }
      : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.currencyCode ? { currencyCode: filters.currencyCode } : {}),
    ...financialYearWindow(filters),
    ...(filters.createdById ? { createdById: filters.createdById } : {}),
    ...dateWindow(filters),
    ...documentSearch(filters.search),
  };
};

const invoiceReport: ReportDefinition = {
  kind: 'invoices',
  title: 'Invoices',
  columns: [
    { key: 'number', label: 'Number' },
    { key: 'documentDate', label: 'Date', date: true },
    { key: 'dueDate', label: 'Due', date: true },
    { key: 'customerName', label: 'Customer' },
    { key: 'subject', label: 'Subject', secondary: true },
    { key: 'status', label: 'Status' },
    { key: 'currencyCode', label: 'Currency', secondary: true },
    { key: 'taxableTotal', label: 'Taxable', numeric: true, secondary: true },
    { key: 'taxTotal', label: 'Tax', numeric: true, secondary: true },
    { key: 'grandTotal', label: 'Total', numeric: true },
    { key: 'amountPaid', label: 'Received', numeric: true },
    { key: 'outstanding', label: 'Outstanding', numeric: true },
    { key: 'daysOverdue', label: 'Days late', secondary: true },
    { key: 'quotationNumber', label: 'From quotation', secondary: true },
  ],

  count: (filters) => prisma.invoice.count({ where: invoiceWhere(filters) }),

  async *rows(filters, limit) {
    const currencies = await currencyMap();
    let skip = 0;
    let yielded = 0;

    for (;;) {
      const batch = await prisma.invoice.findMany({
        where: invoiceWhere(filters),
        include: {
          customer: { select: { name: true } },
          sourceQuotation: { select: { number: true } },
        },
        orderBy: [{ documentDate: 'desc' }, { id: 'desc' }],
        skip,
        take: PAGE,
      });

      if (batch.length === 0) return;

      for (const row of batch) {
        const money = amountIn(currencies, row.currencyCode);
        const overdue = overdueOf(row);

        yield {
          number: row.number,
          documentDate: toDateOnlyString(row.documentDate),
          dueDate: row.dueDate ? toDateOnlyString(row.dueDate) : '',
          customerName: row.customer.name,
          subject: row.subject ?? '',
          status: STATUS_LABELS[row.status] ?? row.status,
          currencyCode: row.currencyCode,
          taxableTotal: money(row.taxableTotal),
          taxTotal: money(row.taxTotal),
          grandTotal: money(row.grandTotal),
          amountPaid: money(row.amountPaid),
          outstanding: money(outstandingOf(row)),
          daysOverdue: overdue.isOverdue ? String(overdue.daysOverdue) : '',
          quotationNumber: row.sourceQuotation?.number ?? '',
        };

        yielded += 1;
        if (limit && yielded >= limit) return;
      }

      skip += batch.length;
      if (batch.length < PAGE) return;
    }
  },

  async totals(filters) {
    const currencies = await currencyMap();
    const grouped = await prisma.invoice.groupBy({
      by: ['currencyCode'],
      where: invoiceWhere(filters),
      _sum: { taxableTotal: true, taxTotal: true, grandTotal: true, amountPaid: true },
      _count: { _all: true },
    });

    return grouped.map((group) => {
      const currency = currencies.get(group.currencyCode);
      const places = currency?.decimalPlaces ?? 2;
      const billed = group._sum.grandTotal ?? new Prisma.Decimal(0);
      const paid = group._sum.amountPaid ?? new Prisma.Decimal(0);

      return {
        currencyCode: group.currencyCode,
        currencySymbol: currency?.symbol ?? group.currencyCode,
        currencyDecimalPlaces: places,
        count: group._count._all,
        values: {
          taxableTotal: toAmountString(group._sum.taxableTotal?.toString() ?? '0', places),
          taxTotal: toAmountString(group._sum.taxTotal?.toString() ?? '0', places),
          grandTotal: toAmountString(billed.toString(), places),
          amountPaid: toAmountString(paid.toString(), places),
          outstanding: toAmountString(billed.minus(paid).toString(), places),
        },
      };
    });
  },
};

// -------------------------------------------------------------- customers ---

const customerReport: ReportDefinition = {
  kind: 'customers',
  title: 'Customers',
  columns: [
    { key: 'customerCode', label: 'Code' },
    { key: 'name', label: 'Customer' },
    { key: 'gstin', label: 'GSTIN', secondary: true },
    { key: 'placeOfSupply', label: 'Place of supply', secondary: true },
    { key: 'currencyCode', label: 'Currency', secondary: true },
    { key: 'quotationCount', label: 'Quotations', numeric: true },
    { key: 'invoiceCount', label: 'Invoices', numeric: true },
    { key: 'billed', label: 'Billed', numeric: true },
    { key: 'received', label: 'Received', numeric: true },
    { key: 'outstanding', label: 'Outstanding', numeric: true },
  ],

  count: (filters) =>
    prisma.customer.count({
      where: {
        status: { not: 'ARCHIVED' },
        ...(filters.customerId ? { id: filters.customerId } : {}),
        ...(filters.currencyCode ? { defaultCurrencyCode: filters.currencyCode } : {}),
        ...(filters.search ? { name: { contains: filters.search } } : {}),
      },
    }),

  async *rows(filters, limit) {
    const currencies = await currencyMap();
    let skip = 0;
    let yielded = 0;

    for (;;) {
      const batch = await prisma.customer.findMany({
        where: {
          status: { not: 'ARCHIVED' },
          ...(filters.customerId ? { id: filters.customerId } : {}),
          ...(filters.currencyCode ? { defaultCurrencyCode: filters.currencyCode } : {}),
          ...(filters.search ? { name: { contains: filters.search } } : {}),
        },
        orderBy: { name: 'asc' },
        skip,
        take: PAGE,
      });

      if (batch.length === 0) return;

      /* One aggregate per page rather than per row: a hundred customers is one
         extra query, not a hundred. */
      const ids = batch.map((customer) => customer.id);
      const [quotationCounts, invoiceTotals] = await Promise.all([
        prisma.quotation.groupBy({
          by: ['customerId'],
          where: {
            customerId: { in: ids },
            deletedAt: null,
            ...financialYearWindow(filters),
            ...dateWindow(filters),
          },
          _count: { _all: true },
        }),
        prisma.invoice.groupBy({
          by: ['customerId'],
          where: {
            customerId: { in: ids },
            deletedAt: null,
            status: { in: ['ISSUED', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID'] },
            ...financialYearWindow(filters),
            ...dateWindow(filters),
          },
          _count: { _all: true },
          _sum: { grandTotal: true, amountPaid: true },
        }),
      ]);

      for (const customer of batch) {
        const invoices = invoiceTotals.find((row) => row.customerId === customer.id);
        const currency = currencies.get(customer.defaultCurrencyCode);
        const places = currency?.decimalPlaces ?? 2;
        const billed = invoices?._sum.grandTotal ?? new Prisma.Decimal(0);
        const paid = invoices?._sum.amountPaid ?? new Prisma.Decimal(0);

        yield {
          customerCode: customer.customerCode,
          name: customer.name,
          gstin: customer.gstin ?? '',
          placeOfSupply: customer.placeOfSupplyStateCode ?? '',
          currencyCode: customer.defaultCurrencyCode,
          quotationCount: String(
            quotationCounts.find((row) => row.customerId === customer.id)?._count._all ?? 0,
          ),
          invoiceCount: String(invoices?._count._all ?? 0),
          billed: toAmountString(billed.toString(), places),
          received: toAmountString(paid.toString(), places),
          outstanding: toAmountString(billed.minus(paid).toString(), places),
        };

        yielded += 1;
        if (limit && yielded >= limit) return;
      }

      skip += batch.length;
      if (batch.length < PAGE) return;
    }
  },

  /**
   * No totals row.
   *
   * Each customer's figures are in their own default currency, so a column sum
   * would be adding rupees to dollars — exactly what decision Q3 forbids. The
   * invoice report is where a per-currency total belongs.
   */
  totals: () => Promise.resolve([]),
};

// ---------------------------------------------------------------- summary ---

interface SummaryRow {
  month: string;
  currency_code: string;
  quotation_count: bigint | number;
  quotation_value: unknown;
  invoice_count: bigint | number;
  billed: unknown;
  received: unknown;
}

const summaryReport: ReportDefinition = {
  kind: 'summary',
  title: 'Monthly summary',
  columns: [
    { key: 'month', label: 'Month' },
    { key: 'currencyCode', label: 'Currency' },
    { key: 'quotationCount', label: 'Quotations', numeric: true },
    { key: 'quotationValue', label: 'Quoted', numeric: true },
    { key: 'invoiceCount', label: 'Invoices', numeric: true },
    { key: 'billed', label: 'Billed', numeric: true },
    { key: 'received', label: 'Received', numeric: true },
    { key: 'outstanding', label: 'Outstanding', numeric: true },
  ],

  count: async (filters) => (await summaryRows(filters)).length,

  async *rows(filters, limit) {
    const currencies = await currencyMap();
    const rows = await summaryRows(filters);

    let yielded = 0;
    for (const row of rows) {
      const currency = currencies.get(row.currency_code);
      const places = currency?.decimalPlaces ?? 2;
      const billed = new Prisma.Decimal(String(row.billed ?? 0));
      const received = new Prisma.Decimal(String(row.received ?? 0));

      yield {
        month: row.month,
        currencyCode: row.currency_code,
        quotationCount: String(Number(row.quotation_count)),
        quotationValue: toAmountString(String(row.quotation_value ?? 0), places),
        invoiceCount: String(Number(row.invoice_count)),
        billed: toAmountString(billed.toString(), places),
        received: toAmountString(received.toString(), places),
        outstanding: toAmountString(billed.minus(received).toString(), places),
      };

      yielded += 1;
      if (limit && yielded >= limit) return;
    }
  },

  async totals(filters) {
    const currencies = await currencyMap();
    const rows = await summaryRows(filters);
    const byCurrency = new Map<
      string,
      {
        billed: Prisma.Decimal;
        received: Prisma.Decimal;
        quoted: Prisma.Decimal;
        invoices: number;
        quotations: number;
      }
    >();

    for (const row of rows) {
      const entry = byCurrency.get(row.currency_code) ?? {
        billed: new Prisma.Decimal(0),
        received: new Prisma.Decimal(0),
        quoted: new Prisma.Decimal(0),
        invoices: 0,
        quotations: 0,
      };

      entry.billed = entry.billed.plus(String(row.billed ?? 0));
      entry.received = entry.received.plus(String(row.received ?? 0));
      entry.quoted = entry.quoted.plus(String(row.quotation_value ?? 0));
      entry.invoices += Number(row.invoice_count);
      entry.quotations += Number(row.quotation_count);
      byCurrency.set(row.currency_code, entry);
    }

    return [...byCurrency.entries()].map(([code, entry]) => {
      const currency = currencies.get(code);
      const places = currency?.decimalPlaces ?? 2;

      return {
        currencyCode: code,
        currencySymbol: currency?.symbol ?? code,
        currencyDecimalPlaces: places,
        count: entry.invoices,
        values: {
          quotationCount: String(entry.quotations),
          quotationValue: toAmountString(entry.quoted.toString(), places),
          invoiceCount: String(entry.invoices),
          billed: toAmountString(entry.billed.toString(), places),
          received: toAmountString(entry.received.toString(), places),
          outstanding: toAmountString(entry.billed.minus(entry.received).toString(), places),
        },
      };
    });
  },
};

/**
 * Month × currency, from both tables at once.
 *
 * A UNION rather than two queries stitched together in JavaScript: a month that
 * has invoices but no quotations still needs a row, and getting that right in
 * SQL is one job instead of two halves that have to agree.
 */
const financialYearSqlWindow = (filters: ReportFilters) =>
  filters.financialYearId
    ? Prisma.sql`AND financial_year_id = ${filters.financialYearId}`
    : Prisma.empty;

const summaryRows = async (filters: ReportFilters): Promise<SummaryRow[]> => {
  const from = filters.dateFrom ? toDate(filters.dateFrom) : new Date('2000-01-01T00:00:00.000Z');
  const to = filters.dateTo ? toDate(filters.dateTo) : new Date('2999-12-31T00:00:00.000Z');
  const customer = filters.customerId ?? 0;
  const currency = filters.currencyCode ?? '';

  return prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
    SELECT month, currency_code,
           SUM(quotation_count) AS quotation_count,
           SUM(quotation_value) AS quotation_value,
           SUM(invoice_count)   AS invoice_count,
           SUM(billed)          AS billed,
           SUM(received)        AS received
    FROM (
      SELECT DATE_FORMAT(document_date, '%Y-%m') AS month,
             currency_code,
             COUNT(*) AS quotation_count,
             SUM(grand_total) AS quotation_value,
             0 AS invoice_count, 0 AS billed, 0 AS received
      FROM quotations
      WHERE deleted_at IS NULL AND status NOT IN ('DRAFT','CANCELLED')
        AND document_date BETWEEN ${from} AND ${to}
        AND (${customer} = 0 OR customer_id = ${customer})
        AND (${currency} = '' OR currency_code = ${currency})
        ${financialYearSqlWindow(filters)}
      GROUP BY month, currency_code

      UNION ALL

      SELECT DATE_FORMAT(document_date, '%Y-%m') AS month,
             currency_code,
             0 AS quotation_count, 0 AS quotation_value,
             COUNT(*) AS invoice_count,
             SUM(grand_total) AS billed,
             SUM(amount_paid) AS received
      FROM invoices
      WHERE deleted_at IS NULL
        AND status IN ('ISSUED','SENT','VIEWED','PARTIALLY_PAID','PAID')
        AND document_date BETWEEN ${from} AND ${to}
        AND (${customer} = 0 OR customer_id = ${customer})
        AND (${currency} = '' OR currency_code = ${currency})
        ${financialYearSqlWindow(filters)}
      GROUP BY month, currency_code
    ) combined
    GROUP BY month, currency_code
    ORDER BY month DESC, currency_code ASC
  `);
};

/**
 * The audit trail, exposed as a report.
 *
 * It is a different table with different filters, but exporting it is the same
 * job — so it becomes a report definition and reuses the CSV, XLSX and PDF
 * writers rather than growing a fourth export path of its own.
 */
const auditReport: ReportDefinition = {
  kind: 'audit',
  title: 'Audit trail',
  columns: AUDIT_EXPORT_COLUMNS,

  count: (filters) => prisma.auditLog.count({ where: auditWhereFor(filters) }),

  async *rows(filters, limit) {
    let yielded = 0;
    for await (const row of auditRows(auditFiltersFrom(filters))) {
      yield row;
      yielded += 1;
      if (limit && yielded >= limit) return;
    }
  },

  /* Nothing to total: an audit trail counts events, and the row count is already
     on the page. */
  totals: () => Promise.resolve([]),
};

/** The report filter shape, narrowed to what the audit trail understands. */
const auditFiltersFrom = (filters: ReportFilters): AuditFilters => ({
  ...(filters.createdById ? { userId: filters.createdById } : {}),
  ...(filters.status ? { action: filters.status } : {}),
  ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
  ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
  ...(filters.search ? { search: filters.search } : {}),
});

const auditWhereFor = (filters: ReportFilters): Prisma.AuditLogWhereInput => {
  const audit = auditFiltersFrom(filters);

  return {
    ...(audit.userId ? { userId: audit.userId } : {}),
    ...(audit.action ? { action: audit.action as Prisma.EnumAuditActionFilter['equals'] } : {}),
    ...(audit.dateFrom || audit.dateTo
      ? {
          createdAt: {
            ...(audit.dateFrom ? { gte: toDate(audit.dateFrom) } : {}),
            ...(audit.dateTo ? { lt: new Date(toDate(audit.dateTo).getTime() + 86_400_000) } : {}),
          },
        }
      : {}),
    ...(audit.search
      ? {
          OR: [
            { entityLabel: { contains: audit.search } },
            { userEmailSnapshot: { contains: audit.search } },
            { requestId: { contains: audit.search } },
          ],
        }
      : {}),
  };
};

export const REPORTS: Record<string, ReportDefinition> = {
  quotations: quotationReport,
  invoices: invoiceReport,
  customers: customerReport,
  summary: summaryReport,
  audit: auditReport,
};

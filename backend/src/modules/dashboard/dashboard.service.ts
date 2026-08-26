import { Prisma, type InvoiceStatus, type QuotationStatus } from '@prisma/client';
import {
  QUOTATION_STATUSES,
  STORED_INVOICE_STATUSES,
  roundTo,
  sum,
  toAmountString,
  toDateOnlyString,
  type CurrencyTotals,
  type DashboardCharts,
  type DashboardSummary,
  type MonthPoint,
  type RecentDocument,
  type StoredInvoiceStatus,
} from '@app/shared';
import { prisma } from '../../db/prisma';
import { getCurrent } from '../../services/financial-year.service';

/**
 * The dashboard.
 *
 * Two rules shape everything here.
 *
 * Currencies are not added together. Each currency gets its own exact row; the
 * headline figures are a roll-up into the base currency using the rate each
 * document recorded when it was raised — never today's rate, and never a
 * re-conversion (decision Q3). The payload says whether more than one currency
 * went into that roll-up so the screen can say so too.
 *
 * Cancelled, void and draft documents are excluded from money. A draft is not a
 * claim on anyone, and a cancelled one is a claim that was withdrawn; counting
 * either would overstate the book.
 */

/** Statuses that represent real money owed or billed. */
const LIVE_INVOICE_STATUSES: InvoiceStatus[] = [
  'ISSUED',
  'SENT',
  'VIEWED',
  'PARTIALLY_PAID',
  'PAID',
];

/** Quotations that still count as value in play or value won. */
const LIVE_QUOTATION_STATUSES: QuotationStatus[] = [
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CONVERTED',
];

const OPEN_QUOTATION_STATUSES: QuotationStatus[] = ['SENT', 'VIEWED', 'ACCEPTED'];

const toDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

/** MySQL hands back a computed SUM as a string or a Decimal; both become a string. */
const asAmount = (value: unknown): string =>
  value === null || value === undefined ? '0' : String(value);

interface CurrencyRow {
  currency_code: string;
  invoice_count: bigint | number;
  billed: unknown;
  received: unknown;
}

interface QuotationCurrencyRow {
  currency_code: string;
  quotation_count: bigint | number;
  value: unknown;
}

const countBy = <T extends string>(
  rows: { status: string; _count: { _all: number } }[],
  statuses: readonly T[],
): Record<T, number> => {
  const counts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<T, number>;
  for (const row of rows) {
    if ((statuses as readonly string[]).includes(row.status)) {
      counts[row.status as T] = row._count._all;
    }
  }
  return counts;
};

export const getSummary = async (): Promise<DashboardSummary> => {
  const financialYear = await getCurrent();
  const from = financialYear.startDate;
  const to = financialYear.endDate;

  const company = await prisma.companySettings.findUniqueOrThrow({
    where: { id: 1 },
    select: { baseCurrencyCode: true },
  });

  const baseCurrency = await prisma.currency.findUnique({
    where: { code: company.baseCurrencyCode },
  });

  const decimals = baseCurrency?.decimalPlaces ?? 2;
  const today = toDate(toDateOnlyString(new Date()));

  const [
    quotationCounts,
    invoiceCounts,
    quotationMoney,
    invoiceMoney,
    currencyRows,
    quotationRows,
  ] = await Promise.all([
    prisma.quotation.groupBy({
      by: ['status'],
      where: { deletedAt: null, documentDate: { gte: from, lte: to } },
      _count: { _all: true },
    }),
    prisma.invoice.groupBy({
      by: ['status'],
      where: { deletedAt: null, documentDate: { gte: from, lte: to } },
      _count: { _all: true },
    }),

    /* Quotation value in the base currency, split into "still in play" and "won". */
    prisma.$queryRaw<{ open_value: unknown; accepted_value: unknown }[]>(Prisma.sql`
        SELECT
          SUM(CASE WHEN status IN ('SENT','VIEWED','ACCEPTED') THEN base_total ELSE 0 END) AS open_value,
          SUM(CASE WHEN status IN ('ACCEPTED','CONVERTED') THEN base_total ELSE 0 END) AS accepted_value
        FROM quotations
        WHERE deleted_at IS NULL AND document_date BETWEEN ${from} AND ${to}
      `),

    /* Money in the base currency, each document at the rate it recorded. */
    prisma.$queryRaw<{ billed: unknown; received: unknown; overdue: unknown }[]>(Prisma.sql`
        SELECT
          SUM(base_total) AS billed,
          SUM(amount_paid * exchange_rate_to_base) AS received,
          SUM(CASE
                WHEN due_date < ${today} AND status IN ('ISSUED','SENT','VIEWED','PARTIALLY_PAID')
                THEN (grand_total - amount_paid) * exchange_rate_to_base
                ELSE 0
              END) AS overdue
        FROM invoices
        WHERE deleted_at IS NULL
          AND status IN ('ISSUED','SENT','VIEWED','PARTIALLY_PAID','PAID')
          AND document_date BETWEEN ${from} AND ${to}
      `),

    prisma.$queryRaw<CurrencyRow[]>(Prisma.sql`
        SELECT currency_code,
               COUNT(*) AS invoice_count,
               SUM(grand_total) AS billed,
               SUM(amount_paid) AS received
        FROM invoices
        WHERE deleted_at IS NULL
          AND status IN ('ISSUED','SENT','VIEWED','PARTIALLY_PAID','PAID')
          AND document_date BETWEEN ${from} AND ${to}
        GROUP BY currency_code
      `),

    prisma.$queryRaw<QuotationCurrencyRow[]>(Prisma.sql`
        SELECT currency_code,
               COUNT(*) AS quotation_count,
               SUM(grand_total) AS value
        FROM quotations
        WHERE deleted_at IS NULL
          AND status IN ('SENT','VIEWED','ACCEPTED','DECLINED','EXPIRED','CONVERTED')
          AND document_date BETWEEN ${from} AND ${to}
        GROUP BY currency_code
      `),
  ]);

  const overdueCount = await prisma.invoice.count({
    where: {
      deletedAt: null,
      status: { in: ['ISSUED', 'SENT', 'VIEWED', 'PARTIALLY_PAID'] },
      dueDate: { lt: today },
      documentDate: { gte: from, lte: to },
    },
  });

  const quotationByStatus = countBy(quotationCounts, QUOTATION_STATUSES);
  const invoiceByStatus = countBy<StoredInvoiceStatus>(invoiceCounts, STORED_INVOICE_STATUSES);

  const quotationTotal = Object.values(quotationByStatus).reduce((a, b) => a + b, 0);
  const invoiceTotal = Object.values(invoiceByStatus).reduce((a, b) => a + b, 0);

  const reached = LIVE_QUOTATION_STATUSES.reduce(
    (total, status) => total + (quotationByStatus[status] ?? 0),
    0,
  );
  const won = quotationByStatus.ACCEPTED + quotationByStatus.CONVERTED;
  const winRate = reached === 0 ? '0' : roundTo((won / reached) * 100, 1).toString();

  const billed = asAmount(invoiceMoney[0]?.billed);
  const received = asAmount(invoiceMoney[0]?.received);
  const outstanding = sum([billed]).minus(sum([received]));

  /* Currency metadata for the per-currency rows, from the master rather than the
     documents, so a currency with no documents this year still formats correctly. */
  const currencies = await prisma.currency.findMany();
  const currencyMeta = new Map(currencies.map((currency) => [currency.code, currency]));

  const codes = [
    ...new Set([
      ...currencyRows.map((row) => row.currency_code),
      ...quotationRows.map((row) => row.currency_code),
    ]),
  ].sort();

  const byCurrency: CurrencyTotals[] = codes.map((code) => {
    const invoiceRow = currencyRows.find((row) => row.currency_code === code);
    const quotationRow = quotationRows.find((row) => row.currency_code === code);
    const meta = currencyMeta.get(code);
    const places = meta?.decimalPlaces ?? 2;

    const currencyBilled = asAmount(invoiceRow?.billed);
    const currencyReceived = asAmount(invoiceRow?.received);

    return {
      currencyCode: code,
      currencySymbol: meta?.symbol ?? code,
      currencyDecimalPlaces: places,
      quotationCount: Number(quotationRow?.quotation_count ?? 0),
      quotationValue: toAmountString(asAmount(quotationRow?.value), places),
      invoiceCount: Number(invoiceRow?.invoice_count ?? 0),
      invoiceBilled: toAmountString(currencyBilled, places),
      invoiceReceived: toAmountString(currencyReceived, places),
      invoiceOutstanding: toAmountString(
        sum([currencyBilled])
          .minus(sum([currencyReceived]))
          .toString(),
        places,
      ),
    };
  });

  return {
    financialYear: {
      id: financialYear.id,
      code: financialYear.code,
      startDate: toDateOnlyString(financialYear.startDate),
      endDate: toDateOnlyString(financialYear.endDate),
    },
    baseCurrencyCode: company.baseCurrencyCode,
    baseCurrencySymbol: baseCurrency?.symbol ?? company.baseCurrencyCode,
    baseCurrencyDecimalPlaces: decimals,

    quotations: {
      total: quotationTotal,
      byStatus: quotationByStatus,
      openCount: OPEN_QUOTATION_STATUSES.reduce(
        (total, status) => total + (quotationByStatus[status] ?? 0),
        0,
      ),
      openValueBase: toAmountString(asAmount(quotationMoney[0]?.open_value), decimals),
      acceptedValueBase: toAmountString(asAmount(quotationMoney[0]?.accepted_value), decimals),
      winRatePercent: winRate,
    },

    invoices: {
      total: invoiceTotal,
      byStatus: invoiceByStatus,
      overdueCount,
      billedBase: toAmountString(billed, decimals),
      receivedBase: toAmountString(received, decimals),
      outstandingBase: toAmountString(outstanding.toString(), decimals),
      overdueBase: toAmountString(asAmount(invoiceMoney[0]?.overdue), decimals),
    },

    byCurrency,
    mixedCurrencies: codes.filter((code) => code !== company.baseCurrencyCode).length > 0,
  };
};

// ----------------------------------------------------------------- charts ---

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Every month between two dates, so a quiet month shows as zero rather than a gap. */
const monthsBetween = (start: Date, end: Date): { key: string; label: string }[] => {
  const months: { key: string; label: string }[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));

  while (cursor <= end) {
    const month = cursor.getUTCMonth();
    months.push({
      key: `${cursor.getUTCFullYear()}-${String(month + 1).padStart(2, '0')}`,
      label: `${MONTH_LABELS[month]} ${String(cursor.getUTCFullYear()).slice(2)}`,
    });
    cursor.setUTCMonth(month + 1);
  }

  return months;
};

interface MonthRow {
  month: string;
  value: unknown;
}

export const getCharts = async (range: 'FY' | '12M'): Promise<DashboardCharts> => {
  const financialYear = await getCurrent();
  const company = await prisma.companySettings.findUniqueOrThrow({
    where: { id: 1 },
    select: { baseCurrencyCode: true },
  });

  const end = range === 'FY' ? financialYear.endDate : toDate(toDateOnlyString(new Date()));
  const start =
    range === 'FY'
      ? financialYear.startDate
      : new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));

  const [quotationMonths, billedMonths, receivedMonths, funnelRow] = await Promise.all([
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`
      SELECT DATE_FORMAT(document_date, '%Y-%m') AS month, SUM(base_total) AS value
      FROM quotations
      WHERE deleted_at IS NULL AND status <> 'CANCELLED' AND status <> 'DRAFT'
        AND document_date BETWEEN ${start} AND ${end}
      GROUP BY month
    `),
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`
      SELECT DATE_FORMAT(document_date, '%Y-%m') AS month, SUM(base_total) AS value
      FROM invoices
      WHERE deleted_at IS NULL
        AND status IN ('ISSUED','SENT','VIEWED','PARTIALLY_PAID','PAID')
        AND document_date BETWEEN ${start} AND ${end}
      GROUP BY month
    `),
    /* Grouped by the invoice's own month, not the payment date: the payment date
       is a single field, so "received in July" would move a whole invoice's
       history the moment someone corrected the amount. */
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`
      SELECT DATE_FORMAT(document_date, '%Y-%m') AS month,
             SUM(amount_paid * exchange_rate_to_base) AS value
      FROM invoices
      WHERE deleted_at IS NULL
        AND status IN ('ISSUED','SENT','VIEWED','PARTIALLY_PAID','PAID')
        AND document_date BETWEEN ${start} AND ${end}
      GROUP BY month
    `),
    prisma.$queryRaw<
      {
        raised: bigint | number;
        sent: bigint | number;
        accepted: bigint | number;
        converted: bigint | number;
      }[]
    >(Prisma.sql`
      SELECT
        COUNT(*) AS raised,
        SUM(status IN ('SENT','VIEWED','ACCEPTED','DECLINED','EXPIRED','CONVERTED')) AS sent,
        SUM(status IN ('ACCEPTED','CONVERTED')) AS accepted,
        SUM(status = 'CONVERTED') AS converted
      FROM quotations
      WHERE deleted_at IS NULL AND status <> 'CANCELLED'
        AND document_date BETWEEN ${start} AND ${end}
    `),
  ]);

  const valueOf = (rows: MonthRow[], month: string): string =>
    asAmount(rows.find((row) => row.month === month)?.value);

  const months: MonthPoint[] = monthsBetween(start, end).map(({ key, label }) => ({
    month: key,
    label,
    quotationValueBase: toAmountString(valueOf(quotationMonths, key), 2),
    invoiceBilledBase: toAmountString(valueOf(billedMonths, key), 2),
    invoiceReceivedBase: toAmountString(valueOf(receivedMonths, key), 2),
  }));

  const funnel = funnelRow[0];

  return {
    months,
    baseCurrencyCode: company.baseCurrencyCode,
    funnel: {
      raised: Number(funnel?.raised ?? 0),
      sent: Number(funnel?.sent ?? 0),
      accepted: Number(funnel?.accepted ?? 0),
      converted: Number(funnel?.converted ?? 0),
    },
  };
};

// ------------------------------------------------------ recent documents ---

export const getRecentDocuments = async (limit: number): Promise<RecentDocument[]> => {
  const today = toDate(toDateOnlyString(new Date()));

  const [quotations, invoices] = await Promise.all([
    prisma.quotation.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: { customer: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: { customer: { select: { name: true } } },
    }),
  ]);

  const rows: RecentDocument[] = [
    ...quotations.map((quotation) => ({
      type: 'QUOTATION' as const,
      id: quotation.id.toString(),
      number: quotation.number,
      status: quotation.status,
      customerName: quotation.customer.name,
      documentDate: toDateOnlyString(quotation.documentDate),
      currencyCode: quotation.currencyCode,
      currencySymbol: quotation.currencySymbol,
      currencyDecimalPlaces: quotation.currencyDecimalPlaces,
      grandTotal: toAmountString(quotation.grandTotal.toString(), quotation.currencyDecimalPlaces),
      updatedAt: quotation.updatedAt.toISOString(),
    })),
    ...invoices.map((invoice) => ({
      type: 'INVOICE' as const,
      id: invoice.id.toString(),
      number: invoice.number,
      status: invoice.status,
      customerName: invoice.customer.name,
      documentDate: toDateOnlyString(invoice.documentDate),
      currencyCode: invoice.currencyCode,
      currencySymbol: invoice.currencySymbol,
      currencyDecimalPlaces: invoice.currencyDecimalPlaces,
      grandTotal: toAmountString(invoice.grandTotal.toString(), invoice.currencyDecimalPlaces),
      isOverdue:
        LIVE_INVOICE_STATUSES.includes(invoice.status) &&
        invoice.status !== 'PAID' &&
        invoice.dueDate !== null &&
        invoice.dueDate < today,
      updatedAt: invoice.updatedAt.toISOString(),
    })),
  ];

  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
};

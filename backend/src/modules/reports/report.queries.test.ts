import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  currency: { findMany: vi.fn() },
  customer: { findMany: vi.fn() },
  quotation: { groupBy: vi.fn() },
  invoice: { groupBy: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock('../../db/prisma', () => ({ prisma: prismaMock }));

import { REPORTS } from './report.queries';

/**
 * Report scoping.
 *
 * Every report shares one filter shape, including the global financial year.
 * These tests pin the two reports whose aggregates are not documents
 * themselves — a customer's totals and the month-by-month summary — so the
 * year cannot be silently accepted by the API and then ignored by the query.
 */

const customer = {
  id: 7,
  customerCode: 'CUST-0007',
  name: 'Northwind Traders',
  gstin: null,
  placeOfSupplyStateCode: null,
  defaultCurrencyCode: 'INR',
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.currency.findMany.mockResolvedValue([
    {
      code: 'INR',
      symbol: '₹',
      decimalPlaces: 2,
      symbolPosition: 'BEFORE',
      separatorStyle: 'INDIAN',
    },
  ]);
  prismaMock.customer.findMany.mockResolvedValue([customer]);
  prismaMock.quotation.groupBy.mockResolvedValue([]);
  prismaMock.invoice.groupBy.mockResolvedValue([]);
  prismaMock.$queryRaw.mockResolvedValue([]);
});

describe('the customer report financial-year scope', () => {
  it('scopes quotation and invoice aggregates to the selected year', async () => {
    for await (const _row of REPORTS.customers!.rows({
      financialYearId: 2,
      outstandingOnly: false,
    })) {
      /* Drain the generator; the assertions are about the queries it made. */
    }

    expect(prismaMock.quotation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerId: { in: [7] }, financialYearId: 2 }),
      }),
    );
    expect(prismaMock.invoice.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerId: { in: [7] }, financialYearId: 2 }),
      }),
    );
  });

  it('leaves the aggregates unscoped when All financial years is selected', async () => {
    for await (const _row of REPORTS.customers!.rows({ outstandingOnly: false })) {
      /* Drain the generator. */
    }

    const quotationWhere = prismaMock.quotation.groupBy.mock.calls[0]?.[0]?.where;
    const invoiceWhere = prismaMock.invoice.groupBy.mock.calls[0]?.[0]?.where;
    expect(quotationWhere).not.toHaveProperty('financialYearId');
    expect(invoiceWhere).not.toHaveProperty('financialYearId');
  });
});

describe('the monthly summary financial-year scope', () => {
  it('adds the year to both halves of the union', async () => {
    await REPORTS.summary!.count({ financialYearId: 2, outstandingOnly: false });

    const query = prismaMock.$queryRaw.mock.calls[0]?.[0] as {
      strings: string[];
      values: unknown[];
    };

    /* One clause in quotations, one in invoices, each with the selected id. */
    expect(query.strings.join('?').match(/AND financial_year_id = \?/g)).toHaveLength(2);
    expect(query.values.filter((value) => value === 2)).toHaveLength(2);
  });

  it('leaves both halves unscoped when All financial years is selected', async () => {
    await REPORTS.summary!.count({ outstandingOnly: false });

    const query = prismaMock.$queryRaw.mock.calls[0]?.[0] as { strings: string[] };
    expect(query.strings.join('?')).not.toContain('financial_year_id');
  });
});

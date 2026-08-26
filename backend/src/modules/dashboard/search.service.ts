import {
  PERMISSIONS,
  formatMoney,
  toDateOnlyString,
  type Permission,
  type SearchHit,
  type SearchResults,
} from '@app/shared';
import { prisma } from '../../db/prisma';

/**
 * Global search.
 *
 * One box over documents, customers and items. Two things make it safe rather
 * than merely convenient: each group is only queried when the caller holds the
 * permission to read it, so search can never become a way to see what a role is
 * not allowed to open; and the result carries the path the app should navigate
 * to, so the UI never has to guess a URL from a type string.
 */

const PER_GROUP = 5;

export const search = async (query: string, permissions: Permission[]): Promise<SearchResults> => {
  const term = query.trim();
  if (term.length < 2) return { query: term, hits: [], truncated: false };

  const may = (permission: Permission) => permissions.includes(permission);
  const contains = { contains: term };

  const [quotations, invoices, customers, items] = await Promise.all([
    may(PERMISSIONS.QUOTATION_READ)
      ? prisma.quotation.findMany({
          where: {
            deletedAt: null,
            OR: [{ number: contains }, { subject: contains }, { referenceNumber: contains }],
          },
          include: { customer: { select: { name: true } }, currency: true },
          orderBy: { documentDate: 'desc' },
          take: PER_GROUP + 1,
        })
      : Promise.resolve([]),

    may(PERMISSIONS.INVOICE_READ)
      ? prisma.invoice.findMany({
          where: {
            deletedAt: null,
            OR: [{ number: contains }, { subject: contains }, { referenceNumber: contains }],
          },
          include: { customer: { select: { name: true } }, currency: true },
          orderBy: { documentDate: 'desc' },
          take: PER_GROUP + 1,
        })
      : Promise.resolve([]),

    may(PERMISSIONS.CUSTOMER_READ)
      ? prisma.customer.findMany({
          where: {
            status: { not: 'ARCHIVED' },
            OR: [
              { name: contains },
              { companyName: contains },
              { customerCode: contains },
              { email: contains },
              { gstin: contains },
            ],
          },
          orderBy: { name: 'asc' },
          take: PER_GROUP + 1,
        })
      : Promise.resolve([]),

    may(PERMISSIONS.ITEM_READ)
      ? prisma.item.findMany({
          where: {
            status: { not: 'ARCHIVED' },
            OR: [{ name: contains }, { itemCode: contains }, { hsnSacCode: contains }],
          },
          orderBy: { name: 'asc' },
          take: PER_GROUP + 1,
        })
      : Promise.resolve([]),
  ]);

  const truncated =
    quotations.length > PER_GROUP ||
    invoices.length > PER_GROUP ||
    customers.length > PER_GROUP ||
    items.length > PER_GROUP;

  const money = (
    amount: string,
    currency: {
      symbol: string;
      decimalPlaces: number;
      symbolPosition: string;
      separatorStyle: string;
    },
    code: string,
  ) =>
    formatMoney(amount, {
      code,
      symbol: currency.symbol,
      decimalPlaces: currency.decimalPlaces,
      symbolPosition: currency.symbolPosition as 'PREFIX' | 'SUFFIX',
      separatorStyle: currency.separatorStyle as 'WESTERN' | 'INDIAN',
    });

  const hits: SearchHit[] = [
    ...quotations.slice(0, PER_GROUP).map((quotation) => ({
      type: 'QUOTATION' as const,
      id: quotation.id.toString(),
      title: quotation.number,
      subtitle: `${quotation.customer.name} · ${toDateOnlyString(quotation.documentDate)} · ${money(
        quotation.grandTotal.toString(),
        quotation.currency,
        quotation.currencyCode,
      )}`,
      path: `/quotations/${quotation.id.toString()}`,
    })),

    ...invoices.slice(0, PER_GROUP).map((invoice) => ({
      type: 'INVOICE' as const,
      id: invoice.id.toString(),
      title: invoice.number,
      subtitle: `${invoice.customer.name} · ${toDateOnlyString(invoice.documentDate)} · ${money(
        invoice.grandTotal.toString(),
        invoice.currency,
        invoice.currencyCode,
      )}`,
      path: `/invoices/${invoice.id.toString()}`,
    })),

    ...customers.slice(0, PER_GROUP).map((customer) => ({
      type: 'CUSTOMER' as const,
      id: customer.id.toString(),
      title: customer.name,
      subtitle: [customer.customerCode, customer.companyName, customer.email]
        .filter(Boolean)
        .join(' · '),
      path: `/customers/${customer.id}`,
    })),

    ...items.slice(0, PER_GROUP).map((item) => ({
      type: 'ITEM' as const,
      id: item.id.toString(),
      title: item.name,
      subtitle: [item.itemCode, item.hsnSacCode].filter(Boolean).join(' · '),
      path: '/items',
    })),
  ];

  return { query: term, hits, truncated };
};

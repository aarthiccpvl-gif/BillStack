import type { Prisma, AuditAction, EntityType } from '@prisma/client';
import type { AuditFilters, AuditLogEntry, AuditLogRow, PaginationQuery } from '@app/shared';
import { prisma } from '../../db/prisma';
import { NotFoundError } from '../../utils/errors';

/**
 * Reading the audit trail.
 *
 * The table is append-only — the application exposes no update or delete path for
 * it, by design — so this module only ever reads. Its job is to turn a row that
 * was written for a machine into a line a person can act on.
 */

const toDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

/** "Alex Admin issued FT001/2026-2027", rather than "INVOICE_STATUS_CHANGED". */
const ACTION_PHRASES: Partial<Record<AuditAction, string>> = {
  LOGIN: 'signed in',
  LOGIN_FAILED: 'failed to sign in',
  LOGOUT: 'signed out',
  PASSWORD_CHANGED: 'changed their password',
  PASSWORD_RESET: 'reset a password',
  USER_CREATED: 'created user',
  USER_UPDATED: 'updated user',
  ROLE_CHANGED: 'changed the role of',
  ROLE_PERMISSIONS_UPDATED: 'changed the permissions of role',
  SETTINGS_UPDATED: 'updated the settings',
  COMPANY_UPDATED: 'updated the company settings',
  COMPANY_ASSET_UPDATED: 'updated the company branding',
  BANK_ACCOUNT_CREATED: 'added bank account',
  BANK_ACCOUNT_UPDATED: 'updated bank account',
  BANK_ACCOUNT_DELETED: 'removed bank account',
  MASTER_CREATED: 'created',
  MASTER_UPDATED: 'updated',
  CUSTOMER_CREATED: 'created customer',
  CUSTOMER_UPDATED: 'updated customer',
  CUSTOMER_ARCHIVED: 'archived customer',
  ITEM_CREATED: 'created item',
  ITEM_UPDATED: 'updated item',
  ITEM_ARCHIVED: 'archived item',
  TEMPLATE_CREATED: 'created template',
  TEMPLATE_UPDATED: 'updated template',
  TEMPLATE_VERSION_PUBLISHED: 'published a version of template',
  TEMPLATE_DEFAULT_CHANGED: 'made the default template',
  QUOTATION_CREATED: 'raised quotation',
  QUOTATION_UPDATED: 'changed quotation',
  QUOTATION_STATUS_CHANGED: 'changed the status of quotation',
  QUOTATION_VIEWED: 'saw quotation opened',
  QUOTATION_CONVERTED: 'converted quotation',
  QUOTATION_DELETED: 'deleted draft quotation',
  INVOICE_CREATED: 'raised invoice',
  INVOICE_UPDATED: 'changed invoice',
  INVOICE_STATUS_CHANGED: 'changed the status of invoice',
  INVOICE_VIEWED: 'saw invoice opened',
  INVOICE_CANCELLED: 'cancelled invoice',
  INVOICE_VOIDED: 'voided invoice',
  INVOICE_DELETED: 'deleted draft invoice',
  PAYMENT_STATUS_CHANGED: 'recorded payment against invoice',
  DOCUMENT_PDF_GENERATED: 'generated the PDF for',
  DOCUMENT_DOWNLOADED: 'downloaded',
  DOCUMENT_SHARED: 'created a share link for',
  SHARE_REVOKED: 'revoked a share link for',
  REPORT_EXPORTED: 'exported report',
  BULK_DOWNLOAD: 'bulk-downloaded documents of type',
};

const asRecord = (value: Prisma.JsonValue | null): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** A one-line description, with the detail that makes the line worth reading. */
const summarise = (row: {
  action: AuditAction;
  entityLabel: string | null;
  entityType: EntityType;
  userEmailSnapshot: string | null;
  user: { name: string } | null;
  previousDataJson: Prisma.JsonValue | null;
  newDataJson: Prisma.JsonValue | null;
  metadataJson: Prisma.JsonValue | null;
}): string => {
  const who = row.user?.name ?? row.userEmailSnapshot ?? 'The system';
  const phrase = ACTION_PHRASES[row.action] ?? row.action.toLowerCase().replace(/_/g, ' ');
  const what = row.entityLabel ?? row.entityType.toLowerCase();

  const previous = asRecord(row.previousDataJson);
  const next = asRecord(row.newDataJson);
  const metadata = asRecord(row.metadataJson);

  const parts = [`${who} ${phrase} ${what}`.trim()];

  if (previous?.status && next?.status && previous.status !== next.status) {
    parts.push(`(${String(previous.status)} → ${String(next.status)})`);
  } else if (next?.amountPaid !== undefined) {
    parts.push(`(${String(next.amountPaid)} received)`);
  }

  if (typeof metadata?.reason === 'string' && metadata.reason.length > 0) {
    parts.push(`— ${metadata.reason}`);
  }

  return parts.join(' ');
};

const buildWhere = (filters: AuditFilters): Prisma.AuditLogWhereInput => ({
  ...(filters.userId ? { userId: filters.userId } : {}),
  ...(filters.action ? { action: filters.action as AuditAction } : {}),
  ...(filters.entityType ? { entityType: filters.entityType as EntityType } : {}),
  ...(filters.entityId ? { entityId: BigInt(filters.entityId) } : {}),
  ...(filters.dateFrom || filters.dateTo
    ? {
        createdAt: {
          ...(filters.dateFrom ? { gte: toDate(filters.dateFrom) } : {}),
          /* Inclusive of the whole end day, which is what a date picker means. */
          ...(filters.dateTo
            ? { lt: new Date(toDate(filters.dateTo).getTime() + 86_400_000) }
            : {}),
        },
      }
    : {}),
  ...(filters.search
    ? {
        OR: [
          { entityLabel: { contains: filters.search } },
          { userEmailSnapshot: { contains: filters.search } },
          { requestId: { contains: filters.search } },
        ],
      }
    : {}),
});

const include = { user: { select: { name: true, email: true } } } satisfies Prisma.AuditLogInclude;

const toRow = (row: Prisma.AuditLogGetPayload<{ include: typeof include }>): AuditLogRow => ({
  id: row.id.toString(),
  createdAt: row.createdAt.toISOString(),
  userName: row.user?.name ?? 'System',
  userEmail: row.user?.email ?? row.userEmailSnapshot ?? '',
  action: row.action,
  entityType: row.entityType,
  entityId: row.entityId ? row.entityId.toString() : null,
  entityLabel: row.entityLabel,
  requestId: row.requestId,
  ip: row.ip,
  summary: summarise(row),
});

export const listAuditLogs = async (query: PaginationQuery & AuditFilters) => {
  const where = buildWhere(query);

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include,
      orderBy: { id: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items: rows.map(toRow), total };
};

/** Everything recorded about one document, oldest first — the story of the record. */
export const listForEntity = async (
  entityType: string,
  entityId: string,
): Promise<AuditLogEntry[]> => {
  const rows = await prisma.auditLog.findMany({
    where: { entityType: entityType as EntityType, entityId: BigInt(entityId) },
    include,
    orderBy: { id: 'asc' },
  });

  return rows.map((row) => ({
    ...toRow(row),
    previousData: row.previousDataJson,
    newData: row.newDataJson,
    metadata: row.metadataJson,
  }));
};

export const getAuditEntry = async (id: string): Promise<AuditLogEntry> => {
  const row = await prisma.auditLog.findUnique({ where: { id: BigInt(id) }, include });
  if (!row) throw new NotFoundError('Audit entry');

  return {
    ...toRow(row),
    previousData: row.previousDataJson,
    newData: row.newDataJson,
    metadata: row.metadataJson,
  };
};

/** Streams the filtered trail for an export, a page at a time. */
export async function* auditRows(filters: AuditFilters): AsyncGenerator<Record<string, string>> {
  const where = buildWhere(filters);
  let cursor: bigint | null = null;

  for (;;) {
    const batch: Prisma.AuditLogGetPayload<{ include: typeof include }>[] =
      await prisma.auditLog.findMany({
        where: cursor === null ? where : { AND: [where, { id: { lt: cursor } }] },
        include,
        orderBy: { id: 'desc' },
        take: 500,
      });

    if (batch.length === 0) return;

    for (const row of batch) {
      const mapped = toRow(row);
      yield {
        createdAt: mapped.createdAt,
        userName: mapped.userName,
        userEmail: mapped.userEmail,
        action: mapped.action,
        entityType: mapped.entityType,
        entityLabel: mapped.entityLabel ?? '',
        summary: mapped.summary,
        ip: mapped.ip ?? '',
        requestId: mapped.requestId ?? '',
      };
    }

    const last = batch[batch.length - 1];
    if (!last) return;
    cursor = last.id;
    if (batch.length < 500) return;
  }
}

export const AUDIT_EXPORT_COLUMNS = [
  { key: 'createdAt', label: 'When' },
  { key: 'userName', label: 'Who' },
  { key: 'userEmail', label: 'Email', secondary: true },
  { key: 'action', label: 'Action' },
  { key: 'entityType', label: 'Type' },
  { key: 'entityLabel', label: 'Document' },
  { key: 'summary', label: 'What happened' },
  { key: 'ip', label: 'IP', secondary: true },
  { key: 'requestId', label: 'Request', secondary: true },
];

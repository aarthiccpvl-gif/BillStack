import type { AuditAction, EntityType, Prisma as PrismaTypes } from '@prisma/client';
import { prisma, type Db } from '../db/prisma';
import { getContext } from '../utils/request-context';
import { logger } from '../utils/logger';

/**
 * Audit logging.
 *
 * Actor, IP, user agent and request id come from the ambient request context, so no
 * service signature has to carry them. Writes participate in the caller's
 * transaction when one is passed, which means an audit row and the change it
 * describes commit or roll back together — auditing is not best-effort.
 */

export interface AuditInput {
  action: AuditAction;
  entityType: EntityType;
  entityId?: number | bigint | null;
  /** Human-readable identifier — a document number, an email, a customer name. */
  entityLabel?: string | null;
  previousData?: unknown;
  newData?: unknown;
  metadata?: unknown;
  /** Overrides the ambient actor; used by the login path, which audits before auth. */
  actor?: { userId?: number | null; userEmail?: string | null };
}

/** Values that must never reach the audit table even if a caller passes them. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'token',
  'tokenhash',
  'accesstoken',
  'refreshtoken',
  'secret',
]);

const redact = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[truncated]';

  if (Array.isArray(value)) return value.map((entry) => redact(entry, depth + 1));

  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(entry, depth + 1);
    }
    return result;
  }

  if (typeof value === 'bigint') return value.toString();
  return value;
};

const asJson = (value: unknown): PrismaTypes.InputJsonValue | undefined =>
  value === undefined ? undefined : (redact(value) as PrismaTypes.InputJsonValue);

export const recordAudit = async (input: AuditInput, db: Db = prisma): Promise<void> => {
  const context = getContext();

  const data = {
    userId: input.actor?.userId ?? context?.userId ?? null,
    userEmailSnapshot: input.actor?.userEmail ?? context?.userEmail ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId:
      input.entityId === null || input.entityId === undefined ? null : BigInt(input.entityId),
    entityLabel: input.entityLabel ?? null,
    ip: context?.ip ?? null,
    userAgent: context?.userAgent ?? null,
    requestId: context?.requestId ?? null,
    previousDataJson: asJson(input.previousData),
    newDataJson: asJson(input.newData),
    metadataJson: asJson(input.metadata),
  };

  await db.auditLog.create({ data });
};

/**
 * For audit writes that must not fail the surrounding request — currently only the
 * failed-login path, where the user has no session to lose and a logging outage
 * should not turn a wrong password into a 500.
 */
export const recordAuditSafely = async (input: AuditInput): Promise<void> => {
  try {
    await recordAudit(input);
  } catch (error) {
    logger.error({ err: error, action: input.action }, 'failed to write audit entry');
  }
};

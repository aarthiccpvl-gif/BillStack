import { createHash, randomBytes } from 'node:crypto';
import type { EntityType } from '@prisma/client';
import type { ShareLinkRecord } from '@app/shared';
import { prisma } from '../db/prisma';
import { env } from '../config/env';
import { NotFoundError } from '../utils/errors';
import { recordAudit } from './audit.service';

/**
 * Secure share links (decision Q9).
 *
 * An opaque 32-byte token, stored only as a hash, with an expiry and a revoke
 * switch. The public route it unlocks can do exactly one thing: stream an
 * already-generated PDF. It cannot reach the API, and the token carries no
 * customer information — the URL is safe to paste into a chat.
 */

const TOKEN_BYTES = 32;

export const hashShareToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const toRecord = (
  share: {
    id: bigint;
    expiresAt: Date | null;
    revokedAt: Date | null;
    viewCount: number;
    lastViewedAt: Date | null;
    createdAt: Date;
  },
  token: string | null,
  documentNumber: string,
): ShareLinkRecord => {
  /* The plain token exists only in the response that creates it; afterwards only
     the hash is stored, so an old link can never be re-displayed. Null, not an
     empty string: "we cannot show this" is a different answer from "here it is". */
  const url = token ? `${env.APP_URL}/api/public/documents/${token}` : null;

  return {
    id: share.id.toString(),
    url,
    expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
    revokedAt: share.revokedAt ? share.revokedAt.toISOString() : null,
    viewCount: share.viewCount,
    lastViewedAt: share.lastViewedAt ? share.lastViewedAt.toISOString() : null,
    createdAt: share.createdAt.toISOString(),
    /* A plain deep link — no WhatsApp API integration (decision Q14). */
    whatsappUrl: url
      ? `https://wa.me/?text=${encodeURIComponent(`${documentNumber} — ${url}`)}`
      : null,
  };
};

export const createShareLink = async (
  entityType: EntityType,
  entityId: bigint,
  documentNumber: string,
  actorId: number,
  expiresInDays?: number,
): Promise<ShareLinkRecord> => {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const days = expiresInDays ?? env.SHARE_LINK_TTL_DAYS;

  const share = await prisma.documentShare.create({
    data: {
      entityType,
      entityId,
      tokenHash: hashShareToken(token),
      channel: 'LINK',
      expiresAt: new Date(Date.now() + days * 86_400_000),
      createdById: actorId,
    },
  });

  await recordAudit({
    action: 'DOCUMENT_SHARED',
    entityType,
    entityId,
    entityLabel: documentNumber,
    metadata: { expiresInDays: days },
  });

  return toRecord(share, token, documentNumber);
};

export const listShareLinks = async (
  entityType: EntityType,
  entityId: bigint,
  documentNumber: string,
): Promise<ShareLinkRecord[]> => {
  const shares = await prisma.documentShare.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'desc' },
  });

  return shares.map((share) => toRecord(share, null, documentNumber));
};

export const revokeShareLink = async (id: bigint, actorId: number): Promise<void> => {
  const share = await prisma.documentShare.findUnique({ where: { id } });
  if (!share) throw new NotFoundError('Share link');

  await prisma.documentShare.update({ where: { id }, data: { revokedAt: new Date() } });

  await recordAudit({
    action: 'SHARE_REVOKED',
    entityType: share.entityType,
    entityId: share.entityId,
    metadata: { shareId: id.toString(), revokedBy: actorId },
  });
};

export interface ResolvedShare {
  entityType: EntityType;
  entityId: bigint;
  shareId: bigint;
}

/**
 * Looks up a token from the public route.
 *
 * Returns null for anything not currently usable — unknown, revoked or expired —
 * so the caller answers the same way in every case and the endpoint gives nothing
 * away about which tokens exist.
 */
export const resolveShareToken = async (token: string): Promise<ResolvedShare | null> => {
  const share = await prisma.documentShare.findUnique({
    where: { tokenHash: hashShareToken(token) },
  });

  if (!share) return null;
  if (share.revokedAt) return null;
  if (share.expiresAt && share.expiresAt < new Date()) return null;

  return { entityType: share.entityType, entityId: share.entityId, shareId: share.id };
};

/** Records a view; this is what makes the VIEWED status real rather than manual. */
export const recordShareView = async (shareId: bigint): Promise<void> => {
  await prisma.documentShare.update({
    where: { id: shareId },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  });
};

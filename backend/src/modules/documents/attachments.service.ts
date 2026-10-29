import { randomUUID } from 'node:crypto';
import type { DocumentFile } from '@prisma/client';
import type { DocumentAttachmentRecord } from '@app/shared';
import { prisma, type TransactionClient } from '../../db/prisma';
import { recordAudit } from '../../services/audit.service';
import { getStorage } from '../../storage/storage.service';
import { logger } from '../../utils/logger';
import { NotFoundError } from '../../utils/errors';
import type { UploadedFile } from '../../middleware/upload';

/**
 * Supporting files on a quotation or invoice (PRD §17, §21, §58).
 *
 * The financial document is the authority; an attachment is a supporting artefact
 * that can be added or removed without touching a single figure. Every write is
 * audited, and a delete removes the metadata and the bytes together.
 *
 * The document type is passed in rather than inferred, so the same service cannot
 * accidentally list a quotation's files against an invoice with the same numeric id.
 */

export type AttachmentEntity = 'QUOTATION' | 'INVOICE';

const ENTITY_PATH: Record<AttachmentEntity, string> = {
  QUOTATION: 'quotations',
  INVOICE: 'invoices',
};

/** The storage key is generated, never derived from the uploaded file name. */
export const attachmentStorageKey = (
  entityType: AttachmentEntity,
  entityId: bigint,
  extension: string,
): string =>
  `documents/${ENTITY_PATH[entityType]}/${entityId.toString()}/attachments/${Date.now()}-${randomUUID()}${extension}`;

/** Conversion copies are not attached to an id until the invoice exists. */
const copiedAttachmentStorageKey = (extension: string): string =>
  `documents/attachments/${Date.now()}-${randomUUID()}${extension}`;

/**
 * Keeps the display name readable while making it safe to store and to put in a
 * Content-Disposition header. The storage key never uses it.
 */
export const safeAttachmentFileName = (originalName: string, extension: string): string => {
  const cleaned = Array.from(originalName)
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      const unsafe =
        code < 32 || code === 127 || character === '/' || character === '\\' || character === '"';
      return unsafe ? '_' : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

  const base = cleaned || `attachment${extension}`;
  if (base.length <= 255) return base;

  /* Preserve the extension when trimming a long name. */
  const dot = base.lastIndexOf('.');
  const suffix = dot > 0 ? base.slice(dot) : '';
  return `${base.slice(0, Math.max(1, 255 - suffix.length))}${suffix}`;
};

const extensionOf = (fileName: string): string => {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot).toLowerCase() : '';
};

const FILE_KIND = 'ATTACHMENT' as const;

const toRecord = (file: DocumentFile, createdByName: string | null): DocumentAttachmentRecord => ({
  id: file.id.toString(),
  fileName: file.fileName,
  mimeType: file.mimeType,
  sizeBytes: file.sizeBytes,
  checksumSha256: file.checksumSha256,
  createdAt: file.createdAt.toISOString(),
  createdByName,
});

const namesFor = async (files: DocumentFile[]): Promise<Map<number, string>> => {
  const ids = [
    ...new Set(
      files
        .map((file) => file.createdById)
        .filter((id): id is number => typeof id === 'number' && Number.isInteger(id)),
    ),
  ];
  if (ids.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(users.map((user) => [user.id, user.name]));
};

export const listAttachments = async (
  entityType: AttachmentEntity,
  entityId: bigint,
): Promise<DocumentAttachmentRecord[]> => {
  const files = await prisma.documentFile.findMany({
    where: { entityType, entityId, kind: FILE_KIND },
    orderBy: { createdAt: 'desc' },
  });

  const names = await namesFor(files);
  return files.map((file) =>
    toRecord(file, file.createdById ? (names.get(file.createdById) ?? null) : null),
  );
};

export const getAttachment = async (
  entityType: AttachmentEntity,
  entityId: bigint,
  fileId: bigint,
): Promise<DocumentFile> => {
  const file = await prisma.documentFile.findFirst({
    where: {
      id: fileId,
      entityType,
      entityId,
      kind: FILE_KIND,
    },
  });
  if (!file) throw new NotFoundError('Attachment');
  return file;
};

export const addAttachment = async (
  entityType: AttachmentEntity,
  entityId: bigint,
  entityLabel: string,
  file: UploadedFile,
  actor: { id: number; name: string },
): Promise<DocumentAttachmentRecord> => {
  const storage = getStorage();
  const key = attachmentStorageKey(entityType, entityId, file.extension);
  const stored = await storage.put(key, file.buffer, file.mimeType);

  try {
    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.documentFile.create({
        data: {
          entityType,
          entityId,
          kind: FILE_KIND,
          storageKey: stored.storageKey,
          fileName: safeAttachmentFileName(file.originalName, file.extension),
          mimeType: file.mimeType,
          sizeBytes: stored.sizeBytes,
          checksumSha256: stored.checksumSha256,
          createdById: actor.id,
        },
      });

      await recordAudit(
        {
          action: 'ATTACHMENT_ADDED',
          entityType,
          entityId,
          entityLabel,
          newData: {
            fileId: created.id.toString(),
            fileName: created.fileName,
            mimeType: created.mimeType,
            sizeBytes: created.sizeBytes,
          },
        },
        tx,
      );

      return created;
    });

    return toRecord(record, actor.name);
  } catch (error) {
    /* The row is what makes the bytes reachable. If it did not commit, do not
       leave an orphan object behind. */
    await storage.delete(key).catch((cleanupError: unknown) => {
      logger.warn(
        { err: cleanupError, key },
        'could not remove the storage object after a failed attachment insert',
      );
    });
    throw error;
  }
};

export const removeAttachment = async (
  entityType: AttachmentEntity,
  entityId: bigint,
  fileId: bigint,
  entityLabel: string,
): Promise<void> => {
  const removed = await prisma.$transaction(async (tx) => {
    const file = await tx.documentFile.findFirst({
      where: { id: fileId, entityType, entityId, kind: FILE_KIND },
    });
    if (!file) throw new NotFoundError('Attachment');

    await tx.documentFile.delete({ where: { id: file.id } });

    await recordAudit(
      {
        action: 'ATTACHMENT_REMOVED',
        entityType,
        entityId,
        entityLabel,
        previousData: {
          fileId: file.id.toString(),
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        },
      },
      tx,
    );

    return file;
  });

  /* The audit row already commits the removal. A leftover object would be
     invisible to the UI, so cleanup is best-effort and logged, not fatal. */
  await getStorage()
    .delete(removed.storageKey)
    .catch((error: unknown) => {
      logger.warn(
        { err: error, key: removed.storageKey },
        'could not remove attachment bytes after deleting the record',
      );
    });
};

/* --- quotation → invoice copies (decision D7) ---------------------------- */

export interface StagedAttachmentCopy {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string | null;
}

const cleanupCopies = async (copies: StagedAttachmentCopy[]): Promise<void> => {
  const storage = getStorage();
  await Promise.all(
    copies.map((copy) =>
      storage.delete(copy.storageKey).catch((error: unknown) => {
        logger.warn({ err: error, key: copy.storageKey }, 'could not remove a staged copy');
      }),
    ),
  );
};

/**
 * Copies the bytes before the conversion transaction starts.
 *
 * Storage is not transactional, so the order is deliberate: put the copies first,
 * then let the database transaction create the invoice rows. If the transaction
 * fails, `cleanup()` deletes the copies; if it succeeds, they are attached to the
 * new invoice in the same transaction.
 */
export const stageAttachmentCopies = async (
  sourceType: AttachmentEntity,
  sourceId: bigint,
): Promise<{ copies: StagedAttachmentCopy[]; cleanup: () => Promise<void> }> => {
  const files = await prisma.documentFile.findMany({
    where: { entityType: sourceType, entityId: sourceId, kind: FILE_KIND },
    orderBy: { id: 'asc' },
  });

  const storage = getStorage();
  const copies: StagedAttachmentCopy[] = [];

  try {
    for (const file of files) {
      const body = await storage.get(file.storageKey);
      const key = copiedAttachmentStorageKey(extensionOf(file.fileName));
      const stored = await storage.put(key, body, file.mimeType);

      copies.push({
        storageKey: stored.storageKey,
        fileName: safeAttachmentFileName(file.fileName, extensionOf(file.fileName)),
        mimeType: file.mimeType,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
      });
    }
  } catch (error) {
    await cleanupCopies(copies);
    throw error;
  }

  return { copies, cleanup: () => cleanupCopies(copies) };
};

export const writeAttachmentCopies = async (
  tx: TransactionClient,
  targetType: AttachmentEntity,
  targetId: bigint,
  copies: StagedAttachmentCopy[],
  actorId: number,
): Promise<number> => {
  for (const copy of copies) {
    await tx.documentFile.create({
      data: {
        entityType: targetType,
        entityId: targetId,
        kind: FILE_KIND,
        storageKey: copy.storageKey,
        fileName: copy.fileName,
        mimeType: copy.mimeType,
        sizeBytes: copy.sizeBytes,
        checksumSha256: copy.checksumSha256,
        createdById: actorId,
      },
    });
  }
  return copies.length;
};

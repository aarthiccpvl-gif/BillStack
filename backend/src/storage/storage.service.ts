import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { env } from '../config/env';
import { InternalError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Storage abstraction.
 *
 * Everything the application stores — uploaded branding, attachments, generated
 * PDFs — goes through this interface, so introducing S3 later is one adapter and
 * an environment variable rather than a change at every call site.
 */

export interface StoredObject {
  storageKey: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface StorageService {
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  getStream(key: string): Promise<Readable>;
  exists(key: string): Promise<boolean>;
  /** Never called for financial documents — retention is permanent. */
  delete(key: string): Promise<void>;
}

/** Rejects anything that could escape the storage root. */
const assertSafeKey = (key: string): void => {
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\0')) {
    throw new InternalError(`Unsafe storage key: ${key}`);
  }
};

class LocalDiskAdapter implements StorageService {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(process.cwd(), root);
  }

  private absolute(key: string): string {
    assertSafeKey(key);
    const path = normalize(join(this.root, key));
    /* Second line of defence: the resolved path must still sit under the root. */
    if (!path.startsWith(this.root + sep) && path !== this.root) {
      throw new InternalError(`Storage key escapes the storage root: ${key}`);
    }
    return path;
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<StoredObject> {
    const path = this.absolute(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);

    return {
      storageKey: key,
      sizeBytes: body.byteLength,
      checksumSha256: createHash('sha256').update(body).digest('hex'),
    };
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.absolute(key));
  }

  async getStream(key: string): Promise<Readable> {
    return createReadStream(this.absolute(key));
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.absolute(key));
  }

  async delete(key: string): Promise<void> {
    const path = this.absolute(key);
    if (existsSync(path)) await unlink(path);
  }
}

let instance: StorageService | null = null;

export const getStorage = (): StorageService => {
  if (instance) return instance;

  if (env.STORAGE_PROVIDER === 's3') {
    /* The S3 adapter lands with the deployment work in Phase 9; failing loudly is
       better than silently writing production files to a container's disk. */
    throw new InternalError(
      'STORAGE_PROVIDER=s3 is not implemented yet. Use "local" until the S3 adapter ships.',
    );
  }

  logger.debug({ root: env.STORAGE_LOCAL_ROOT }, 'using local disk storage');
  instance = new LocalDiskAdapter(env.STORAGE_LOCAL_ROOT);
  return instance;
};

/** Test seam. */
export const setStorage = (service: StorageService | null): void => {
  instance = service;
};

/**
 * Storage keys are derived, never taken from user input.
 *   company/logo/<timestamp>-<hash>.png
 *   documents/invoices/2026-27/FT001-2026-2027/v1-t3.pdf
 */
export const companyAssetKey = (
  kind: 'logo' | 'favicon' | 'signature' | 'seal',
  extension: string,
  uniqueness: string,
): string => `company/${kind}/${uniqueness}${extension}`;

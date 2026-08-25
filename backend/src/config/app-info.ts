import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readVersion = (): string => {
  for (const candidate of [
    resolve(__dirname, '..', '..', 'package.json'),
    resolve(process.cwd(), 'package.json'),
  ]) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(candidate, 'utf8'));
      if (parsed && typeof parsed === 'object' && 'version' in parsed) {
        const { version } = parsed as { version?: unknown };
        if (typeof version === 'string') return version;
      }
    } catch {
      /* try the next candidate */
    }
  }
  return '0.0.0';
};

export const APP_NAME = 'Invoice & Quotation Management API';
export const APP_VERSION = readVersion();
export const API_PREFIX = '/api';

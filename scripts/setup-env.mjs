#!/usr/bin/env node
/**
 * Creates a local .env from .env.example and fills in the values a developer
 * should never have to invent: random JWT secrets and MinIO dev credentials.
 *
 * Safe to re-run: an existing .env is left untouched unless --force is passed.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = resolve(root, '.env.example');
const envPath = resolve(root, '.env');
const force = process.argv.includes('--force');

if (!existsSync(examplePath)) {
  console.error('.env.example not found — are you running this from the repository root?');
  process.exit(1);
}

if (existsSync(envPath) && !force) {
  console.log('.env already exists — leaving it alone. Use --force to regenerate.');
  process.exit(0);
}

const secret = () => randomBytes(48).toString('base64url');

const generated = {
  JWT_ACCESS_SECRET: secret(),
  JWT_REFRESH_SECRET: secret(),
  STORAGE_ACCESS_KEY: 'minioadmin',
  STORAGE_SECRET_KEY: 'minioadmin',
};

const contents = readFileSync(examplePath, 'utf8')
  .split(/\r?\n/)
  .map((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) return line;
    const [, key] = match;
    return key in generated ? `${key}=${generated[key]}` : line;
  })
  .join('\n');

writeFileSync(envPath, contents, 'utf8');

console.log('Created .env with generated development secrets.');
console.log(
  'Seed user credentials (SEED_*) are intentionally left blank — set them before Phase 2.',
);

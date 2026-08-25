import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Environment is parsed exactly once, here, and the process refuses to start on a
 * bad or missing required value. Nothing else in the codebase reads process.env,
 * so there is no `process.env.X!` scattered through the services.
 */

/** The repo keeps a single .env at the root; the API may be started from either place. */
const loadDotEnv = (): string | null => {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '..', '.env'),
    resolve(__dirname, '..', '..', '..', '.env'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return candidate;
    }
  }
  return null;
};

const envFile = loadDotEnv();

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', 'yes', 'no'])])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['true', '1', 'yes'].includes(value.toLowerCase()),
  );

const port = z.coerce.number().int().min(1).max(65535);

const envSchema = z.object({
  /* core */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: port.default(4000),
  APP_URL: z.string().url().default('http://localhost:4000'),
  FRONTEND_URL: z.string().url().default('http://localhost:5175'),
  TZ: z.string().default('Asia/Kolkata'),

  /* database */
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => value.startsWith('mysql://'), 'DATABASE_URL must be a mysql:// connection'),

  /* auth — required from Phase 2 onward; optional now so the skeleton runs bare */
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: booleanish.default(false),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),

  /* storage */
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_ROOT: z.string().default('./var/storage'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  UPLOAD_MAX_MB: z.coerce.number().int().min(1).default(5),
  ATTACHMENT_MAX_MB: z.coerce.number().int().min(1).default(10),

  /* pdf */
  PDF_ENGINE: z.enum(['puppeteer', 'playwright']).default('puppeteer'),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  PDF_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  PDF_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),

  /* email */
  MAIL_PROVIDER: z.enum(['smtp', 'log']).default('log'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: port.optional(),
  SMTP_SECURE: booleanish.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('Company Billing <billing@example.com>'),
  MAIL_BCC_ARCHIVE: z.string().optional(),

  /* sharing / feature flags */
  SHARE_LINK_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  FEATURE_WHATSAPP: booleanish.default(false),
  FEATURE_PAYMENTS: booleanish.default(false),
  FEATURE_MANUAL_PAYMENTS: booleanish.default(true),

  /* ops */
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  console.error(
    [
      '',
      'Cannot start: the environment is not valid.',
      problems,
      '',
      envFile
        ? `Loaded environment from ${envFile}`
        : 'No .env file was found. Run `npm run setup:env` in the repository root.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

export const env: Env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDevelopment = env.NODE_ENV === 'development';

/** Where the environment came from — reported by the health endpoint in dev. */
export const envSourceFile = envFile;

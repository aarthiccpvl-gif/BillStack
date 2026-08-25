import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@app/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      /* Point the suite at the dedicated test schema so it can never touch dev data. */
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'mysql://invoice:invoice@localhost:3306/invoice_db_test',
    },
  },
});

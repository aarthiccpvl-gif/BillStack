import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * The dev server proxies /api to the backend so the browser talks to a single
 * origin. That is what lets authentication use httpOnly cookies without any CORS
 * or SameSite gymnastics in development.
 */
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      /* Consumed from source so a change in shared/ hot-reloads here too. */
      '@app/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    /* Production source maps would publish the entire frontend source. The
       server-side error log is the place to diagnose a problem, not a browser
       devtools download. */
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});

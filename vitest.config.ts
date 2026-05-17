import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest config for API integration tests.
 *
 * Tests live under `tests/` and invoke Next.js route handlers directly with
 * a constructed `Request`. The Playwright e2e tests under `e2e/` use a
 * separate runner (`@playwright/test`) and are excluded from this glob so
 * the two suites stay independent.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 10_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': projectRoot,
    },
  },
});

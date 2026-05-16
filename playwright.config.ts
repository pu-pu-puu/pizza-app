import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke E2E tests for the storefront.
 *
 * By default tests run against `PLAYWRIGHT_BASE_URL` (set by CI to the Vercel
 * preview URL). For local dev set it manually, e.g.:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
 */
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.BASE_URL ??
  'http://localhost:3000';

/**
 * Vercel Deployment Protection is enabled on preview deployments. To talk to
 * the protected URL from CI we forward the project-level "Protection Bypass
 * for Automation" secret on every request (header + cookie-setting query
 * param). The secret is exposed to the workflow via
 * `secrets.VERCEL_AUTOMATION_BYPASS_SECRET`; locally it's unset and tests
 * just hit the public URL (e.g. production / localhost) without the header.
 */
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const extraHTTPHeaders = bypassSecret
  ? {
      'x-vercel-protection-bypass': bypassSecret,
      'x-vercel-set-bypass-cookie': 'samesitenone',
    }
  : undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL,
    extraHTTPHeaders,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

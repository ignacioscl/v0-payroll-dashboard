import { defineConfig, devices } from '@playwright/test'

/**
 * e2e de SRS Suite Pro contra el dev local (`pnpm dev`, lo levanta Ignacio) en http://pro.srs.com.
 * Credenciales en `.env.e2e.local` (no se versiona): E2E_BASE_URL, E2E_USER, E2E_PASSWORD.
 * Falta instalar: `pnpm add -D @playwright/test` y `pnpm exec playwright install chromium`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://pro.srs.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
  ],
})

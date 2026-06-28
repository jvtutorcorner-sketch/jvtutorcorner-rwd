/**
 * Playwright config for Phase 1 signaling tests.
 *
 * Starts an isolated token test server on port 3001 (always fresh, always
 * has SIGNALING_TOKEN_SECRET set) while reusing the existing Next.js dev
 * server on port 3000 for browser/WebSocket tests.
 *
 * This avoids needing to restart the dev server after adding
 * SIGNALING_TOKEN_SECRET to .env.local.
 *
 * Run:
 *   npm run test:phase1
 *   # or
 *   npx playwright test --config playwright.phase1.config.ts e2e/signaling/ --project=chromium
 *
 * Prerequisites:
 *   - Next.js dev server running on port 3000 (npm run dev)
 *   - No process already bound to port 3001
 */

import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const TOKEN_SERVER_PORT = 3001;
const TOKEN_SERVER_URL = `http://localhost:${TOKEN_SERVER_PORT}`;
const DEV_SERVER_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

const SIGNALING_TOKEN_SECRET =
  process.env.SIGNALING_TOKEN_SECRET ??
  'phase1-local-test-secret-change-in-production';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/signaling/**/*.spec.ts',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  webServer: [
    {
      // Fresh token server on port 3001 — always has SIGNALING_TOKEN_SECRET
      command: `node e2e/helpers/token_test_server.mjs`,
      url: `${TOKEN_SERVER_URL}/health`,
      reuseExistingServer: false,
      timeout: 15_000,
      env: {
        // Inherit PATH and all system env so 'node' can be found
        ...process.env,
        PORT: String(TOKEN_SERVER_PORT),
        SIGNALING_TOKEN_SECRET,
      },
    },
    {
      // Reuse the existing Next.js dev server for browser / WebSocket tests
      url: DEV_SERVER_URL,
      reuseExistingServer: true,
      timeout: 30_000,
      // No command — playwright will fail gracefully if not running
      command: 'npm run dev',
    },
  ],

  reporter: [
    ['html', { outputFolder: 'playwright-report-phase1' }],
    ['list'],
  ],

  use: {
    // baseURL points to the token server — token tests use request fixture
    // WS / browser tests use absolute harnessUrl() pointing to port 3000
    baseURL: TOKEN_SERVER_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: process.env.HEADLESS !== 'false',
    launchOptions: {
      args: [
        '--start-maximized',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Determine environment and load corresponding .env file
const APP_ENV = process.env.APP_ENV || 'local';
const envPath = path.resolve(__dirname, `.env.${APP_ENV}`);
dotenv.config({ path: envPath });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const IS_PRODUCTION_ENV = APP_ENV === 'production';
const IS_LOCAL_ENV = APP_ENV === 'local';
const SHOULD_START_WEB_SERVER = IS_LOCAL_ENV;

console.log(`📡 E2E Environment: ${APP_ENV.toUpperCase()}`);
console.log(`🔗 Base URL: ${BASE_URL}`);
if (IS_PRODUCTION_ENV) {
    console.log(`🌐 Production mode detected; local webServer will be skipped.`);
} else if (IS_LOCAL_ENV) {
    console.log(`🏠 Local mode detected; webServer may be started.`);
}

export default defineConfig({
    testDir: './e2e',
    testMatch: '**/*.spec.ts',
    timeout: 60000,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : 1,

    reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['list'],
    ],

    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        headless: process.env.HEADLESS !== 'false',
        launchOptions: {
            args: [
                '--start-maximized',
                // Provide synthetic camera/microphone streams so Agora RTC can create
                // local tracks without physical devices (E2E test environment)
                '--use-fake-device-for-media-stream',
                '--use-fake-ui-for-media-stream',
            ],
        }
    },

    webServer: SHOULD_START_WEB_SERVER
        ? {
              command: 'npm run dev',
              url: BASE_URL,
              reuseExistingServer: !process.env.CI,
              timeout: 120000,
          }
        : undefined,

    projects: [
        // Desktop browsers
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },

        // Mobile devices — real viewport, touch events, mobile UA
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 7'] },
        },
        {
            name: 'mobile-safari',
            use: { ...devices['iPhone 14'] },
        },
        {
            name: 'tablet-safari',
            use: { ...devices['iPad Pro 11'] },
        },

        // Local development helpers
        {
            name: 'chromium-headed',
            use: {
                ...devices['Desktop Chrome'],
                headless: false,
            },
        },
        {
            name: 'chromium-headless',
            use: {
                ...devices['Desktop Chrome'],
                headless: true,
            },
        },
    ],
});

import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Determine environment and load corresponding .env file
const APP_ENV = process.env.APP_ENV || 'local';
const envPath = path.resolve(__dirname, `.env.${APP_ENV}`);
dotenv.config({ path: envPath });

console.log(`📡 E2E Environment: ${APP_ENV.toUpperCase()}`);
console.log(`🔗 Base URL: ${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}`);

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

export default defineConfig({
    testDir: './e2e',
    testMatch: '**/*.spec.ts',
    timeout: 60000,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : 1,

    webServer: {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },

    reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['list'],
    ],

    use: {
        baseURL: BASE_URL,
        extraHTTPHeaders: {
            'X-E2E-Secret': process.env.LOGIN_BYPASS_SECRET || '',
        },
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        headless: false,
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

    projects: [
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
        {
            name: 'chromium-headed',
            use: { 
                ...devices['Desktop Chrome'],
                headless: false,
            },
        },
    ],
});

import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

/**
 * Playwright 配置：多客戶端延遲測試
 * 
 * 環境變數：
 * - BASE_URL: 應用 URL（預設: http://localhost:3000）
 * - 若 BASE_URL 指向 localhost，自動重用已不在運行的服務器
 * - 若未指定 BASE_URL，在本地開發時自動啟動 npm run dev
 */

// 從環境變數讀取 BASE_URL，預設為 localhost:3000
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// 取出 URL 中的 host:port
let shouldStartWebServer = true;
try {
  const urlObj = new URL(BASE_URL);
  const isLocalhost = urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1' || urlObj.hostname === '0.0.0.0';
  
  // 如果指向本地 localhost，假設應用已經運行，不需要啟動新的 webServer
  if (isLocalhost) {
    console.log(`✅ 檢測到 BASE_URL 為本地地址: ${BASE_URL}`);
    console.log(`   假設應用已在運行，將重用已有的服務器`);
    shouldStartWebServer = false;
  } else {
    console.log(`ℹ️ BASE_URL 為遠端地址: ${BASE_URL}，不啟動本地 webServer`);
    shouldStartWebServer = false;
  }
} catch (e) {
  console.warn(`⚠️ 無法解析 BASE_URL "${BASE_URL}"，使用預設 webServer 配置`);
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60000,

  fullyParallel: false, // 禁用並行以避免端口衝突
  forbidOnly: process.env.CI ? true : false,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1, // 只用 1 個 worker

  reporter: [
    ['html', { outputFolder: 'test-results' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // 修正：launchOptions 包含 args
    launchOptions: {
      args: ['--start-maximized'],
    }
  },

  projects: [
    {
      name: 'classroom-sync-test',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  ...(shouldStartWebServer ? {
    webServer: {
      command: 'npm run dev',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    }
  } : {
    webServer: undefined
  }),
});

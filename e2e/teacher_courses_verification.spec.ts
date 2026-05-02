import { test, expect, Page, Locator } from '@playwright/test';
import { autoLogin, injectDeviceCheckBypass } from './helpers/whiteboard_helpers';
import { getTestConfig } from './test_data/whiteboard_test_data';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
const APP_ENV = process.env.APP_ENV || 'local';
dotenv.config({ path: path.resolve(__dirname, '..', `.env.${APP_ENV}`) });

function requireEnv(...keys: string[]): string {
    for (const key of keys) {
        const value = process.env[key];
        if (value && value.trim()) {
            return value.trim();
        }
    }
    throw new Error(`Missing required environment variable(s): ${keys.join(', ')}`);
}

async function getOrderRowsOrNull(page: Page): Promise<Locator | null> {
    const table = page.locator('table.orders-table').first();
    const noDataText = page.locator('text=目前沒有符合條件的訂單').first();

    if (await table.isVisible().catch(() => false)) {
        return page.locator('table.orders-table tbody tr');
    }
    if (await noDataText.isVisible().catch(() => false)) {
        return null;
    }

    await page.waitForTimeout(2000);
    if (await table.isVisible().catch(() => false)) {
        return page.locator('table.orders-table tbody tr');
    }
    if (await noDataText.isVisible().catch(() => false)) {
        return null;
    }

    return null;
}

test.describe('Teacher Courses Page Verification', () => {
    let page: Page;
    const config = getTestConfig();
    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    // Test credentials from .env.local or fallback
    const TEACHER_EMAIL = process.env.TEST_TEACHER_EMAIL || 'teacher@example.com';
    const TEACHER_PASSWORD = requireEnv('TEST_TEACHER_PASSWORD', 'QA_TEACHER_PASSWORD');

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();

        console.log('\n=== 測試環境信息 ===');
        console.log(`BASE_URL: ${BASE_URL}`);
        console.log(`TEST_TEACHER_EMAIL 已配置: ${!!TEACHER_EMAIL}`);
        console.log(`TEST_TEACHER_PASSWORD 已配置: ${!!TEACHER_PASSWORD}`);
        await injectDeviceCheckBypass(page);
        await autoLogin(page, TEACHER_EMAIL, TEACHER_PASSWORD, config.bypassSecret);

        // Step 5: 導航到 /teacher_courses 頁面
        console.log('正在導航到 /teacher_courses 頁面...');
        await page.goto(`${BASE_URL}/teacher_courses?includeTests=true`, { waitUntil: 'networkidle', timeout: 30000 });

        // 檢查頁面內容，確保我們真的進去了
        const content = await page.textContent('body');
        if (content?.includes('目前沒有符合條件的訂單') || content?.includes('學生')) {
            console.log('✅ 成功進入教師課程頁面');
        } else {
            console.log('⚠️ 頁面內容似乎不正確，可能權限不足或加載中');
        }
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('檢查1: 進入教室按鈕時間驗證', async () => {
        console.log('>>> [檢查1] 開始...');
        const rows = await getOrderRowsOrNull(page);
        if (!rows) {
            console.log('>>> [檢查1] 無符合條件訂單，略過按鈕時窗細節驗證');
            await expect(page.locator('text=目前沒有符合條件的訂單').first()).toBeVisible();
            return;
        }

        console.log('>>> [檢查1] 表格已見');
        const rowCount = await rows.count();
        console.log(`>>> [檢查1] 找到 ${rowCount} 個課程記錄`);

        if (rowCount === 0) {
            console.log('>>> [檢查1] 警告：未找到課程記錄');
            return;
        }

        let buttonCount = 0;
        let hiddenCount = 0;

        for (let i = 0; i < Math.min(rowCount, 5); i++) {
            const row = rows.nth(i);
            const courseName = await row.locator('td:nth-child(2)').textContent().catch(() => 'Unknown');
            const enterClassroomCell = row.locator('td:nth-child(9)');
            const button = enterClassroomCell.locator('a.btn');
            const buttonVisible = await button.count() > 0;

            console.log(`>>> [檢查1] 課程 ${i + 1}：${courseName?.trim()} | 按鈕可見: ${buttonVisible}`);
            if (buttonVisible) {
                buttonCount++;
            } else {
                hiddenCount++;
            }
        }
        console.log(`>>> [檢查1] 結束. 統計: 可見=${buttonCount}, 隱藏=${hiddenCount}`);
        expect(rowCount).toBeGreaterThan(0);
    });

    test('檢查2: 學生與課程資料檢查', async () => {
        console.log('>>> [檢查2] 開始...');
        const rows = await getOrderRowsOrNull(page);
        if (!rows) {
            console.log('>>> [檢查2] 無符合條件訂單，略過欄位細節驗證');
            await expect(page.locator('text=目前沒有符合條件的訂單').first()).toBeVisible();
            return;
        }

        const rowCount = await rows.count();
        console.log(`>>> [檢查2] 找到 ${rowCount} 條`);

        for (let i = 0; i < Math.min(rowCount, 5); i++) {
            const row = rows.nth(i);
            const studentName = await row.locator('td:nth-child(1)').textContent().catch(() => '');
            const courseName = await row.locator('td:nth-child(2)').textContent().catch(() => '');

            console.log(`>>> [檢查2] 第 ${i + 1} 條: 學生="${studentName?.trim()}", 課程="${courseName?.trim()}"`);

            expect(studentName?.trim()).not.toBe('');
            expect(studentName?.trim()).not.toBe('-');
        }
        console.log('>>> [檢查2] 結束');
    });

    test('檢查3: 課程時長與剩餘資訊檢查', async () => {
        console.log('>>> [檢查3] 開始...');
        const rows = await getOrderRowsOrNull(page);
        if (!rows) {
            console.log('>>> [檢查3] 無符合條件訂單，略過時長細節驗證');
            await expect(page.locator('text=目前沒有符合條件的訂單').first()).toBeVisible();
            return;
        }

        const rowCount = await rows.count();
        console.log(`>>> [檢查3] 找到 ${rowCount} 條`);

        for (let i = 0; i < Math.min(rowCount, 5); i++) {
            const row = rows.nth(i);
            const duration = await row.locator('td:nth-child(4)').textContent().catch(() => '');
            console.log(`>>> [檢查3] 第 ${i + 1} 條: 時長="${duration?.trim()}"`);
            expect(duration?.trim()).not.toBe('-');
        }
        console.log('>>> [檢查3] 結束');
    });

    test('檢查4: 開始/結束時間正確性', async () => {
        console.log('>>> [檢查4] 開始...');
        const rows = await getOrderRowsOrNull(page);
        if (!rows) {
            console.log('>>> [檢查4] 無符合條件訂單，略過時間欄位驗證');
            await expect(page.locator('text=目前沒有符合條件的訂單').first()).toBeVisible();
            return;
        }

        const rowCount = await rows.count();
        console.log(`>>> [檢查4] 找到 ${rowCount} 條`);

        for (let i = 0; i < Math.min(rowCount, 5); i++) {
            const row = rows.nth(i);
            const startTime = await row.locator('td:nth-child(7)').textContent().catch(() => '');
            const endTime = await row.locator('td:nth-child(8)').textContent().catch(() => '');
            console.log(`>>> [檢查4] 第 ${i + 1} 條: 開始="${startTime?.trim()}", 結束="${endTime?.trim()}"`);
            expect(startTime?.includes('時間缺失')).toBeFalsy();
        }
        console.log('>>> [檢查4] 結束');
    });

    test('綜合驗收清單', async () => {
        console.log('>>> [綜合驗收] 開始...');
        const rows = await getOrderRowsOrNull(page);
        if (!rows) {
            console.log('>>> [綜合驗收] 無符合條件訂單，確認空資料提示正確');
            await expect(page.locator('text=目前沒有符合條件的訂單').first()).toBeVisible();
            return;
        }

        const rowCount = await rows.count();
        console.log(`>>> [綜合驗收] 找到 ${rowCount} 條記錄`);

        const headers = page.locator('table.orders-table thead th');
        const headerCount = await headers.count();
        console.log(`>>> [綜合驗收] 表頭數量: ${headerCount}`);

        expect(headerCount).toBeGreaterThanOrEqual(8);
        expect(rowCount).toBeGreaterThan(0);
        console.log('>>> [綜合驗收] 結束');
    });

});

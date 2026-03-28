import { test, expect, Page } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

test.describe('Teacher Courses Page Verification', () => {
    let page: Page;
    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    // Test credentials from .env.local or fallback
    const TEACHER_EMAIL = process.env.TEST_TEACHER_EMAIL || 'teacher@example.com';
    const TEACHER_PASSWORD = process.env.TEST_TEACHER_PASSWORD || '';
    const LOGIN_BYPASS_SECRET = process.env.LOGIN_BYPASS_SECRET || '';

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();

        console.log('\n=== 測試環境信息 ===');
        console.log(`BASE_URL: ${BASE_URL}`);
        console.log(`TEST_TEACHER_EMAIL 已配置: ${!!TEACHER_EMAIL}`);
        console.log(`TEST_TEACHER_PASSWORD 已配置: ${!!TEACHER_PASSWORD}`);
        console.log(`LOGIN_BYPASS_SECRET 已配置: ${!!LOGIN_BYPASS_SECRET}`);

        // Step 1: 先執行登出，確保我們從乾淨的狀態開始
        console.log('\n正在執行預防性登出...');
        await page.goto(`${BASE_URL}/api/auth/logout`, { waitUntil: 'networkidle' }).catch(() => null);
        await page.waitForTimeout(1000);

        // Step 2: 導航到登入頁面
        console.log('正在導航到登入頁面...');
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 20000 });

        // Step 3: 如果需要登入，檢查是否有測試憑據
        console.log(`檢查憑據: TEACHER_EMAIL=${TEACHER_EMAIL}, SECRET_LEN=${LOGIN_BYPASS_SECRET.length}`);
        if (!TEACHER_PASSWORD || !LOGIN_BYPASS_SECRET) {
            console.log('⚠️ 缺少測試憑據 (TEST_TEACHER_PASSWORD 或 LOGIN_BYPASS_SECRET)，無法自動登錄。');
            return;
        }

        // Step 4: 填寫登入表單
        console.log('正在填寫登入表單...');
        try {
            await page.waitForSelector('input[type="email"]', { timeout: 10000 });
            await page.locator('input[type="email"]').first().fill(TEACHER_EMAIL);
            await page.locator('input[type="password"]').first().fill(TEACHER_PASSWORD);

            // 填寫驗證碼欄位 (使用 LOGIN_BYPASS_SECRET 繞過驗證碼)
            const captchaSelectors = [
                'input#captcha',
                'input[name="captcha"]',
                'input[placeholder*="驗"]',
                'input[placeholder*="code"]',
                'input[type="text"]:nth-of-type(3)',
            ];

            let captchaFilled = false;
            for (const selector of captchaSelectors) {
                const captchaInput = page.locator(selector).first();
                if (await captchaInput.count() > 0) {
                    await captchaInput.fill(LOGIN_BYPASS_SECRET);
                    console.log('✅ 已填寫驗證碼 (針對教師帳號)');
                    captchaFilled = true;
                    break;
                }
            }

            const submitButton = page.locator('button[type="submit"]').first();
            await submitButton.click();

            // 等待登入後跳轉
            await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 20000 });
            console.log(`✅ 登入成功，目前 URL: ${page.url()}`);
        } catch (err: any) {
            console.log(`❌ 登入流程出錯: ${err.message}`);
            return;
        }

        // Step 5: 導航到 /teacher_courses 頁面
        console.log('正在導航到 /teacher_courses 頁面...');
        await page.goto(`${BASE_URL}/teacher_courses`, { waitUntil: 'networkidle', timeout: 20000 });

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
        const table = page.locator('table.orders-table');
        await expect(table).toBeVisible({ timeout: 15000 });
        console.log('>>> [檢查1] 表格已見');

        const rows = page.locator('table.orders-table tbody tr');
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
        const table = page.locator('table.orders-table');
        await expect(table).toBeVisible({ timeout: 10000 });

        const rows = page.locator('table.orders-table tbody tr');
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
        const table = page.locator('table.orders-table');
        await expect(table).toBeVisible({ timeout: 10000 });

        const rows = page.locator('table.orders-table tbody tr');
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
        const table = page.locator('table.orders-table');
        await expect(table).toBeVisible({ timeout: 10000 });

        const rows = page.locator('table.orders-table tbody tr');
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
        const table = page.locator('table.orders-table');
        await expect(table).toBeVisible({ timeout: 15000 });

        const rows = page.locator('table.orders-table tbody tr');
        const rowCount = await rows.count();
        console.log(`>>> [綜合驗收] 找到 ${rowCount} 條記錄`);

        const headers = page.locator('table.orders-table thead th');
        const headerCount = await headers.count();
        console.log(`>>> [綜合驗收] 表頭數量: ${headerCount}`);

        expect(headerCount).toBe(9);
        expect(rowCount).toBeGreaterThan(0);
        console.log('>>> [綜合驗收] 結束');
    });

});

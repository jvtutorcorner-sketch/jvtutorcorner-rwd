import { test, expect, Page } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

test.describe('Course Alignment (Student vs Teacher) Verification', () => {
    let studentPage: Page;
    let teacherPage: Page;

    const BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const LOGIN_BYPASS_SECRET = process.env.LOGIN_BYPASS_SECRET || '';

    const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL || 'basic@test.com';
    const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD || '123456';

    const TEACHER_EMAIL = process.env.TEST_TEACHER_EMAIL || 'lin@test.com';
    const TEACHER_PASSWORD = process.env.TEST_TEACHER_PASSWORD || '123456';

    interface CourseData {
        id: string;
        name: string;
        startTime: string;
        endTime: string;
    }

    async function login(page: Page, email: string, password: string) {
        console.log(`正在登入: ${email}...`);
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

        await page.locator('input[type="email"]').first().fill(email);
        await page.locator('input[type="password"]').first().fill(password);

        const captchaSelectors = [
            'input#captcha',
            'input[name="captcha"]',
            'input[placeholder*="驗"]',
            'input[placeholder*="code"]',
        ];

        for (const selector of captchaSelectors) {
            const captchaInput = page.locator(selector).first();
            if (await captchaInput.count() > 0) {
                await captchaInput.fill(LOGIN_BYPASS_SECRET);
                break;
            }
        }

        await page.locator('button[type="submit"]').first().click();
        await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 20000 });
        console.log(`✅ 登入成功: ${email}`);
    }

    test('驗證學生端與老師端的課程資料對齊', async ({ browser }) => {
        // --- STEP 1: 登入學生端並抓取資料 ---
        const studentContext = await browser.newContext();
        studentPage = await studentContext.newPage();
        await login(studentPage, STUDENT_EMAIL, STUDENT_PASSWORD);

        await studentPage.goto(`${BASE_URL}/student_courses`, { waitUntil: 'networkidle' });
        console.log('正在抓取學生端課程資料...');

        const studentRows = studentPage.locator('table.orders-table tbody tr');
        const studentRowCount = await studentRows.count();
        const studentCourses: Map<string, CourseData> = new Map();

        for (let i = 0; i < studentRowCount; i++) {
            const row = studentRows.nth(i);
            const courseLink = row.locator('td:nth-child(2) a');
            if (await courseLink.count() === 0) continue;

            const name = (await courseLink.textContent())?.trim() || '';
            const href = await courseLink.getAttribute('href') || '';
            const id = href.split('/').pop() || '';
            const startTime = (await row.locator('td:nth-child(7)').textContent())?.trim() || '';
            const endTime = (await row.locator('td:nth-child(8)').textContent())?.trim() || '';

            if (id) {
                // Verify the course record exists in DB before adding to comparison list
                // Skip orphaned orders (course was deleted but order remains)
                const courseCheckRes = await studentPage.request.get(`${BASE_URL}/api/courses?id=${encodeURIComponent(id)}`);
                const courseCheckData = await courseCheckRes.json();
                if (!courseCheckData?.ok || !courseCheckData?.course) {
                    console.warn(`  ⚠️  [學生端] 跳過孤立訂單 (課程記錄不存在): ${id}`);
                    continue;
                }
                studentCourses.set(id, { id, name, startTime, endTime });
                console.log(`  [學生端] 找到課程: ${name} (ID: ${id}) | 時間: ${startTime} ~ ${endTime}`);
            }
        }
        await studentContext.close();

        // --- STEP 2: 登入老師端並抓取資料 ---
        const teacherContext = await browser.newContext();
        teacherPage = await teacherContext.newPage();
        await login(teacherPage, TEACHER_EMAIL, TEACHER_PASSWORD);

        await teacherPage.goto(`${BASE_URL}/teacher_courses`, { waitUntil: 'networkidle' });
        console.log('正在抓取老師端課程資料...');

        const teacherRows = teacherPage.locator('table.orders-table tbody tr');
        const teacherRowCount = await teacherRows.count();
        const teacherCourses: Map<string, CourseData> = new Map();

        for (let i = 0; i < teacherRowCount; i++) {
            const row = teacherRows.nth(i);
            const courseCell = row.locator('td:nth-child(2)');
            const name = (await courseCell.textContent())?.trim() || '';

            // Note: In teacher view, sometimes it might not be a link or ID might be hidden, 
            // but let's assume we can match by name and time if ID is not easily available, 
            // or better yet, look for any data-id or link.
            // Based on previous skills, course name is in nth-child(2).

            const startTime = (await row.locator('td:nth-child(7)').textContent())?.trim() || '';
            const endTime = (await row.locator('td:nth-child(8)').textContent())?.trim() || '';

            // For comparison, we use name + startTime as a composite key if ID is not clear from table
            // However, let's try to find an ID if possible (maybe in a link?)
            const courseLink = courseCell.locator('a');
            let id = '';
            if (await courseLink.count() > 0) {
                const href = await courseLink.getAttribute('href') || '';
                id = href.split('/').pop() || '';
            }

            // We'll store it by name + startTime to cross-reference even if ID is tricky
            const key = id || `${name}_${startTime}`;
            teacherCourses.set(key, { id, name, startTime, endTime });
            console.log(`  [老師端] 找到課程: ${name} | 時間: ${startTime} ~ ${endTime}`);
        }
        await teacherContext.close();

        // --- STEP 3: 交叉比對 ---
        console.log('\n開始驗證對齊...');
        let mismatchCount = 0;

        for (const [id, sCourse] of studentCourses) {
            // Try matching by ID first, then by name + startTime
            let tCourse = teacherCourses.get(id);
            if (!tCourse) {
                tCourse = teacherCourses.get(`${sCourse.name}_${sCourse.startTime}`);
            }

            if (!tCourse) {
                console.log(`❌ 警告: 在老師端找不到學生端的課程: ${sCourse.name} (ID: ${id}) at ${sCourse.startTime}`);
                mismatchCount++;
                continue;
            }

            // Compare names (fuzzy match because teacher side might have extra text or just title)
            if (!tCourse.name.includes(sCourse.name) && !sCourse.name.includes(tCourse.name)) {
                console.log(`❌ 課程名稱不匹配: [學生] ${sCourse.name} vs [老師] ${tCourse.name}`);
                mismatchCount++;
            }

            // Compare times
            if (sCourse.startTime !== tCourse.startTime) {
                console.log(`❌ 開始時間不匹配 (${sCourse.name}): [學生] ${sCourse.startTime} vs [老師] ${tCourse.startTime}`);
                mismatchCount++;
            }
            if (sCourse.endTime !== tCourse.endTime) {
                console.log(`❌ 結束時間不匹配 (${sCourse.name}): [學生] ${sCourse.endTime} vs [老師] ${tCourse.endTime}`);
                mismatchCount++;
            }

            if (sCourse.startTime === tCourse.startTime && sCourse.endTime === tCourse.endTime) {
                console.log(`✅ 對齊成功: ${sCourse.name}`);
            }
        }

        console.log(`\n驗證結果: 總課程數=${studentCourses.size}, 異常數=${mismatchCount}`);
        expect(mismatchCount).toBe(0);
    });
});

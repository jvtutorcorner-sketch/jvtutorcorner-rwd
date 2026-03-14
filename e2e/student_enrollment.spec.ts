import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

test('Student Enrollment Flow with auto-balance recovery', async ({ page }) => {
    test.setTimeout(300000);

    const email = process.env.TEST_STUDENT_EMAIL || 'basic@test.com';
    const password = process.env.TEST_STUDENT_PASSWORD || '123456';
    const bypassSecret = 'qa_bypass_0816'; 
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    console.log(`Starting test for ${email} at ${baseUrl}`);

    // Standard dialog handler
    page.on('dialog', async dialog => {
        console.log(`Dialog: [${dialog.type()}] ${dialog.message()}`);
        await dialog.accept();
    });

    page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
            console.log(`BROWSER ${msg.type().toUpperCase()}: ${msg.text()}`);
        }
    });

    // Create a NEW course
    const testCourseId = `test-course-${Date.now()}`;
    const testCourseTitle = `AI 自動測試課程-${Date.now()}`;
    
    console.log("Creating point-based test course...");
    try {
        await page.request.post(`${baseUrl}/api/courses`, {
            data: {
                id: testCourseId,
                title: testCourseTitle,
                teacherName: "Test Bot",
                enrollmentType: "points",
                pointCost: 10,
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + 30*86400000).toISOString(),
                status: '上架'
            }
        });
        console.log(`Test course created: ${testCourseTitle}`);
    } catch (e) {}

    // 0. Reset points
    console.log("Resetting points to 0...");
    await page.request.post(`${baseUrl}/api/points`, {
        data: { userId: email, action: 'set', amount: 0, reason: 'E2E Reset' }
    });

    // 1. Fresh Login
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    if (await page.locator('.menu-avatar-button').isVisible()) {
        await page.click('.menu-avatar-button');
        await page.click('button:has-text("登出")');
    }
    await page.goto(`${baseUrl}/login`);
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.fill('#captcha', bypassSecret);
    await page.click('button[type="submit"]');
    await expect(page.locator('.menu-avatar-button').or(page.locator('.menu-user-email')).first()).toBeVisible({ timeout: 20000 });
    console.log("Login successful.");

    // 2. Navigate to course
    await page.goto(`${baseUrl}/courses/${testCourseId}`);
    await expect(page.locator('text=點數不足')).toBeVisible({ timeout: 10000 });
    console.log("Confirmed point shortage.");

    // 3. Buy points
    await page.goto(`${baseUrl}/pricing`);
    await page.locator('a:has-text("購買點數")').first().click();
    await page.waitForURL(/\/pricing\/checkout/);
    await page.click('button:has-text("模擬支付 (Demo)")');
    
    // Wait for redirection back to /plans or /pricing
    console.log("Waiting for redirection to /plans...");
    await page.waitForURL(url => url.pathname === '/plans' || url.pathname === '/pricing', { timeout: 30000 });
    console.log("Point purchase successful.");

    // (OPTIONAL) Verify balance if possible
    
    // 4. Back to course and enroll
    console.log(`Navigating back to course: ${testCourseId}`);
    await page.goto(`${baseUrl}/courses/${testCourseId}`);
    
    console.log("Clicking '立即報名課程'...");
    await page.click('button:has-text("立即報名課程")');
    
    console.log("Waiting for '確認報名' button...");
    const confirmBtn = page.locator('button:has-text("確認報名")');
    await confirmBtn.waitFor({ state: 'visible', timeout: 10000 });
    
    // Check if points tab is needed
    const pointsTab = page.locator('button:has-text("點數報名")');
    if (await pointsTab.isVisible()) {
        await pointsTab.click();
    }
    
    console.log("Clicking '確認報名'...");
    await confirmBtn.click();

    // 5. Verification
    console.log("Waiting for redirection to /student_courses...");
    await page.waitForURL('**/student_courses', { timeout: 40000 });
    
    console.log("Verifying course in dashboard...");
    await expect(page.locator('.orders-table')).toContainText(testCourseTitle, { timeout: 20000 });
    
    console.log("SUCCESS: Course successfully enrolled!");
    
    // Cleanup
    try { await page.request.delete(`${baseUrl}/api/courses?id=${testCourseId}`); } catch(e){}
});

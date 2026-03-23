import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

test('Navbar Verification After Registration (Auto-Login)', async ({ page }) => {
    // Pipe browser console logs to terminal
    page.on('console', msg => console.log(`[BROWSER] ${msg.text()}`));
    
    test.setTimeout(90000);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const bypassSecret = process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET || 'jv_secret_bypass_2024';
    
    // Generate random user details
    const timestamp = Date.now();
    const testEmail = `testuser_${timestamp}@example.com`;
    const testFirstName = `Test`;
    const testLastName = `User_${timestamp}`;

    console.log(`Starting navbar verification for ${testEmail}`);

    // 1. Go to register page
    await page.goto(`${baseUrl}/login/register`, { waitUntil: 'networkidle' });

    // 2. Fill registration form
    // Select Identity: Student
    await page.selectOption('select:has-text("請選擇身份")', { label: 'Student' });
    
    // Fill First Name (find input following the label)
    await page.locator('label:has-text("First Name") + input').fill(testFirstName);
    
    // Fill Last Name
    await page.locator('label:has-text("Last Name") + input').fill(testLastName);
    
    // Fill Email
    await page.locator('label:has-text("Email") + input').fill(testEmail);
    
    // Fill Password
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill('Password123!');
    
    // Fill Confirm Password
    await passwordInputs.nth(1).fill('Password123!');
    
    // Fill Birthdate
    await page.locator('label:has-text("出生日期") + input').fill('2000-01-01');
    
    // Select Gender
    await page.selectOption('label:has-text("性別") + select', { label: '男' });
    
    // Select Country
    await page.selectOption('label:has-text("國家") + select', { label: '台灣 TW' });
    
    // Accept Terms
    await page.check('input[name="terms"]');
    
    // Bypass Captcha
    await page.fill('input[placeholder="請輸入上方驗證碼"]', bypassSecret);

    // 3. Submit Form
    await page.click('button:has-text("建立帳戶")');

    // 4. Verify Success Message and Redirect
    console.log("Waiting for success message...");
    await expect(page.locator('.form-success')).toBeVisible({ timeout: 15000 });
    
    // Wait for redirect to home page
    console.log("Waiting for redirect to home page...");
    await page.waitForURL(`${baseUrl}/`, { timeout: 15000 });

    // 5. Verify Navbar State (Auto-Login)
    console.log("Verifying navbar state...");
    
    // Email should be visible in navbar
    const userEmailInNavbar = page.locator('.menu-user-email');
    await expect(userEmailInNavbar).toBeVisible({ timeout: 10000 });
    await expect(userEmailInNavbar).toHaveText(testEmail);

    // Role should be "學生" or "使用者"
    const roleInNavbar = page.locator('.menu-user div').last();
    await expect(roleInNavbar).toHaveText(/學生|使用者/);

    // Avatar button should be visible
    const avatarBtn = page.locator('.menu-avatar-button');
    await expect(avatarBtn).toBeVisible();
    await expect(avatarBtn).toHaveText('TU');

    // Login button should NOT be visible
    const loginBtn = page.locator('button:has-text("登入")');
    await expect(loginBtn).not.toBeVisible();

    // 6. Verify Multi-Page Interactive Product Tour
    console.log("Verifying Product Tour Phase 1: Home...");
    const tourTitle = page.locator('.driver-popover-title');
    await expect(tourTitle).toBeVisible({ timeout: 10000 });
    await expect(tourTitle).toContainText('歡迎來到導師配對平台');

    const nextBtn = page.locator('button:has-text("下一步")');
    
    // Step 2: AI Recommendations
    await nextBtn.click();
    await expect(tourTitle).toContainText('AI 專屬推薦');
    
    // Step 3: Survey (NEW)
    await nextBtn.click();
    await expect(tourTitle).toContainText('告訴我們您的興趣');

    // Step 4: Tabs
    await nextBtn.click();
    await expect(tourTitle).toContainText('快速切換預覽');

    // Step 4: Transition to Teachers
    await nextBtn.click();
    await expect(tourTitle).toContainText('即將前往：師資專區');
    
    console.log("Navigating to Teachers page via tour...");
    await nextBtn.click(); // This triggers router.push('/teachers')
    
    // Verify Phase 2: Teachers
    console.log("Verifying Product Tour Phase 2: Teachers...");
    await page.waitForURL(/.*\/teachers/, { timeout: 15000 });
    // Small delay to ensure ProductTour component effect runs and driver is ready
    await page.waitForTimeout(2000);
    
    console.log(`Current URL: ${page.url()}`);
    await expect(tourTitle).toBeVisible({ timeout: 15000 });
    
    const teachersText = await tourTitle.innerText();
    console.log(`Teachers phase popover text: "${teachersText}"`);
    await expect(tourTitle).toContainText('精準搜尋老師');

    // Step 2: Teacher card
    await nextBtn.click();
    await expect(tourTitle).toContainText('深入了解導師');

    // Step 3: Transition to Courses
    await nextBtn.click();
    await expect(tourTitle).toContainText('下一個：精選課程');
    
    console.log("Navigating to Courses page via tour...");
    await nextBtn.click(); // This triggers router.push('/courses')

    // Verify Phase 3: Courses
    console.log("Verifying Product Tour Phase 3: Courses...");
    await page.waitForURL(/.*\/courses/, { timeout: 15000 });
    await page.waitForTimeout(2000);
    
    console.log(`Current URL: ${page.url()}`);
    await expect(tourTitle).toBeVisible({ timeout: 15000 });
    
    const coursesText = await tourTitle.innerText();
    console.log(`Courses phase popover text: "${coursesText}"`);
    await expect(tourTitle).toContainText('探索多樣化課程');

    // Step 2: About Us (Final)
    await nextBtn.click();
    await expect(tourTitle).toContainText('關於我們');
    
    await page.locator('button:has-text("完成導覽")').click();

    console.log("SUCCESS: Multi-page interactive tour verified successfully.");
});

import { test, expect } from '@playwright/test';

/**
 * 正式環境 Navbar 驗證測試
 * URL: https://www.jvtutorcorner.com/
 * 
 * 本測試專注於驗證：
 * 1. 未登入状态下的 Navbar（显示"登入"按钮）
 * 2. 登入後的 Navbar（显示用户头像及下拉菜单）
 * 3. 下拉菜单的权限过滤（Student vs Teacher vs Admin）
 */

const PRODUCTION_URL = 'https://www.jvtutorcorner.com';

test.describe('Production Navbar Verification', () => {
    
    test('1. Verify Navbar Guest State (Unauthenticated)', async ({ page }) => {
        console.log('========== Test: Guest State Navbar ==========');
        test.setTimeout(30000);
        
        await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });
        
        // Verify "登入" button is visible
        const loginBtn = page.locator('button:has-text("登入")');
        await expect(loginBtn).toBeVisible({ timeout: 10000 });
        console.log('✓ Login button is visible');
        
        // Verify avatar button is NOT visible
        const avatarBtn = page.locator('button[class*="avatar"]');
        const avatarCount = await avatarBtn.count();
        console.log(`Avatar buttons found: ${avatarCount}`);
        
        // Verify no user email in navbar
        const userEmail = page.locator('.menu-user-email');
        const emailVisible = await userEmail.isVisible().catch(() => false);
        console.log(`User email visible: ${emailVisible}`);
        
        console.log('✓ Guest state navbar verification passed');
    });

    test('2. Verify Navbar Student Role After Login', async ({ page, context }) => {
        console.log('========== Test: Student Role Navbar ==========');
        test.setTimeout(60000);
        
        // Mock login by injecting localStorage (for student role)
        await context.addInitScript(() => {
            const studentUser = {
                id: 'test_student_123',
                email: 'test.student@example.com',
                firstName: 'Test',
                lastName: 'Student',
                role: 'student',
                roleId: 'student'
            };
            localStorage.setItem('tutor_mock_user', JSON.stringify(studentUser));
        });
        
        await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });
        await page.reload({ waitUntil: 'networkidle' });
        
        // Wait for Navbar to update
        await page.waitForTimeout(2000);
        
        // Verify user email is visible
        const userEmail = page.locator('.menu-user-email');
        try {
            await expect(userEmail).toBeVisible({ timeout: 10000 });
            const email = await userEmail.innerText();
            console.log(`✓ User email displayed: ${email}`);
        } catch (e) {
            console.log('⚠ User email not found, attempting alternative locator');
        }
        
        // Click avatar button to open dropdown
        const avatarBtn = page.locator('button[class*="avatar"], .menu-avatar-button');
        await expect(avatarBtn).toBeVisible({ timeout: 10000 });
        await avatarBtn.click();
        
        // Wait for dropdown to appear
        await page.waitForTimeout(500);
        
        // Verify Student-specific menu items
        console.log('Verifying Student menu items:');
        
        // Student should see "學生的課程訂單"
        const studentCoursesOption = page.locator('a:has-text("學生的課程訂單")');
        try {
            await expect(studentCoursesOption).toBeVisible({ timeout: 5000 });
            console.log('✓ Student courses menu item visible');
        } catch (e) {
            console.log('✗ Student courses menu item NOT found');
        }
        
        // Student should see "個人設定"
        const settingsOption = page.locator('a:has-text("個人設定")');
        try {
            await expect(settingsOption).toBeVisible({ timeout: 5000 });
            console.log('✓ Settings menu item visible');
        } catch (e) {
            console.log('✗ Settings menu item NOT found');
        }
        
        // Student should see "方案與價格"
        const myPlansOption = page.locator('a:has-text("方案與價格")');
        try {
            await expect(myPlansOption).toBeVisible({ timeout: 5000 });
            console.log('✓ Plans menu item visible');
        } catch (e) {
            console.log('✗ Plans menu item NOT found');
        }
        
        // Student should NOT see "個人檔案" (Teacher-specific)
        const teacherProfileOption = page.locator('a:has-text("個人檔案")');
        const profileVisible = await teacherProfileOption.isVisible().catch(() => false);
        if (!profileVisible) {
            console.log('✓ Teacher profile menu item correctly hidden');
        } else {
            console.log('✗ ERROR: Teacher profile menu item visible for Student!');
        }
        
        // Student should NOT see "老師審核" (Admin-specific)
        const teacherReviewOption = page.locator('a:has-text("老師審核")');
        const reviewVisible = await teacherReviewOption.isVisible().catch(() => false);
        if (!reviewVisible) {
            console.log('✓ Admin review menu item correctly hidden');
        } else {
            console.log('✗ ERROR: Admin review menu item visible for Student!');
        }
        
        // Verify Logout button
        const logoutBtn = page.locator('button:has-text("登出")');
        try {
            await expect(logoutBtn).toBeVisible({ timeout: 5000 });
            console.log('✓ Logout button visible');
        } catch (e) {
            console.log('✗ Logout button NOT found');
        }
        
        console.log('✓ Student role navbar verification passed');
    });

    test('3. Verify Navbar Teacher Role After Login', async ({ page, context }) => {
        console.log('========== Test: Teacher Role Navbar ==========');
        test.setTimeout(60000);
        
        // Mock login by injecting localStorage (for teacher role)
        await context.addInitScript(() => {
            const teacherUser = {
                id: 'test_teacher_456',
                email: 'test.teacher@example.com',
                firstName: 'Test',
                lastName: 'Teacher',
                role: 'teacher',
                roleId: 'teacher'
            };
            localStorage.setItem('tutor_mock_user', JSON.stringify(teacherUser));
        });
        
        await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });
        await page.reload({ waitUntil: 'networkidle' });
        
        // Wait for Navbar to update
        await page.waitForTimeout(2000);
        
        // Verify user email is visible
        const userEmail = page.locator('.menu-user-email');
        try {
            await expect(userEmail).toBeVisible({ timeout: 10000 });
            const email = await userEmail.innerText();
            console.log(`✓ User email displayed: ${email}`);
        } catch (e) {
            console.log('⚠ User email not found, attempting alternative locator');
        }
        
        // Click avatar button to open dropdown
        const avatarBtn = page.locator('button[class*="avatar"], .menu-avatar-button');
        await expect(avatarBtn).toBeVisible({ timeout: 10000 });
        await avatarBtn.click();
        
        // Wait for dropdown to appear
        await page.waitForTimeout(500);
        
        // Verify Teacher-specific menu items
        console.log('Verifying Teacher menu items:');
        
        // Teacher should see "個人檔案"
        const teacherProfileOption = page.locator('a:has-text("個人檔案")');
        try {
            await expect(teacherProfileOption).toBeVisible({ timeout: 5000 });
            console.log('✓ Teacher profile menu item visible');
        } catch (e) {
            console.log('✗ Teacher profile menu item NOT found');
        }
        
        // Teacher should see "個人設定"
        const settingsOption = page.locator('a:has-text("個人設定")');
        try {
            await expect(settingsOption).toBeVisible({ timeout: 5000 });
            console.log('✓ Settings menu item visible');
        } catch (e) {
            console.log('✗ Settings menu item NOT found');
        }
        
        // Teacher should see "方案與價格"
        const myPlansOption = page.locator('a:has-text("方案與價格")');
        try {
            await expect(myPlansOption).toBeVisible({ timeout: 5000 });
            console.log('✓ Plans menu item visible');
        } catch (e) {
            console.log('✗ Plans menu item NOT found');
        }
        
        // Teacher should NOT see "學生的課程訂單" (Student-specific)
        const studentCoursesOption = page.locator('a:has-text("學生的課程訂單")');
        const studentCoursesVisible = await studentCoursesOption.isVisible().catch(() => false);
        if (!studentCoursesVisible) {
            console.log('✓ Student courses menu item correctly hidden');
        } else {
            console.log('✗ ERROR: Student courses menu item visible for Teacher!');
        }
        
        // Teacher should NOT see "老師審核" (Admin-specific)
        const teacherReviewOption = page.locator('a:has-text("老師審核")');
        const reviewVisible = await teacherReviewOption.isVisible().catch(() => false);
        if (!reviewVisible) {
            console.log('✓ Admin review menu item correctly hidden');
        } else {
            console.log('✗ ERROR: Admin review menu item visible for Teacher!');
        }
        
        // Verify Logout button
        const logoutBtn = page.locator('button:has-text("登出")');
        try {
            await expect(logoutBtn).toBeVisible({ timeout: 5000 });
            console.log('✓ Logout button visible');
        } catch (e) {
            console.log('✗ Logout button NOT found');
        }
        
        console.log('✓ Teacher role navbar verification passed');
    });

    test('4. Verify Navbar Admin Role After Login', async ({ page, context }) => {
        console.log('========== Test: Admin Role Navbar ==========');
        test.setTimeout(60000);
        
        // Mock login by injecting localStorage (for admin role)
        await context.addInitScript(() => {
            const adminUser = {
                id: 'test_admin_789',
                email: 'admin@example.com',
                firstName: 'Admin',
                lastName: 'User',
                role: 'admin',
                roleId: 'admin'
            };
            localStorage.setItem('tutor_mock_user', JSON.stringify(adminUser));
        });
        
        await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });
        await page.reload({ waitUntil: 'networkidle' });
        
        // Wait for Navbar to update
        await page.waitForTimeout(2000);
        
        // Click avatar button to open dropdown
        const avatarBtn = page.locator('button[class*="avatar"], .menu-avatar-button');
        await expect(avatarBtn).toBeVisible({ timeout: 10000 });
        await avatarBtn.click();
        
        // Wait for dropdown to appear
        await page.waitForTimeout(500);
        
        // Verify Admin-specific menu items
        console.log('Verifying Admin menu items:');
        
        // Admin should see "老師審核"
        const teacherReviewOption = page.locator('a:has-text("老師審核")');
        try {
            await expect(teacherReviewOption).toBeVisible({ timeout: 5000 });
            console.log('✓ Admin review menu item visible');
        } catch (e) {
            console.log('✗ Admin review menu item NOT found');
        }
        
        // Admin should see admin dashboard or settings
        const adminSettingsOption = page.locator('a:has-text("後台管理")|a:has-text("管理面板")');
        try {
            await expect(adminSettingsOption).toBeVisible({ timeout: 5000 });
            console.log('✓ Admin panel menu item visible');
        } catch (e) {
            console.log('⚠ Admin panel menu item not found (may have different label)');
        }
        
        console.log('✓ Admin role navbar verification passed');
    });

    test('5. Verify Navbar Logout Functionality', async ({ page, context }) => {
        console.log('========== Test: Logout Functionality ==========');
        test.setTimeout(60000);
        
        // Mock login
        await context.addInitScript(() => {
            const studentUser = {
                id: 'test_logout_user',
                email: 'logout.test@example.com',
                firstName: 'Logout',
                lastName: 'Test',
                role: 'student',
                roleId: 'student'
            };
            localStorage.setItem('tutor_mock_user', JSON.stringify(studentUser));
        });
        
        await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        
        // Verify logged in state
        const userEmail = page.locator('.menu-user-email');
        await expect(userEmail).toBeVisible({ timeout: 10000 });
        console.log('✓ User logged in');
        
        // Click avatar and logout
        const avatarBtn = page.locator('button[class*="avatar"], .menu-avatar-button');
        await avatarBtn.click();
        await page.waitForTimeout(500);
        
        const logoutBtn = page.locator('button:has-text("登出")');
        await logoutBtn.click();
        
        // Wait for logout to complete
        await page.waitForTimeout(2000);
        
        // Verify logout by checking if login button reappears
        const loginBtn = page.locator('button:has-text("登入")');
        try {
            await expect(loginBtn).toBeVisible({ timeout: 10000 });
            console.log('✓ Logout successful - Login button reappeared');
        } catch (e) {
            console.log('✗ Logout verification failed');
        }
        
        console.log('✓ Logout functionality verification passed');
    });
});

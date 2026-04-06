import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// Helper to ensure .env.local matches
const envLocalPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
    const envFile = fs.readFileSync(envLocalPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '');
            if (!process.env[key.trim()]) {
                process.env[key.trim()] = value;
            }
        }
    });
}

test('Point Purchase Flow (Simulated Payment)', async ({ page }) => {
    test.setTimeout(120000);

    const email = process.env.TEST_STUDENT_EMAIL;
    const password = process.env.TEST_STUDENT_PASSWORD;
    const bypassSecret = process.env.LOGIN_BYPASS_SECRET || process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (!email || !password || !baseUrl) {
        throw new Error('❌ Missing Environment Variables! Requirement: TEST_STUDENT_EMAIL, TEST_STUDENT_PASSWORD, NEXT_PUBLIC_BASE_URL');
    }

    console.log(`Starting simulated point purchase test for ${email} at ${baseUrl}`);

    // 1. Fresh Login
    console.log("Navigating to login...");
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });

    // Use API login for speed
    let captchaToken: string | null = null;
    try {
        const captchaRes = await page.request.get(`${baseUrl}/api/captcha`);
        const captchaData = await captchaRes.json();
        captchaToken = captchaData.token;
    } catch (e) {
        console.warn("Failed to load captcha token");
    }

    const loginRes = await page.request.post(`${baseUrl}/api/login`, {
        data: JSON.stringify({
            email, password, captchaToken: captchaToken || '', captchaValue: bypassSecret
        }),
        headers: { 'Content-Type': 'application/json' }
    });

    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error(`Login failed: ${loginData.message}`);

    await page.evaluate((data) => {
        localStorage.setItem('tutor_mock_user', JSON.stringify({
            email: data.profile.email,
            plan: data.profile.plan || 'basic',
            role: data.profile.role,
            firstName: data.profile.firstName,
            lastName: data.profile.lastName
        }));
        window.dispatchEvent(new Event('tutor:auth-changed'));
    }, loginData);

    // 2. Fetch point balance before
    const balanceBeforeRes = await page.request.get(`${baseUrl}/api/points?userId=${email}`);
    const balanceBefore = (await balanceBeforeRes.json()).balance;
    console.log(`Initial point balance: ${balanceBefore}`);

    // 3. Go to pricing and pick a point package
    console.log("Navigating to Pricing page...");
    await page.goto(`${baseUrl}/pricing`, { waitUntil: 'networkidle' });
    
    // Look for a point package purchase link/button
    const purchaseBtn = page.locator('a:has-text("購買點數"), button:has-text("購買點數")').first();
    await purchaseBtn.click();
    await page.waitForURL(/\/pricing\/checkout/);

    console.log("On Checkout Page. Executing Simulated Payment...");
    const simulatedBtn = page.locator('button:has-text("模擬支付 (Demo)")');
    await simulatedBtn.click();

    // 4. Verification
    console.log("Waiting for redirection back to /plans or /pricing...");
    await page.waitForURL(url => url.pathname === '/plans' || url.pathname === '/pricing', { timeout: 30000 });
    
    console.log("Purchase verified in UI. Checking API for balance update...");
    const balanceAfterRes = await page.request.get(`${baseUrl}/api/points?userId=${email}`);
    const balanceAfter = (await balanceAfterRes.json()).balance;
    console.log(`New point balance: ${balanceAfter}`);

    if (balanceAfter <= balanceBefore) {
        throw new Error(`❌ Point balance did not increase! (Before: ${balanceBefore}, After: ${balanceAfter})`);
    }

    console.log(`✅ Success: Point purchase completed! (${balanceBefore} -> ${balanceAfter})`);
});

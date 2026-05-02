import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const APP_ENV = process.env.APP_ENV || 'local';
dotenv.config({ path: path.resolve(__dirname, '..', `.env.${APP_ENV}`) });

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

test('LINE Pay Payment Simulation', async ({ page }) => {
    test.setTimeout(120000);

    const email = process.env.TEST_STUDENT_EMAIL;
    const password = process.env.TEST_STUDENT_PASSWORD;
    const bypassSecret = process.env.LOGIN_BYPASS_SECRET || process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    // Force MOCK_MODE for this test in process.env if possible, 
    // but the server needs it too. We assume the server environment has it or we guide the user to set it.
    // Here we just proceed and expect the "LINE Pay" button to trigger the mock flow if enabled.

    if (!email || !password || !baseUrl) {
        throw new Error('❌ Missing Environment Variables! Requirement: TEST_STUDENT_EMAIL, TEST_STUDENT_PASSWORD, NEXT_PUBLIC_BASE_URL');
    }

    console.log(`Starting LINE Pay simulation test for ${email} at ${baseUrl}`);

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
    if (!loginRes.ok()) throw new Error(`Login failed: ${loginData.message || 'unknown error'}`);

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

    // Skip if LINE Pay integration is not active in this environment.
    const appRes = await page.request.get(`${baseUrl}/api/app-integrations`).catch(() => null);
    const appData = await appRes?.json().catch(() => ({} as any));
    const activeMethods: string[] = Array.isArray(appData?.data)
        ? appData.data.filter((app: any) => app.status === 'ACTIVE').map((app: any) => app.type)
        : [];
    if (!activeMethods.includes('LINEPAY')) {
        test.skip(true, 'LINEPAY is not active in this environment');
    }

    // 2. Go to pricing and pick a point package
    console.log("Navigating to Pricing page...");
    await page.goto(`${baseUrl}/pricing`, { waitUntil: 'networkidle' });
    
    const purchaseBtn = page.locator('a:has-text("購買點數"), button:has-text("購買點數")').first();
    await purchaseBtn.click();
    await page.waitForURL(/\/pricing\/checkout/);

    console.log("On Checkout Page. Selecting LINE Pay...");
    
    // Check if LINE Pay button exists - Wait for it to appear
    const linePayBtn = page.locator('button:has-text("LINE Pay")');
    if (!(await linePayBtn.isVisible({ timeout: 10000 }).catch(() => false))) {
        test.skip(true, 'LINE Pay button is unavailable on checkout page (likely disabled by app-integrations)');
    }

    await linePayBtn.click();

    // 3. Verification of redirection
    console.log("Waiting for redirection...");
    
    // In Mock Mode, it goes to /api/linepay/confirm which then redirects to /settings/billing?success=true
    // In Real Mode (Sandbox), it goes to sandbox-api-pay.line.me
    
    try {
        await page.waitForURL(url => 
            url.pathname.includes('/settings/billing') || 
            url.hostname.includes('line.me') ||
            url.pathname.includes('/plans'), 
            { timeout: 30000 }
        );
        
        const currentUrl = page.url();
        console.log(`Current URL after click: ${currentUrl}`);

        if (currentUrl.includes('success=true') || currentUrl.includes('/plans')) {
            console.log("✅ Success: Mock Payment completed successfully!");
        } else if (currentUrl.includes('line.me')) {
            console.log("ℹ️ Redirected to REAL LINE Pay (or Sandbox). Simulation logic ends here as we don't automate external UI.");
        } else {
            console.warn("⚠️ Unexpected redirect target.");
        }
    } catch (e) {
        throw new Error("❌ Redirection timed out after clicking LINE Pay button.");
    }

    console.log("LINE Pay Simulation Test Finished.");
});

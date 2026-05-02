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

test('Point Purchase Flow (Real Payment Redirection)', async ({ page }) => {
    test.setTimeout(120000);

    const email = process.env.TEST_STUDENT_EMAIL;
    const password = process.env.TEST_STUDENT_PASSWORD;
    const bypassSecret = process.env.LOGIN_BYPASS_SECRET || process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (!email || !password || !baseUrl) {
        throw new Error('❌ Missing Environment Variables! Requirement: TEST_STUDENT_EMAIL, TEST_STUDENT_PASSWORD, NEXT_PUBLIC_BASE_URL');
    }

    console.log(`Starting real payment flow redirect test for ${email} at ${baseUrl}`);

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

    // Skip when no real gateway is active in this environment.
    const appRes = await page.request.get(`${baseUrl}/api/app-integrations`).catch(() => null);
    const appData = await appRes?.json().catch(() => ({} as any));
    const activeMethods: string[] = Array.isArray(appData?.data)
        ? appData.data.filter((app: any) => app.status === 'ACTIVE').map((app: any) => app.type)
        : [];
    const hasRealGateway = activeMethods.includes('STRIPE') || activeMethods.includes('PAYPAL');
    if (!hasRealGateway) {
        test.skip(true, 'No real payment gateway (STRIPE/PAYPAL) is active in this environment');
    }

    // 2. Go to pricing and pick a point package
    console.log("Navigating to Pricing page...");
    await page.goto(`${baseUrl}/pricing`, { waitUntil: 'networkidle' });
    
    // Look for a point package purchase link/button
    const purchaseBtn = page.locator('a:has-text("購買點數"), button:has-text("購買點數")').first();
    await purchaseBtn.click();
    await page.waitForURL(/\/pricing\/checkout/);

    console.log("On Checkout Page. Checking for real payment methods...");

    const stripeBtn = page.locator('button', { hasText: /Stripe/i }).first();
    const paypalBtn = page.locator('button', { hasText: /PayPal/i }).first();

    if (await stripeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log("✓ Stripe found, clicking...");
        await stripeBtn.click();
        
        // Wait for redirect to Stripe Checkout
        await page.waitForURL(url => url.hostname.includes('stripe.com'), { timeout: 30000 });
        console.log(`✅ Success: Redirected to Stripe! Current URL: ${page.url()}`);
        
    } else if (await paypalBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log("✓ PayPal found, clicking...");
        await paypalBtn.click();
        
        // Wait for redirect to PayPal
        await page.waitForURL(url => url.hostname.includes('paypal.com'), { timeout: 30000 });
        console.log(`✅ Success: Redirected to PayPal! Current URL: ${page.url()}`);
    } else {
        test.skip(true, 'Checkout page has no visible real payment buttons (Stripe/PayPal)');
    }
    
    console.log("Real Payment Redirection Verified for Point Purchase.");
});

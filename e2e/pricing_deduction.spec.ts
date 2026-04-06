import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local explicitly
const envResult = dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const env = envResult.parsed || {};

// Read from .env.local via process.env fallback
const BASE_URL = env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const BYPASS_SECRET = env.LOGIN_BYPASS_SECRET || process.env.LOGIN_BYPASS_SECRET || 'your_bypass_secret';
const STUDENT_EMAIL = env.TEST_STUDENT_EMAIL || process.env.TEST_STUDENT_EMAIL || 'student@test.com';
const STUDENT_PASSWORD = env.TEST_STUDENT_PASSWORD || process.env.TEST_STUDENT_PASSWORD || 'password';
const ADMIN_EMAIL = env.ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@jvtutorcorner.com';
const ADMIN_PASSWORD = env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin_password';

test.describe('Pricing Deduction Logic Verification', () => {
  test('Verify points deduction when purchasing a package with app plan', async ({ page, request }) => {
    // 1. Fetch pricing settings to find a package with deduction
    const pricingRes = await request.get(`${BASE_URL}/api/admin/pricing`);
    const pricingData = await pricingRes.json();
    const settings = pricingData.settings;

    // Find an active point package that has a pre-purchase cost
    const targetPkg = settings.pointPackages?.find((p: any) => p.isActive && p.prePurchasePointsCost > 0);

    if (!targetPkg) {
      console.warn('No active point package with pre-purchase cost found. Skipping deduction verification.');
      return;
    }

    const pkgId = targetPkg.id;
    const pkgName = targetPkg.name;
    const pkgPoints = targetPkg.points || 0;
    const prePurchasePointsCost = targetPkg.prePurchasePointsCost || 0;
    const expectedFinalIncrease = Math.max(0, pkgPoints - prePurchasePointsCost);

    console.log(`Testing package: ${pkgName} (ID: ${pkgId})`);
    console.log(`Points: ${pkgPoints}, Pre-purchase cost: ${prePurchasePointsCost}`);
    console.log(`Expected increase: ${expectedFinalIncrease}`);

    // 2. Login
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', STUDENT_EMAIL);
    await page.fill('input[name="password"]', STUDENT_PASSWORD);
    await page.fill('#captcha', BYPASS_SECRET);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000); // Wait for login to settle

    // 3. Go to /pricing to see the package
    await page.goto(`${BASE_URL}/pricing`);

    await page.waitForSelector('h2:has-text("點數方案")');

    // Verify the UI shows the deduction
    const pkgCard = page.locator('.pricing-card', { hasText: pkgName });
    await expect(pkgCard).toBeVisible();

    // The UI logic is: 購買 {pkgPoints} 點後可用 {pkgPoints - prePurchasePointsCost} 點
    const expectedUIText = `購買 ${pkgPoints} 點後可用 ${expectedFinalIncrease} 點`;
    await expect(pkgCard).toContainText(expectedUIText);

    // 4. Record current points
    const pointsText = await page.locator('.text-2xl.font-bold.text-indigo-600').textContent();
    const initialPoints = parseInt(pointsText?.replace(/\D/g, '') || '0', 10);
    console.log(`Initial points: ${initialPoints}`);

    // 5. Purchase the package
    await pkgCard.locator('a:has-text("購買點數")').click();
    await page.waitForURL(/.*checkout.*/);

    // Verify checkout package name (it should match)
    await expect(page.locator('h2')).toContainText(pkgName);

    // Perform simulated payment
    await page.click('button:has-text("模擬支付")');

    // Wait for redirect back to /plans or check local state
    await page.waitForURL(/.*plans.*/, { timeout: 30000 });
    
    // Verify the record on /plans page
    console.log("On /plans page. Verifying record...");
    await page.click('button:has-text("點數購買紀錄")');
    await expect(page.locator('tr:has-text("已付款")').first()).toBeVisible();
    await expect(page.locator('tr:has-text("點數套餐")').first()).toBeVisible();
    await expect(page.locator(`tr:has-text("${pkgPoints}")`).first()).toBeVisible(); // The points total should match

    // 6. Go back to /pricing to check points balance
    await page.goto(`${BASE_URL}/pricing`);
    await page.waitForTimeout(2000); // Wait for points to update

    const finalPointsText = await page.locator('.text-2xl.font-bold.text-indigo-600').textContent();
    const finalPoints = parseInt(finalPointsText?.replace(/\D/g, '') || '0', 10);
    console.log(`Final points: ${finalPoints}`);

    // Expectation: initialPoints + (pkgPoints - prePurchasePointsCost) = finalPoints
    expect(finalPoints).toBe(initialPoints + expectedFinalIncrease);
  });
});

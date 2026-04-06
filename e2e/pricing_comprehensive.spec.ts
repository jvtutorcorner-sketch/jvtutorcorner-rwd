import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local explicitly
const envResult = dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const env = envResult.parsed || {};

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const BYPASS_SECRET = process.env.LOGIN_BYPASS_SECRET || process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

test.describe('Pricing Settings Comprehensive Verification', () => {
  test('Verify all sections on /settings/pricing are correctly saved and calculated', async ({ page }) => {
    test.setTimeout(60000); // 1 minute

    // Validation: Ensure environment variables are loaded
    console.log('DEBUG: Environment Check:');
    console.log(`- BASE_URL: ${BASE_URL}`);
    console.log(`- ADMIN_EMAIL: ${ADMIN_EMAIL ? 'PRESENT' : 'MISSING'}`);
    console.log(`- BYPASS_SECRET: ${BYPASS_SECRET ? `PRESENT (Length: ${BYPASS_SECRET.length})` : 'MISSING'}`);

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !BYPASS_SECRET) {
      const missing = [];
      if (!ADMIN_EMAIL) missing.push('ADMIN_EMAIL');
      if (!ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
      if (!BYPASS_SECRET) missing.push('BYPASS_SECRET');
      test.skip(true, `Missing required environment variables: ${missing.join(', ')}`);
      return;
    }
    
    // 1. Login as Admin
    console.log(`Logging in as Admin: ${ADMIN_EMAIL}`);
    await page.goto(`${BASE_URL}/login`);
    
    // Explicitly wait for the form to be ready
    await page.waitForSelector('input[name="email"]');
    
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.fill('#captcha', BYPASS_SECRET);
    
    // Click and wait for navigation
    await Promise.all([
      page.waitForURL(`${BASE_URL}/`, { timeout: 10000 }),
      page.click('button[type="submit"]')
    ]);
    
    console.log('Login successful, navigated to home.');
    await page.waitForTimeout(1000);

    // 2. Go to /settings/pricing
    await page.goto(`${BASE_URL}/settings/pricing`);
    await expect(page.locator('h1')).toContainText('方案與價格設定');

    // --- Section 1: App Plans ---
    await page.click('button:has-text("應用程式方案")');
    const appPlanName = `Test App ${Date.now()}`;
    await page.click('button:has-text("新增應用程式方案")');
    
    // Find the newly added app plan (last one)
    const appPlanCard = page.locator('.bg-white.rounded-2xl.p-5').last();
    await appPlanCard.locator('button:has-text("編輯內容")').click();
    await appPlanCard.locator('label:has-text("方案名稱") + input').fill(appPlanName);
    await appPlanCard.locator('label:has-text("點數成本") + input').fill('50');
    
    // Save
    await page.click('button:has-text("儲存變更")');
    await page.waitForSelector('text=已儲存');

    // Refresh and Verify
    await page.reload();
    await page.click('button:has-text("應用程式方案")'); // Wait a bit for it to stay or click if it didn't stay
    await expect(page.locator(`input[value="${appPlanName}"]`)).toBeVisible();
    
    // --- Section 2: Discount Plans ---
    await page.click('button:has-text("折扣方案")');
    const discountName = `Test Discount ${Date.now()}`;
    await page.click('button:has-text("新增折扣方案")');
    const discountCard = page.locator('.bg-white.rounded-2xl.p-5').last();
    await discountCard.locator('button:has-text("編輯內容")').click();
    await discountCard.locator('label:has-text("方案名稱") + input').fill(discountName);
    await discountCard.locator('label:has-text("折扣數值") + input').fill('20'); // 20%
    
    await page.click('button:has-text("儲存變更")');
    await page.waitForSelector('text=已儲存');
    await page.reload();
    await page.click('button:has-text("折扣方案")');
    await expect(page.locator(`input[value="${discountName}"]`)).toBeVisible();

    // --- Section 3: Point Packages ---
    await page.click('button:has-text("點數購買")');
    await page.click('button:has-text("新增套餐")');
    const pkgCard = page.locator('.bg-white.rounded-2xl.p-5').last();
    await pkgCard.locator('button:has-text("編輯內容")').click();
    
    // Fill values
    await pkgCard.locator('label:has-text("套餐名稱") + input').fill('Comp Test Pkg');
    await pkgCard.locator('label:has-text("點數數量") + input').fill('100');
    await pkgCard.locator('label:has-text("單位售價") + input').fill('10');
    
    // Select Manual Discount mode
    await pkgCard.locator('button:has-text("自定義金額")').click();
    await pkgCard.locator('label:has-text("手動折抵金額") + input').fill('100');
    
    // Initial Calc: 100 * 10 - 100 = 900
    await expect(pkgCard.locator('.text-green-700')).toContainText('900');

    // Select Discount Plan mode and then the actual plan
    await pkgCard.locator('button:has-text("選擇方案")').click();
    await pkgCard.locator('select').first().selectOption({ label: `${discountName} (20%)` });
    // Calc: 1000 * (1 - 0.2) = 800 (since manual discount is cleared when switching modes)
    await expect(pkgCard.locator('.text-green-700')).toContainText('800');

    // Select App Plan (direct checkbox selection now)
    await pkgCard.locator(`label:has-text("${appPlanName}")`).click();
    
    // Verify prePurchasePointsCost calc
    await expect(pkgCard.locator('text=需扣點數')).toBeVisible();
    await expect(pkgCard.locator('text=50')).toBeVisible();

    await page.click('button:has-text("儲存變更")');
    await page.waitForSelector('text=已儲存');
    await page.reload();
    await page.click('button:has-text("點數購買")');
    const savedPkg = page.locator('.bg-white.rounded-2xl.p-5', { hasText: 'Comp Test Pkg' });
    await expect(savedPkg).toBeVisible();
    await expect(savedPkg.locator('.text-green-700')).toContainText('800');

    // --- Section 4: Subscription Plans ---
    await page.click('button:has-text("訂閱方案")');
    await page.click('button:has-text("新增方案")');
    const subCard = page.locator('.bg-white.rounded-2xl.p-5').last();
    await subCard.locator('button:has-text("編輯內容")').click();
    await subCard.locator('label:has-text("方案標籤") + input').fill('Comp Test Sub');
    
    // Bind App Plan (direct checkbox selection)
    await subCard.locator(`label:has-text("${appPlanName}")`).click();
    await expect(subCard.locator(`label:has-text("${appPlanName}")`)).toHaveClass(/bg-violet/);

    await page.click('button:has-text("儲存變更")');
    await page.waitForSelector('text=已儲存');
    await page.reload();
    await expect(page.locator('input[value="Comp Test Sub"]')).toBeVisible();
    
    console.log('Comprehensive verification PASSED!');
  });
});

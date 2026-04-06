import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const BYPASS_SECRET = process.env.LOGIN_BYPASS_SECRET || process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ─── Helper: wait for save success notification ───────────────────────────────
// The success message uses class bg-emerald-50, appears briefly then disappears
// We wait for it to appear, not disappear
async function waitForSaveSuccess(page: any) {
  await page.waitForSelector('.bg-emerald-50', { timeout: 15000 });
  console.log('  ✓ Save success notification appeared');
}

// ─── Helper: switch tab and wait for content ──────────────────────────────────
async function switchToTab(page: any, tabText: string, contentHeading: string) {
  await page.click(`button:has-text("${tabText}")`);
  await page.waitForSelector(`h3:has-text("${contentHeading}")`, { timeout: 10000 });
  console.log(`  ✓ Switched to tab: ${tabText}`);
}

test.describe('Pricing Settings Comprehensive Verification', () => {
  test('Verify all sections on /settings/pricing are correctly saved and calculated', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes — headed mode is slower

    // ── 0. Env Check ─────────────────────────────────────────────────────────
    console.log('DEBUG: Environment Check:');
    console.log(`- BASE_URL: ${BASE_URL}`);
    console.log(`- ADMIN_EMAIL: ${ADMIN_EMAIL ? 'PRESENT' : 'MISSING'}`);
    console.log(`- BYPASS_SECRET: ${BYPASS_SECRET ? `PRESENT (Length: ${BYPASS_SECRET.length})` : 'MISSING'}`);

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !BYPASS_SECRET) {
      const missing = [];
      if (!ADMIN_EMAIL) missing.push('ADMIN_EMAIL');
      if (!ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
      if (!BYPASS_SECRET) missing.push('BYPASS_SECRET');
      test.skip(true, `Missing required env vars: ${missing.join(', ')}`);
      return;
    }

    // ── 1. Admin Login ────────────────────────────────────────────────────────
    console.log(`\n[Step 1] Logging in as Admin: ${ADMIN_EMAIL}`);
    await page.goto(`${BASE_URL}/login`);
    await page.waitForSelector('input[name="email"]', { timeout: 15000 });

    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.fill('#captcha', BYPASS_SECRET);

    await Promise.all([
      page.waitForURL(`${BASE_URL}/`, { timeout: 20000 }),
      page.click('button[type="submit"]')
    ]);
    console.log('  ✓ Login successful');
    await page.waitForTimeout(1000);

    // ── 2. Navigate to /settings/pricing ─────────────────────────────────────
    console.log('\n[Step 2] Navigate to /settings/pricing');
    await page.goto(`${BASE_URL}/settings/pricing`);
    await expect(page.locator('h1')).toContainText('方案與價格設定');
    console.log('  ✓ Page loaded');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 1: App Plans
    // New plans auto-enter edit mode (setEditingPlanId is called in addAppPlan)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n[Section 1] Testing App Plans...');
    await switchToTab(page, '應用程式方案', '應用程式方案管理');

    const appPlanName = `Test App ${Date.now()}`;
    await page.click('button:has-text("新增應用程式方案")');
    await page.waitForTimeout(500); // wait for react state update

    // Newly added card is last and ALREADY in edit mode
    const appPlanCard = page.locator('.bg-white.rounded-2xl.p-5').last();
    await expect(appPlanCard.locator('button:has-text("完成編輯")')).toBeVisible({ timeout: 5000 });

    // Label: 方案名稱 (exact text from page.tsx line ~1828)
    await appPlanCard.locator('label:has-text("方案名稱") + input').fill(appPlanName);
    // Label: 需消耗點數 (Points Cost) (exact text from page.tsx line ~1850)
    await appPlanCard.locator('label:has-text("需消耗點數") + input').fill('50');

    await page.click('button:has-text("儲存變更")');
    await waitForSaveSuccess(page);

    // Reload & verify persistence
    await page.reload();
    await switchToTab(page, '應用程式方案', '應用程式方案管理');
    await expect(page.locator(`input[value="${appPlanName}"]`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[value="50"]').first()).toBeVisible();
    console.log(`  ✓ App Plan "${appPlanName}" verified after reload`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 2: Discount Plans
    // New plans do NOT auto-enter edit mode (no setEditingPlanId in addDiscountPlan)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n[Section 2] Testing Discount Plans...');
    await switchToTab(page, '折扣方案', '折扣方案管理');

    const discountName = `Test Discount ${Date.now()}`;
    await page.click('button:has-text("新增折扣方案")');
    await page.waitForTimeout(500);

    // Must click "編輯內容" because addDiscountPlan does NOT call setEditingPlanId
    const discountCard = page.locator('.bg-white.rounded-2xl.p-5').last();
    await discountCard.locator('button:has-text("編輯內容")').click();
    await expect(discountCard.locator('button:has-text("完成編輯")')).toBeVisible({ timeout: 5000 });

    // Label: 方案名稱 (line ~1657 in page.tsx)
    await discountCard.locator('label:has-text("方案名稱") + input').fill(discountName);
    // Label: 折扣數值 (line ~1677 in page.tsx)
    await discountCard.locator('label:has-text("折扣數值") + input').fill('20'); // 20%

    await page.click('button:has-text("儲存變更")');
    await waitForSaveSuccess(page);

    await page.reload();
    await switchToTab(page, '折扣方案', '折扣方案管理');
    await expect(page.locator(`input[value="${discountName}"]`)).toBeVisible({ timeout: 10000 });
    console.log(`  ✓ Discount Plan "${discountName}" verified after reload`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 3: Point Packages
    // New packages do NOT auto-enter edit mode (no setEditingPlanId in addPointPackage)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n[Section 3] Testing Point Packages...');
    await switchToTab(page, '點數購買', '點數套餐管理');

    const pkgName = `Comp Test Pkg ${Date.now()}`;
    await page.click('button:has-text("新增套餐")');
    await page.waitForTimeout(500);

    // Must click "編輯內容" (addPointPackage does NOT call setEditingPlanId)
    const pkgCard = page.locator('.bg-white.rounded-2xl.p-5').last();
    await pkgCard.locator('button:has-text("編輯內容")').click();
    await expect(pkgCard.locator('button:has-text("完成編輯")')).toBeVisible({ timeout: 5000 });

    // Label: 套餐名稱 (exact from page.tsx)
    await pkgCard.locator('label:has-text("套餐名稱") + input').fill(pkgName);
    // Label: 點數數量 (Quantity) — spinbutton, use fill
    await pkgCard.locator('label:has-text("點數數量") + input').fill('100');
    // Label: 點數單位售價 (Unit Price) — spinbutton
    await pkgCard.locator('label:has-text("點數單位售價") + input').fill('10');
    await page.waitForTimeout(300); // let price recalculate: 100*10 = 1000

    // Apply: Manual Discount → 100 off (1000 - 100 = 900)
    await pkgCard.locator('button:has-text("自定義金額")').click();
    await page.waitForTimeout(200);
    await pkgCard.locator('label:has-text("手動折抵金額") + input').fill('100');
    await page.waitForTimeout(300);
    await expect(pkgCard.locator('.text-green-700')).toContainText('900', { timeout: 5000 });
    console.log('  ✓ Manual discount calc: 1000 - 100 = 900');

    // Apply: Switch to Discount Plan mode (mutual exclusion: manual discount cleared)
    await pkgCard.locator('button:has-text("選擇方案")').click();
    await page.waitForTimeout(200);
    // select by discount name option (format: "NAME (VALUE%)")
    await pkgCard.locator('select').first().selectOption({ label: `${discountName} (20%)` });
    await page.waitForTimeout(300); // 1000 * 0.8 = 800
    await expect(pkgCard.locator('.text-green-700')).toContainText('800', { timeout: 5000 });
    console.log('  ✓ Discount plan calc: 1000 * (1-0.2) = 800');

    // Bind App Plan checkbox (app plan labels show: name + date range)
    // Use partial text match since label includes date
    const appPlanLabel = pkgCard.locator('label').filter({ hasText: appPlanName });
    await appPlanLabel.click();
    await page.waitForTimeout(300);

    // Verify prePurchasePointsCost = 50 (from App Plan's pointsCost)
    await expect(pkgCard.locator('text=購買前需扣點數：')).toBeVisible({ timeout: 5000 });
    const costSpan = pkgCard.locator('text=購買前需扣點數：').locator('..').locator('span, div').last();
    await expect(costSpan).toContainText('50', { timeout: 5000 });
    console.log('  ✓ prePurchasePointsCost = 50 verified');

    await page.click('button:has-text("儲存變更")');
    await waitForSaveSuccess(page);

    await page.reload();
    await switchToTab(page, '點數購買', '點數套餐管理');
    // Find the saved package by its name input, scroll into view first
    const savedPkgInput = page.locator(`input[value="${pkgName}"]`);
    await expect(savedPkgInput).toBeVisible({ timeout: 10000 });
    console.log(`  ✓ Point Package "${pkgName}" verified after reload`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 4: Subscription Plans
    // New plans DO auto-enter edit mode (addSubscription calls setEditingPlanId)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n[Section 4] Testing Subscription Plans...');
    await switchToTab(page, '訂閱方案', '訂閱方案管理');

    const subName = `Comp Test Sub ${Date.now()}`;
    await page.click('button:has-text("新增方案")');
    await page.waitForTimeout(500);

    // Newly added plan card IS automatically in edit mode
    const subCard = page.locator('.bg-white.rounded-2xl.p-5').last();
    await expect(subCard.locator('button:has-text("完成編輯")')).toBeVisible({ timeout: 5000 });

    // Label: 方案標籤 (Label) — exact text from page.tsx line ~995
    await subCard.locator('label:has-text("方案標籤") + input').fill(subName);
    await page.waitForTimeout(200);

    // Bind App Plan
    const subAppPlanLabel = subCard.locator('label').filter({ hasText: appPlanName });
    await subAppPlanLabel.click();
    await page.waitForTimeout(300);
    await expect(subAppPlanLabel).toHaveClass(/bg-violet/, { timeout: 5000 });
    console.log(`  ✓ App Plan "${appPlanName}" bound to subscription`);

    await page.click('button:has-text("儲存變更")');
    await waitForSaveSuccess(page);

    await page.reload();
    // After reload, mode resets to default ('subscription'), so the subscription tab is already active
    await page.waitForSelector('h3:has-text("訂閱方案管理")', { timeout: 10000 });
    await expect(page.locator(`input[value="${subName}"]`)).toBeVisible({ timeout: 10000 });
    console.log(`  ✓ Subscription Plan "${subName}" verified after reload`);

    console.log('\n✅ Comprehensive verification PASSED!');
  });
});

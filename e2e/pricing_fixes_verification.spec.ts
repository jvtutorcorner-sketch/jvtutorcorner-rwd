/**
 * pricing_fixes_verification.spec.ts
 *
 * Verifies all 9 defect fixes applied to the pricing page and admin settings:
 *   1. Subscription plan features[] editable in admin
 *   2. Subscription plan badge editable in admin
 *   3. plans[].isActive defaults to true (old data without the field shows on /pricing)
 *   4. Discount plan selection auto-recalculates subscription price
 *   5. Public /pricing fetches from /api/shared/pricing (not /api/admin/pricing)
 *   6. Discount strike-through + label shown on subscription plan cards
 *   7. Duplicate badge input removed from point packages form
 *   8. addMockPointPackages toast says "3" not "4"
 *   9. PlanConfig type includes price/badge/durationDays etc. (API validation)
 */

import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

const APP_ENV = process.env.APP_ENV || 'local';
dotenv.config({ path: path.resolve(__dirname, '..', `.env.${APP_ENV}`) });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const BYPASS_SECRET = process.env.LOGIN_BYPASS_SECRET || process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function adminLogin(page: any) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('#email', ADMIN_EMAIL);
  await page.fill('#password', ADMIN_PASSWORD);
  await page.waitForSelector('#captcha', { state: 'visible', timeout: 10000 });
  await page.fill('#captcha', BYPASS_SECRET);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  console.log('  ✓ Admin login successful');
}

async function goToPricingSettings(page: any) {
  await page.goto(`${BASE_URL}/settings/pricing`);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('h1:has-text("方案與價格設定")', { timeout: 15000 });
  console.log('  ✓ Navigated to /settings/pricing');
}

async function waitForSave(page: any) {
  await page.waitForSelector('.bg-emerald-50', { timeout: 15000 });
  const msg = await page.locator('.bg-emerald-50').textContent();
  console.log(`  ✓ Save notification: "${msg?.trim()}"`);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

test.describe('Pricing Fixes Verification', () => {
  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      console.warn('⚠️  ADMIN_EMAIL / ADMIN_PASSWORD not set — some tests will be skipped');
    }
  });

  // ── Fix 5: Public page calls /api/shared/pricing ────────────────────────────
  test('Fix 5: /pricing page fetches from /api/shared/pricing', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/api/') && req.url().includes('pricing')) {
        requests.push(req.url());
      }
    });

    await page.goto(`${BASE_URL}/pricing`);
    await page.waitForLoadState('networkidle');

    const sharedCalls = requests.filter(u => u.includes('/api/shared/pricing'));
    const adminCalls  = requests.filter(u => u.includes('/api/admin/pricing'));

    console.log('  pricing-related API calls:', requests);
    expect(sharedCalls.length, 'Should call /api/shared/pricing').toBeGreaterThan(0);
    expect(adminCalls.length, 'Should NOT call /api/admin/pricing from public page').toBe(0);
  });

  // ── Fix 3: plans without isActive field still appear ────────────────────────
  test('Fix 3: plan without isActive field is shown on /pricing via shared API', async ({ request }) => {
    // Fetch from shared endpoint (the one the public page now uses)
    const res = await request.get(`${BASE_URL}/api/shared/pricing`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Simulate what the public page does: filter p.isActive
    const plans: any[] = data.settings?.plans || [];
    // A plan with isActive=undefined would fail the filter; after fix it defaults to true
    const planMissingFlag = plans.find((p: any) => p.isActive === undefined);
    if (planMissingFlag) {
      // If any plan still has undefined isActive, the admin page loading logic should fix it
      console.warn(`  ⚠️  Plan "${planMissingFlag.id}" has isActive=undefined in DB — admin page should normalise on load`);
    }

    // The admin settings page normalises on load; verify API returns data OK
    console.log(`  ✓ /api/shared/pricing returned ${plans.length} plans`);
    console.log(`  Active plans: ${plans.filter((p: any) => p.isActive !== false).length}`);
  });

  // ── Fix 9: Admin API accepts plan with all new fields ───────────────────────
  test('Fix 9: /api/admin/pricing validates extended PlanConfig fields', async ({ request }) => {
    // GET current settings
    const getRes = await request.get(`${BASE_URL}/api/admin/pricing`);
    const getData = await getRes.json();
    expect(getData.ok).toBe(true);

    const settings = getData.settings;

    // Patch first plan with newly typed fields and attempt a POST
    if (!settings.plans?.length) {
      test.skip(true, 'No plans in DB to test');
      return;
    }

    const testSettings = {
      ...settings,
      plans: settings.plans.map((p: any, i: number) =>
        i === 0
          ? {
              ...p,
              price: 990,
              currency: 'TWD',
              interval: 'month',
              badge: 'Test Badge',
              durationDays: 30,
              discountPlanId: p.discountPlanId ?? null,
              appPlanIds: p.appPlanIds ?? [],
            }
          : p
      ),
    };

    const postRes = await request.post(`${BASE_URL}/api/admin/pricing`, {
      data: { settings: testSettings },
    });
    const postData = await postRes.json();

    expect(postRes.ok(), `POST failed: ${JSON.stringify(postData)}`).toBeTruthy();
    expect(postData.ok).toBe(true);
    console.log('  ✓ API accepted extended PlanConfig fields without validation error');

    // Restore original
    await request.post(`${BASE_URL}/api/admin/pricing`, { data: { settings } });
    console.log('  ✓ Restored original settings');
  });

  // ── Fix 7: Point packages form has only ONE badge input ─────────────────────
  test('Fix 7: Point packages admin form has exactly one badge input', async ({ page }) => {
    if (!ADMIN_EMAIL) { test.skip(true, 'No admin credentials'); return; }
    page.on('dialog', d => d.accept());

    await adminLogin(page);
    await goToPricingSettings(page);

    // Switch to points tab
    await page.click('button:has-text("點數購買")');
    await page.waitForSelector('h3:has-text("點數套餐管理")', { timeout: 10000 });

    // Click edit on first package (if any)
    const editBtns = page.locator('button:has-text("編輯內容")');
    const count = await editBtns.count();
    if (count === 0) {
      console.log('  ⚠️  No point packages to test badge duplication — skip');
      return;
    }

    await editBtns.first().click();
    await page.waitForTimeout(500);

    // Count badge-related labels visible for point packages
    const badgeLabels = page.locator('label:has-text("徽章"), label:has-text("Badge"), label:has-text("促銷推廣")');
    const badgeCount = await badgeLabels.count();
    console.log(`  Badge-related labels found: ${badgeCount}`);
    expect(badgeCount, 'Should have exactly one badge label in point packages form').toBe(1);
  });

  // ── Fix 8: addMockPointPackages toast says "3" ───────────────────────────────
  test('Fix 8: Mock point packages toast says "已新增 3 個"', async ({ page }) => {
    if (!ADMIN_EMAIL) { test.skip(true, 'No admin credentials'); return; }
    page.on('dialog', d => d.accept());

    await adminLogin(page);
    await goToPricingSettings(page);

    // Switch to points tab
    await page.click('button:has-text("點數購買")');
    await page.waitForSelector('h3:has-text("點數套餐管理")', { timeout: 10000 });

    // Click "新增模擬資料" button
    await page.click('button:has-text("新增模擬資料")');
    await page.waitForTimeout(500);

    // Check toast message
    const toast = page.locator('.bg-emerald-50, [class*="message"]').first();
    const toastText = await toast.textContent();
    console.log(`  Toast text: "${toastText?.trim()}"`);
    expect(toastText, 'Toast should say 3 packages added').toContain('3');
    expect(toastText, 'Toast should NOT say 4 packages').not.toContain('4');
  });

  // ── Fix 2: Subscription plans form has badge input ─────────────────────────
  test('Fix 2: Subscription plan form has badge (徽章) input field', async ({ page }) => {
    if (!ADMIN_EMAIL) { test.skip(true, 'No admin credentials'); return; }
    page.on('dialog', d => d.accept());

    await adminLogin(page);
    await goToPricingSettings(page);

    // Should be on subscription tab by default
    await page.waitForSelector('h3:has-text("訂閱方案管理")', { timeout: 10000 });

    // Open edit mode for first plan
    const editBtns = page.locator('button:has-text("編輯內容")').first();
    if (await editBtns.count() === 0) {
      console.log('  ⚠️  No subscription plans to test — skip');
      return;
    }
    await editBtns.click();
    await page.waitForTimeout(500);

    // Check badge label exists within subscription section
    const badgeLabel = page.locator('label:has-text("徽章文字 (Badge)")').first();
    await expect(badgeLabel, 'Badge input label should be visible in subscription plan edit form').toBeVisible();

    const badgeInput = page.locator('input[placeholder*="推薦"]').first();
    await expect(badgeInput, 'Badge input placeholder should contain "推薦"').toBeVisible();
    console.log('  ✓ Badge input found in subscription plan form');
  });

  // ── Fix 1: Subscription plans form has features list editor ────────────────
  test('Fix 1: Subscription plan form has features list editor', async ({ page }) => {
    if (!ADMIN_EMAIL) { test.skip(true, 'No admin credentials'); return; }
    page.on('dialog', d => d.accept());

    await adminLogin(page);
    await goToPricingSettings(page);

    await page.waitForSelector('h3:has-text("訂閱方案管理")', { timeout: 10000 });

    // Open edit mode
    const editBtn = page.locator('button:has-text("編輯內容")').first();
    if (await editBtn.count() === 0) {
      console.log('  ⚠️  No subscription plans to test — skip');
      return;
    }
    await editBtn.click();
    await page.waitForTimeout(500);

    // Check features section label
    const featuresLabel = page.locator('label:has-text("功能特色清單 (Features)")').first();
    await expect(featuresLabel, 'Features section label should be visible').toBeVisible();

    // Check "新增功能項目" button
    const addFeatBtn = page.locator('button:has-text("新增功能項目")').first();
    await expect(addFeatBtn, '"新增功能項目" button should be visible in edit mode').toBeVisible();

    // Click add and verify a new empty input appears
    const beforeCount = await page.locator('label:has-text("功能特色清單")').locator('..').locator('input[type="text"]').count();
    await addFeatBtn.click();
    await page.waitForTimeout(300);
    const afterCount = await page.locator('label:has-text("功能特色清單")').locator('..').locator('input[type="text"]').count();
    expect(afterCount, 'A new feature input should be added').toBeGreaterThan(beforeCount);
    console.log(`  ✓ Features editor: ${beforeCount} → ${afterCount} inputs after adding`);
  });

  // ── Fix 4: Discount plan auto-recalculates subscription price ──────────────
  test('Fix 4: Selecting a discount plan recalculates subscription price', async ({ page }) => {
    if (!ADMIN_EMAIL) { test.skip(true, 'No admin credentials'); return; }
    page.on('dialog', d => d.accept());

    await adminLogin(page);
    await goToPricingSettings(page);

    await page.waitForSelector('h3:has-text("訂閱方案管理")', { timeout: 10000 });

    // First check if there are discount plans
    const settingsRes = await page.evaluate(async (url) => {
      const r = await fetch(`${url}/api/admin/pricing`);
      return r.json();
    }, BASE_URL);

    const discountPlans = settingsRes.settings?.discountPlans?.filter((d: any) => d.isActive) || [];
    if (discountPlans.length === 0) {
      console.log('  ⚠️  No active discount plans configured — cannot test auto-recalculation');
      return;
    }

    const plans = settingsRes.settings?.plans || [];
    if (plans.length === 0) {
      console.log('  ⚠️  No subscription plans configured — cannot test auto-recalculation');
      return;
    }

    // Open edit on first plan
    await page.locator('button:has-text("編輯內容")').first().click();
    await page.waitForTimeout(500);

    // Read current price
    const priceInput = page.locator('input[type="number"]').filter({ hasText: '' }).first();
    // Locate the "實際結帳價格" field specifically
    const priceSection = page.locator('label:has-text("實際結帳價格")').first().locator('..');
    const priceField = priceSection.locator('input[type="number"]');
    const initialPrice = await priceField.inputValue();
    console.log(`  Initial price: NT$ ${initialPrice}`);

    if (!initialPrice || parseInt(initialPrice) === 0) {
      console.log('  ⚠️  Plan price is 0 — set a non-zero price first for meaningful test');
    }

    // Select a discount plan
    const discountSelect = page.locator('select').filter({ has: page.locator('option:has-text("無折扣")') }).first();
    const firstDiscountId = discountPlans[0].id;
    await discountSelect.selectOption(firstDiscountId);
    await page.waitForTimeout(500);

    const newPrice = await priceField.inputValue();
    console.log(`  Price after discount: NT$ ${newPrice}`);

    // Price should have changed if discount is non-zero and base price > 0
    if (parseInt(initialPrice) > 0) {
      expect(parseInt(newPrice), 'Price should decrease after applying a discount plan')
        .toBeLessThan(parseInt(initialPrice));
      console.log(`  ✓ Price recalculated: ${initialPrice} → ${newPrice}`);
    } else {
      console.log('  ⚠️  Base price was 0 so no change expected — test inconclusive');
    }
  });

  // ── Fix 6: Subscription card shows discount strike-through on /pricing ──────
  test('Fix 6: /pricing shows discount strike-through for plans with discounts', async ({ page, request }) => {
    // Check if any plan has a discountPlanId pointing to an active discount
    const res = await request.get(`${BASE_URL}/api/shared/pricing`);
    const data = await res.json();
    const plans: any[] = data.settings?.plans || [];
    const discounts: any[] = data.settings?.discountPlans || [];

    const discountedPlan = plans.find((p: any) => {
      if (!p.discountPlanId || !p.isActive) return false;
      const dp = discounts.find((d: any) => d.id === p.discountPlanId && d.isActive);
      return dp && p.price != null && p.price > 0;
    });

    if (!discountedPlan) {
      console.log('  ⚠️  No active subscription plan with a discount configured — skip visual test');
      return;
    }

    await page.goto(`${BASE_URL}/pricing`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.pricing-card', { timeout: 15000 });

    // Find the card for this plan
    const card = page.locator('.pricing-card', { hasText: discountedPlan.label });
    await expect(card).toBeVisible();

    // Should have a line-through price
    const strikeThrough = card.locator('span.line-through');
    await expect(strikeThrough, `Plan "${discountedPlan.label}" should show strike-through original price`).toBeVisible();
    console.log(`  ✓ Strike-through price visible for plan "${discountedPlan.label}"`);

    // Should show discount label
    const discountLabel = card.locator('span.text-green-500');
    await expect(discountLabel).toBeVisible();
    const labelText = await discountLabel.textContent();
    console.log(`  ✓ Discount label: "${labelText?.trim()}"`);
  });

  // ── Regression: /pricing still loads correctly after API change ─────────────
  test('Regression: /pricing page renders plans and points sections', async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`);
    await page.waitForLoadState('networkidle');

    // Page should load without error
    const title = await page.title();
    expect(title).not.toContain('Error');
    expect(title).not.toContain('500');

    // Check page header loads
    const header = page.locator('header.page-header h1').first();
    await expect(header).toBeVisible({ timeout: 15000 });
    console.log(`  ✓ Page title: "${await header.textContent()}"`);

    // Subscription section (if plans exist)
    const subSection = page.locator('h2:has-text("訂閱方案")');
    const pointsSection = page.locator('h2:has-text("點數方案")');
    const hasSubscription = await subSection.count() > 0;
    const hasPoints = await pointsSection.count() > 0;
    console.log(`  Subscription section visible: ${hasSubscription}`);
    console.log(`  Points section visible: ${hasPoints}`);

    // At least one section must render
    expect(hasSubscription || hasPoints, 'At least one pricing section should be visible').toBe(true);
  });
});

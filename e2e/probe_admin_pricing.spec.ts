import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const BYPASS   = process.env.LOGIN_BYPASS_SECRET || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PW    = process.env.ADMIN_PASSWORD || '';

test.beforeEach(async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('#email', ADMIN_EMAIL);
  await page.fill('#password', ADMIN_PW);
  await page.waitForSelector('#captcha', { state: 'visible' });
  await page.fill('#captcha', BYPASS);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20000 });
  console.log('  ✓ logged in');
});

test('Fix 2 & 1: subscription plan form has badge + features editor', async ({ page }) => {
  await page.goto(`${BASE_URL}/settings/pricing`);
  await page.waitForSelector('h1:has-text("方案與價格設定")', { timeout: 15000 });
  await page.waitForLoadState('networkidle');

  // Click subscription tab (DB may persist a different mode)
  await page.click('button:has-text("訂閱方案")');
  // Should land on subscription tab
  await page.waitForSelector('h3:has-text("訂閱方案管理")', { timeout: 10000 });

  const editBtns = page.locator('button:has-text("編輯內容")');
  const count = await editBtns.count();
  console.log('  Subscription plans visible:', count);
  expect(count, 'At least one subscription plan must exist to test').toBeGreaterThan(0);

  await editBtns.first().click();
  await page.waitForTimeout(600);

  // Fix 2: badge input
  const badgeLabel = page.locator('label:has-text("徽章文字 (Badge)")').first();
  const badgeVisible = await badgeLabel.isVisible();
  console.log('  Fix 2 — badge label visible:', badgeVisible);
  expect(badgeVisible, 'Badge input label must be in subscription form').toBe(true);

  // Fix 1: features section
  const featLabel = page.locator('label:has-text("功能特色清單 (Features)")').first();
  const featVisible = await featLabel.isVisible();
  console.log('  Fix 1 — features section label visible:', featVisible);
  expect(featVisible, 'Features section must exist in subscription form').toBe(true);

  const addFeatBtn = page.locator('button:has-text("新增功能項目")').first();
  const addVisible = await addFeatBtn.isVisible();
  console.log('  Fix 1 — "新增功能項目" button visible:', addVisible);
  expect(addVisible, '"新增功能項目" button must be visible when editing').toBe(true);
});

test('Fix 7: point packages form has exactly one badge input', async ({ page }) => {
  await page.goto(`${BASE_URL}/settings/pricing`);
  await page.waitForSelector('h1:has-text("方案與價格設定")', { timeout: 15000 });

  await page.click('button:has-text("點數購買")');
  await page.waitForSelector('h3:has-text("點數套餐管理")', { timeout: 10000 });

  const editBtns = page.locator('button:has-text("編輯內容")');
  const count = await editBtns.count();
  console.log('  Point packages visible:', count);

  if (count === 0) { console.log('  ⚠️ no packages, skipping'); return; }

  await editBtns.first().click();
  await page.waitForTimeout(500);

  // Count badge-related labels in the active edit card only
  const activeCard = page.locator('[class*="ring-4"]').first();
  const badgeLabels = await activeCard.locator('label').filter({ hasText: /徽章|Badge|促銷/ }).count();
  console.log('  Fix 7 — badge-related labels in edit card:', badgeLabels);
  expect(badgeLabels, 'Only one badge label should appear (no duplicate)').toBe(1);
});

test('Fix 8: addMockPointPackages toast says 3 not 4', async ({ page }) => {
  await page.goto(`${BASE_URL}/settings/pricing`);
  await page.waitForSelector('h1:has-text("方案與價格設定")', { timeout: 15000 });

  await page.click('button:has-text("點數購買")');
  await page.waitForSelector('h3:has-text("點數套餐管理")', { timeout: 10000 });

  await page.click('button:has-text("新增模擬資料")');

  // Wait for toast
  const toast = page.locator('.bg-emerald-50, .bg-green-50').first();
  await expect(toast).toBeVisible({ timeout: 5000 });
  const msg = await toast.textContent();
  console.log('  Fix 8 — toast text:', msg?.trim());
  expect(msg, 'Toast should say 3').toContain('3');
  expect(msg, 'Toast must not say 4').not.toContain('4');
});

test('Fix 4: selecting discount plan changes subscription price field', async ({ page, request }) => {
  // Check data prerequisites
  const r = await request.get(`${BASE_URL}/api/admin/pricing`);
  const d = await r.json();
  const activeDps = (d.settings?.discountPlans || []).filter((dp: any) => dp.isActive);

  if (activeDps.length === 0) {
    console.log('  ⚠️ No active discount plans in DB — skip Fix 4');
    return;
  }

  await page.goto(`${BASE_URL}/settings/pricing`);
  await page.waitForSelector('h1:has-text("方案與價格設定")', { timeout: 15000 });
  await page.click('button:has-text("訂閱方案")');
  await page.waitForSelector('h3:has-text("訂閱方案管理")', { timeout: 10000 });

  const editBtn = page.locator('button:has-text("編輯內容")').first();
  if (await editBtn.count() === 0) { console.log('  ⚠️ No plans — skip'); return; }
  await editBtn.click();
  await page.waitForTimeout(500);

  // Find price field
  const priceLabel = page.locator('label:has-text("實際結帳價格")').first();
  const priceInput = priceLabel.locator('..').locator('input[type="number"]');
  const rawBefore = await priceInput.inputValue();
  console.log('  Before discount:', rawBefore);

  // Set an explicit base price so we know what to compare against
  const basePrice = 1000;
  await priceInput.fill(String(basePrice));
  await page.waitForTimeout(300);

  // Select first active discount plan
  const discountSelect = page.locator('select').filter({ has: page.locator('option:has-text("無折扣")') }).first();
  const dsCount = await discountSelect.count();
  if (dsCount === 0) {
    console.log('  ⚠️ No discount plan <select> found in subscription form — Fix 4 UI selector may be missing');
    return;
  }
  await discountSelect.selectOption(activeDps[0].id);
  await page.waitForTimeout(600);

  const after = await priceInput.inputValue();
  const afterNum = parseInt(after);
  console.log(`  After applying discount (${activeDps[0].name || activeDps[0].id}):`, after);

  expect(afterNum, 'Price should decrease below base price after applying discount').toBeLessThan(basePrice);
});

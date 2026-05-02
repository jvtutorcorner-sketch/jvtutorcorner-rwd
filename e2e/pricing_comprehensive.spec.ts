import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local explicitly
const APP_ENV = process.env.APP_ENV || 'local';
dotenv.config({ path: path.resolve(__dirname, '..', `.env.${APP_ENV}`) });

function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  throw new Error(`Missing required environment variable(s): ${keys.join(', ')}`);
}

// Read from process.env or .env.local
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const BYPASS_SECRET = requireEnv('LOGIN_BYPASS_SECRET', 'NEXT_PUBLIC_LOGIN_BYPASS_SECRET', 'QA_CAPTCHA_BYPASS');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ─── Helper: Auto-login功能 (Based on auto-login skill) ───────────────────────
async function performAdminLogin(page: any, baseUrl: string, email: string, password: string, bypassSecret: string) {
  console.log(`\n🔐 [Login] Logging in as: ${email}`);
  
  await page.goto(`${baseUrl}/login`);
  await page.waitForLoadState('networkidle');
  console.log('  ✓ Login page loaded');

  // Fill in login form using ID selectors (matches other test implementations)
  await page.fill('#email', email);
  console.log(`  ✓ Filled email: ${email}`);
  
  await page.fill('#password', password);
  console.log('  ✓ Filled password');
  
  // Wait for captcha field
  await page.waitForSelector('#captcha', { state: 'visible', timeout: 10000 });
  
  // Fill captcha with bypass secret
  await page.fill('#captcha', bypassSecret);
  console.log(`  ✓ Filled captcha bypass secret`);

  // Submit form and wait for navigation away from login page
  await page.click('button[type="submit"]');
  console.log('  ✓ Clicked submit button');

  // Wait for URL to change away from login
  try {
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30000 });
    console.log('  ✓ Successfully navigated away from login page');
  } catch (e: any) {
    throw new Error(`Failed to navigate away from login. Current URL: ${page.url()}`);
  }

  await page.waitForTimeout(1000);
  await page.waitForLoadState('networkidle').catch(() => {});
  console.log('✅ Login successful\n');
}

// ─── Helper: wait for save success notification ───────────────────────────────
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
    test.setTimeout(180000); // 3 minutes

    // ── 0. Env Check ─────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════');
    console.log('  DEBUG: Environment Check');
    console.log('═══════════════════════════════════════════');
    console.log(`- BASE_URL: ${BASE_URL}`);
    console.log(`- ADMIN_EMAIL: ${ADMIN_EMAIL ? 'PRESENT' : 'MISSING'}`);
    console.log(`- ADMIN_PASSWORD: ${ADMIN_PASSWORD ? 'PRESENT' : 'MISSING'}`);
    console.log(`- BYPASS_SECRET: ${BYPASS_SECRET ? `PRESENT (Length: ${BYPASS_SECRET.length})` : 'MISSING'}`);

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      test.skip(true, 'Missing required environment variables: ADMIN_EMAIL or ADMIN_PASSWORD');
      return;
    }

    // Register dialog handler to accept all confirmations
    page.on('dialog', dialog => dialog.accept());

    // ── 1. Admin Login (using auto-login skill pattern) ──────────────────────
    try {
      await performAdminLogin(page, BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, BYPASS_SECRET);
    } catch (e: any) {
      console.error(`❌ Login failed: ${e.message}`);
      throw e;
    }

    // ── 2. Navigate to /settings/pricing ─────────────────────────────────────
    console.log('[Step 2] Navigate to /settings/pricing');
    await page.goto(`${BASE_URL}/settings/pricing`);
    await expect(page.locator('h1')).toContainText('方案與價格設定');
    console.log('  ✓ Page loaded');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 1: App Plans
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n[Section 1] Testing App Plans...');
    await switchToTab(page, '應用程式方案', '應用程式方案管理');

    const appPlanName = `Comp Test App ${Date.now()}`;
    await page.click('button:has-text("新增應用程式方案")');
    await page.waitForTimeout(500); 

    const appPlanCard = page.locator('.bg-white.rounded-2xl.p-5').last();
    await appPlanCard.locator('label:has-text("方案名稱") + input').fill(appPlanName);
    await appPlanCard.locator('label:has-text("需消耗點數") + input').fill('50');

    await page.click('button:has-text("儲存變更")');
    await waitForSaveSuccess(page);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 2: Discount Plans
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n[Section 2] Testing Discount Plans...');
    await switchToTab(page, '折扣方案', '折扣方案管理');

    const discountName = `Comp Test Discount ${Date.now()}`;
    await page.click('button:has-text("新增折扣方案")');
    await page.waitForTimeout(500);

    const discountCard = page.locator('.bg-white.rounded-2xl.p-5').last();
    await discountCard.locator('button:has-text("編輯內容")').click();
    await discountCard.locator('label:has-text("方案名稱") + input').fill(discountName);
    await discountCard.locator('label:has-text("折扣數值") + input').fill('20'); 

    await page.click('button:has-text("儲存變更")');
    await waitForSaveSuccess(page);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 3: Point Packages
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n[Section 3] Testing Point Packages...');
    await switchToTab(page, '點數購買', '點數套餐管理');

    const pkgName = `Comp Test Pkg ${Date.now()}`;
    await page.click('button:has-text("新增套餐")');
    await page.waitForTimeout(500);

    const pkgCard = page.locator('.bg-white.rounded-2xl.p-5').last();
    await pkgCard.locator('button:has-text("編輯內容")').click();
    await pkgCard.locator('label:has-text("套餐名稱") + input').fill(pkgName);
    await pkgCard.locator('label:has-text("點數數量") + input').fill('100');
    await pkgCard.locator('label:has-text("點數單位售價") + input').fill('10');
    
    await pkgCard.locator('button:has-text("選擇方案")').click();
    await page.waitForTimeout(200);
    await pkgCard.locator('select').first().selectOption({ label: `${discountName} (20%)` });
    await expect(pkgCard.locator('.text-green-700')).toContainText('800');

    await page.click('button:has-text("儲存變更")');
    await waitForSaveSuccess(page);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 4: Subscription Plans
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n[Section 4] Testing Subscription Plans...');
    await switchToTab(page, '訂閱方案', '訂閱方案管理');

    const subName = `Comp Test Sub ${Date.now()}`;
    await page.click('button:has-text("新增方案")');
    await page.waitForTimeout(500);

    const subCard = page.locator('.bg-white.rounded-2xl.p-5').last();
    await subCard.locator('label:has-text("方案標籤") + input').fill(subName);

    await page.click('button:has-text("儲存變更")');
    await waitForSaveSuccess(page);

    console.log('\n✅ Comprehensive verification PASSED!');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 5: Greedy Cleanup
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n[Section 5] Cleaning up test data (Greedy Cleanup)...');

    const cleanupTarget = async (tab: string, head: string, prefix: string) => {
      await switchToTab(page, tab, head);
      await page.waitForTimeout(1000);
      
      let deleted = true;
      let count = 0;
      while (deleted && count < 20) {
        const card = page.locator('.bg-white.rounded-2xl.p-5').filter({ 
          has: page.locator(`input[value*="${prefix}"]`) 
        }).first();
        
        if (await card.isVisible()) {
          const name = await card.locator('input').first().getAttribute('value');
          const editBtn = card.locator('button:has-text("編輯內容")');
          if (await editBtn.isVisible()) await editBtn.click();
          await card.locator('button:has-text("刪除")').click();
          console.log(`  ✓ Deleted artifact: ${name}`);
          count++;
          await page.waitForTimeout(500);
        } else {
          deleted = false;
        }
      }
    };

    // Delete in reverse order of creation/dependency
    await cleanupTarget('訂閱方案', '訂閱方案管理', 'Comp Test Sub');
    await cleanupTarget('點數購買', '點數套餐管理', 'Comp Test Pkg');
    await cleanupTarget('折扣方案', '折扣方案管理', 'Comp Test Discount');
    await cleanupTarget('應用程式方案', '應用程式方案管理', 'Comp Test App');

    await page.click('button:has-text("儲存變更")');
    await waitForSaveSuccess(page);
    console.log('  ✓ Cleanup complete and saved');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 6: Logout (Required by auto-login skill)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n[Section 6] Logging out...');
    try {
      // Navigate to home to access navbar logout
      await page.goto(`${BASE_URL}/`);
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      
      // Click logout button in navbar/menu
      const logoutBtn = page.locator('button:has-text("登出"), a:has-text("登出"), button:has-text("Logout"), a:has-text("Logout")').first();
      if (await logoutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await logoutBtn.click();
        await expect(page).toHaveURL(/\/login/, { timeout: 10000 }).catch(() => {});
        console.log('  ✓ Logout successful');
      } else {
        console.log('  ⚠️ Logout button not found, but test completed');
      }
    } catch (e) {
      console.log(`  ⚠️ Logout failed: ${e}, but test completed`);
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('✅ TEST COMPLETE: All pricing settings verified');
    console.log('═══════════════════════════════════════════');
  });
});

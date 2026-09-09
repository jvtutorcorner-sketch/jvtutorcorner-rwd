import { test, expect, Page } from '@playwright/test';
import { createOrganization, deleteOrganization } from '../lib/organizationService';

/**
 * AuditLog 檢視頁面 — 真實瀏覽器操作流程 (/admin/audit-logs)
 *
 * scripts/verify-b2b-audit-log-viewer.mjs 已經深度驗證了 GET /api/admin/audit-logs
 * 本身（GSI 查詢模式、Scan 模式、篩選、系統管理員限定的授權邊界）。這支測試改用真實
 * 瀏覽器把頁面實際點過一次——這是第一個能讀取 AuditLogs 的產品內畫面（先前完全是
 * write-only，見 docs/b2b-request-path-diagram.md 的 [Known Gap]）。
 *
 * 用法（一定要帶 chromium-headed 專案才會跳出瀏覽器視窗）：
 *   npx playwright test e2e/b2b_audit_log_viewer_ui_flow.spec.ts --project=chromium-headed
 */

function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  throw new Error(`Missing required environment variable(s): ${keys.join(', ')}`);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@jvtutorcorner.com';
const ADMIN_PASSWORD = requireEnv('ADMIN_PASSWORD', 'QA_ADMIN_PASSWORD');
const LOGIN_BYPASS_SECRET = requireEnv('LOGIN_BYPASS_SECRET', 'NEXT_PUBLIC_LOGIN_BYPASS_SECRET', 'QA_CAPTCHA_BYPASS');

async function loginAs(page: Page, email: string, password: string, role: string) {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  try {
    await page.waitForSelector('img[alt="captcha"]', { timeout: 15000 });
  } catch {
    /* captcha may not appear */
  }
  try {
    await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 10000 });
  } catch {
    /* button may already be enabled */
  }

  await page.fill('#captcha', LOGIN_BYPASS_SECRET);
  await page.click('button[type="submit"]');

  try {
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log(`   ✅ Logged in as ${role} (${email})`);
  } catch {
    console.log(`   ⚠️  Login navigation timeout for ${role}`);
  }
}

test.describe('AuditLog 檢視頁面 — 真實瀏覽器操作流程', () => {
  test('用 targetId 查詢一筆組織建立的稽核紀錄', async ({ page, request }) => {
    test.setTimeout(120000);

    const RUN_TAG = `e2e-auditlog-${Date.now()}`;

    // 透過真實 API 建立組織（會觸發 organization.create 稽核寫入），不是直接寫 DB，
    // 這樣才會經過 app/api/organizations/route.ts 裡的 writeAuditLog() 呼叫。
    const createRes = await request.post('/api/organizations', {
      headers: { 'X-E2E-Secret': LOGIN_BYPASS_SECRET },
      data: {
        name: `E2E AuditLog 驗證組織 ${RUN_TAG}`,
        planTier: 'business',
        maxSeats: 5,
        billingEmail: `billing-${RUN_TAG}@example.com`
      }
    });
    expect(createRes.ok(), 'POST /api/organizations 建立測試組織').toBeTruthy();
    const org = (await createRes.json()).organization;

    try {
      await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'Admin');

      // 新頁面預設不在選單裡（menuVisible:false，見既有 page-permissions 機制），
      // 系統管理員一樣可以直接用網址列打開。
      await page.goto('/admin/audit-logs');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: '稽核紀錄查詢' })).toBeVisible({ timeout: 10000 });

      await test.step('用 targetId 查詢剛才建立的組織', async () => {
        const searchResponsePromise = page.waitForResponse(
          (r) => r.url().includes('/api/admin/audit-logs') && r.request().method() === 'GET'
        );
        await page.locator('input[placeholder*="targetId"]').fill(org.id);
        await page.getByRole('button', { name: '查詢' }).click();
        const searchResponse = await searchResponsePromise;
        expect(searchResponse.ok(), '查詢 API 回應 2xx').toBeTruthy();
        const searchData = await searchResponse.json();
        expect(
          searchData.entries?.some((e: any) => e.action === 'organization.create'),
          'API 回應包含 organization.create 紀錄'
        ).toBeTruthy();

        await expect(page.locator('table')).toContainText('organization.create', { timeout: 10000 });
        await expect(page.locator('table')).toContainText(org.id);
      });
    } finally {
      console.log('\n--- cleanup ---');
      try {
        await deleteOrganization(org.id, true);
      } catch (e: any) {
        console.warn(`  ⚠️ failed to delete organization ${org.id}: ${e.message}`);
      }
      console.log('cleanup done.');
    }
  });
});

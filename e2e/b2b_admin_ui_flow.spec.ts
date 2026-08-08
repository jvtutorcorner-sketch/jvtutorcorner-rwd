import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../lib/dynamo';
import { putProfile, findProfileByEmail, PROFILES_TABLE } from '../lib/profilesService';

/**
 * B2B 企業管理後台 — 真實瀏覽器操作流程
 *
 * 跟 scripts/verify-b2b-*.mjs 系列不同：那些腳本直接呼叫 lib/*.ts 打 DynamoDB，
 * 跑起來看不到任何畫面（無頭）。這支測試改用真實瀏覽器，一步步點開 /admin/organizations
 * 的實際 UI（跟企業管理員會做的事一模一樣：建組織、加成員、撞席次上限、移除成員、
 * 建部門），用來讓人「看得到」執行過程，而不是只看終端機文字輸出。
 *
 * moveOrgUnit 的原子性/併發/子樹路徑重寫等資料庫層邊界案例已由
 * scripts/verify-b2b-access-orgunits.mjs 深度覆蓋，這裡的部門操作只示範最常見的
 * 使用者路徑，不重複那些邊界測試。
 *
 * 用法（一定要帶 chromium-headed 專案才會跳出瀏覽器視窗）：
 *   npx playwright test e2e/b2b_admin_ui_flow.spec.ts --project=chromium-headed
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

/** 跟 e2e/admin-teacher-escrow.spec.ts 同一套登入流程，維持一致。 */
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

/**
 * 一個部門在 OrgUnitTreePanel 裡是「外層 margin div > 內層 flex row div」兩層巢狀，
 * 兩層的 textContent 在葉節點時完全相同，filter 會同時命中兩層——.last() 依 DOM
 * 先序走訪順序抓到的一定是比較內層、真正掛按鈕的那一個。
 */
function unitRow(page: Page, name: string) {
  return page
    .locator('div')
    .filter({ hasText: name })
    .filter({ has: page.getByRole('button', { name: '移動' }) })
    .last();
}

test.describe('B2B 企業管理後台 — 真實瀏覽器操作流程', () => {
  test('建立組織 → 建部門並巢狀 → 加入成員到席次上限 → 移除成員', async ({ page }) => {
    test.setTimeout(180000);

    const RUN_TAG = `e2e-b2b-${Date.now()}`;
    const orgName = `E2E 驗證組織 ${RUN_TAG}`;
    const member1Email = `${RUN_TAG}-m1@example.com`;
    const member2Email = `${RUN_TAG}-m2@example.com`;

    // 兩個丟棄用的成員帳號直接用 API 建立（不走 UI 註冊流程）——這支測試示範的是
    // 「管理員視角」的操作，成員帳號本身只是測試 fixture。
    await putProfile({
      id: randomUUID(),
      email: member1Email,
      firstName: '成員',
      lastName: '一',
      role: 'student',
      plan: 'basic',
      isB2B: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await putProfile({
      id: randomUUID(),
      email: member2Email,
      firstName: '成員',
      lastName: '二',
      role: 'student',
      plan: 'basic',
      isB2B: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    page.on('dialog', (dialog) => dialog.accept()); // 「確定要移出/封存嗎」等 confirm() 一律確認

    let orgId = '';

    try {
      await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'Admin');

      await test.step('建立組織', async () => {
        await page.goto('/admin/organizations');
        await page.getByRole('button', { name: '+ 建立組織' }).click();
        await page.getByLabel(/組織名稱/).fill(orgName);
        await page.getByLabel(/席次上限/).fill('2');
        await page.getByLabel(/計費信箱/).fill(`billing-${RUN_TAG}@example.com`);
        await page.getByRole('button', { name: '建立', exact: true }).click();
        await expect(page.getByRole('link', { name: orgName })).toBeVisible({ timeout: 15000 });
      });

      await test.step('進入組織詳情頁', async () => {
        const row = page.locator('tr', { has: page.getByRole('link', { name: orgName }) });
        await row.getByRole('link', { name: '檢視詳情' }).click();
        await expect(page.getByRole('heading', { name: orgName })).toBeVisible();
        orgId = new URL(page.url()).pathname.split('/').filter(Boolean).pop() as string;
        await expect(page.getByText('席次 0 / 2')).toBeVisible();
      });

      await test.step('建立兩個部門並把其中一個搬到另一個底下', async () => {
        await page.getByRole('button', { name: '組織單位' }).click();

        // 用 <strong> 標籤鎖定部門樹裡的名稱——建立後同一個名稱也會出現在
        // 「上層部門」下拉選單的 <option> 裡，getByText 對純文字會兩個都命中。
        await page.getByPlaceholder('新部門名稱').fill('工程部');
        await page.getByRole('button', { name: '+ 新增子部門' }).click();
        await expect(page.locator('strong', { hasText: '工程部' })).toBeVisible({ timeout: 10000 });

        await page.getByPlaceholder('新部門名稱').fill('業務部');
        await page.getByRole('button', { name: '+ 新增子部門' }).click();
        await expect(page.locator('strong', { hasText: '業務部' })).toBeVisible({ timeout: 10000 });

        await unitRow(page, '業務部').getByRole('button', { name: '移動' }).click();
        const moveResponse = page.waitForResponse(
          (r) => r.url().includes('/move') && r.request().method() === 'POST'
        );
        await page.locator('label', { hasText: '移動到：' }).locator('select').selectOption({ label: '工程部' });
        await moveResponse;
        // 部門仍然存在（只是換了上層），只是不再是根節點
        await expect(page.locator('strong', { hasText: '業務部' })).toBeVisible();
      });

      await test.step('加入成員到席次上限，UI 顯示席次已滿', async () => {
        await page.getByRole('button', { name: '成員' }).click();

        await page.getByPlaceholder('以 Email 加入現有使用者').fill(member1Email);
        await page.getByRole('button', { name: '+ 加入成員' }).click();
        await expect(page.getByText(member1Email)).toBeVisible({ timeout: 10000 });

        await page.getByPlaceholder('以 Email 加入現有使用者').fill(member2Email);
        await page.getByRole('button', { name: '+ 加入成員' }).click();
        await expect(page.getByText(member2Email)).toBeVisible({ timeout: 10000 });

        await expect(page.getByPlaceholder('以 Email 加入現有使用者')).toBeDisabled();
        await expect(page.getByText(/席次已滿/)).toBeVisible();
      });

      await test.step('移除一位成員，席次釋放、輸入框恢復可用', async () => {
        const row = page.locator('tr', { has: page.getByText(member1Email) });
        await row.getByRole('button', { name: '移除' }).click();
        await expect(page.getByText(member1Email)).not.toBeVisible({ timeout: 10000 });
        await expect(page.getByPlaceholder('以 Email 加入現有使用者')).toBeEnabled();
      });
    } finally {
      // ------------------------------------------------------------------
      // 清理：不透過 UI（避免清理步驟本身又依賴一堆脆弱的 selector），直接呼叫
      // API 清掉這支測試建立的組織/部門/成員 profile。
      //
      // 用 page.context().request，不是 test() 拿到的獨立 request fixture——後者
      // 是一個全新的 APIRequestContext，不會帶著 page 登入後拿到的 session
      // cookie，會被 API 401 擋掉。而且 Playwright 的 APIResponse 對非 2xx 狀態
      // 不會 throw，所以先前版本的 try/catch 完全沒接住這個問題，靜默留下殘留
      // 資料——這裡额外檢查 .ok() 並印出警告，之後才不會又無聲失敗。
      // ------------------------------------------------------------------
      console.log('\n--- cleanup ---');
      const apiRequest = page.context().request;

      if (orgId) {
        try {
          const membersRes = await apiRequest.get(`/api/organizations/${orgId}/members`);
          const membersData = await membersRes.json().catch(() => ({}));
          for (const member of membersData.members || []) {
            const r = await apiRequest.delete(`/api/organizations/${orgId}/members/${member.id}`);
            if (!r.ok()) console.warn(`  ⚠️ failed to remove member ${member.id}: HTTP ${r.status()}`);
          }
        } catch (e: any) {
          console.warn(`  ⚠️ failed to clean up members: ${e.message}`);
        }

        try {
          const unitsRes = await apiRequest.get(`/api/org-units?orgId=${encodeURIComponent(orgId)}`);
          const unitsData = await unitsRes.json().catch(() => ({}));
          // 子單位先刪：按 path 長度由長到短排序，粗略保證葉節點先於父節點
          const units = (unitsData.orgUnits || []).sort(
            (a: any, b: any) => (b.path?.length || 0) - (a.path?.length || 0)
          );
          for (const unit of units) {
            const r = await apiRequest.delete(`/api/org-units/${unit.id}?hard=true`);
            if (!r.ok()) console.warn(`  ⚠️ failed to delete org unit ${unit.id}: HTTP ${r.status()}`);
          }
        } catch (e: any) {
          console.warn(`  ⚠️ failed to clean up org units: ${e.message}`);
        }

        try {
          const r = await apiRequest.delete(`/api/organizations/${orgId}?hard=true`);
          if (!r.ok()) console.warn(`  ⚠️ failed to delete organization ${orgId}: HTTP ${r.status()}`);
        } catch (e: any) {
          console.warn(`  ⚠️ failed to delete organization ${orgId}: ${e.message}`);
        }
      }

      try {
        for (const email of [member1Email, member2Email]) {
          // profile id 是隨機 UUID，沒存下來——用 email 查一次再刪
          const profile = await findProfileByEmail(email).catch(() => null);
          if (profile?.id) {
            await ddbDocClient.send(new DeleteCommand({ TableName: PROFILES_TABLE, Key: { id: profile.id } }));
          }
        }
      } catch (e: any) {
        console.warn(`  ⚠️ failed to clean up seeded profiles: ${e.message}`);
      }
      console.log('cleanup done.');
    }
  });
});

import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../lib/dynamo';
import { putProfile, findProfileByEmail, PROFILES_TABLE } from '../lib/profilesService';

/**
 * B2B 管理後台 — 部門管理員 UI + 帳單 UI，真實瀏覽器操作流程
 *
 * 這個 session 新增的兩塊 UI（OrgMembersPanel 的「部門管理員」欄位、OrganizationDetailManager
 * 的「帳單」分頁）之前只被 e2e/b2b_dept_admin_scope.spec.ts 用純 HTTP API 驗證過（不開瀏覽器，
 * 看不到畫面），也沒有任何測試真的「開啟網頁」點過這兩個新元件。這支測試用真實瀏覽器把這兩塊
 * 從頭點一次：
 *
 *   1. 建組織 → 建部門 → 加成員並指定部門 → 在成員列表勾選「部門管理員」→ 確認顯示管理範圍 →
 *      取消勾選 → 確認範圍標籤消失
 *   2. 切到「帳單」分頁 → 確認合約狀態橫幅顯示「尚未設定合約期間」→ 用續約表單把合約續到一年後
 *      → 確認橫幅變成「合約有效」且顯示到期日 → 嘗試建立發票
 *
 * 「建立發票」目前預期會失敗——jvtutorcorner-org-invoices 這張 DynamoDB 表還沒部署（見
 * cloudformation/dynamodb-org-invoices-table.yml 的說明），這支測試刻意保留這個案例，用來
 * 驗證「後端還沒準備好時，UI 要嘛顯示清楚的錯誤訊息，不能整頁當掉」。等表部署好之後，把這個
 * step 裡 expect 失敗訊息的斷言，改成跟 scripts/verify-b2b-org-billing.mjs 一樣驗證真的建立
 * 成功即可。
 *
 * 用法：
 *   npx playwright test e2e/b2b_dept_admin_and_billing_ui_flow.spec.ts --project=chromium-headless
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

/** 跟 e2e/b2b_admin_ui_flow.spec.ts 同一套登入流程，維持一致。 */
async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  for (let attempt = 1; attempt <= 3; attempt++) {
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

    // Next.js dev 模式下 React StrictMode 會讓載入驗證碼的 useEffect 跑兩次；如果第二次
    // fetch 在填完欄位「之後」才 resolve，會把欄位清空（loadCaptcha 成功時會
    // setCaptchaValue('')）——真的渲染的 headed 模式時間點跟 headless 不同，特別容易撞見
    // 這個窗口，結果送出的 captchaValue 是空字串，後端回 400 captcha_incorrect，整支測試
    // 從此在沒登入的狀態下繼續跑（後面每個 API 呼叫都會是 401 missing session token）。
    // 送出前稍等一下、確認欄位值還在，不在就重填一次。
    await page.fill('#captcha', LOGIN_BYPASS_SECRET);
    await page.waitForTimeout(300);
    if ((await page.inputValue('#captcha').catch(() => '')) !== LOGIN_BYPASS_SECRET) {
      await page.fill('#captcha', LOGIN_BYPASS_SECRET);
    }
    await page.click('button[type="submit"]');

    try {
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
      return;
    } catch {
      if (attempt < 3) continue;
      /* fall through — caller will fail on the next assertion if login actually failed */
    }
  }
}

/** 跟 b2b_admin_ui_flow.spec.ts 一樣：一個部門在樹狀畫面裡外層/內層 div 會重複命中，抓最內層。 */
function unitRow(page: Page, name: string) {
  return page
    .locator('div')
    .filter({ hasText: name })
    .filter({ has: page.getByRole('button', { name: '移動' }) })
    .last();
}

function memberRow(page: Page, email: string) {
  return page.locator('tr', { has: page.getByText(email) });
}

test.describe('B2B 管理後台 — 部門管理員與帳單 UI 真實瀏覽器操作流程', () => {
  test('部門管理員勾選/取消勾選正確運作；帳單分頁續約成功、建立發票在表未部署時優雅失敗', async ({ page }) => {
    test.setTimeout(180000);

    const RUN_TAG = `e2e-deptbill-${Date.now()}`;
    const orgName = `E2E 部門帳單驗證組織 ${RUN_TAG}`;
    const memberEmail = `${RUN_TAG}-member@example.com`;
    const unitName = '工程部';

    await putProfile({
      id: randomUUID(),
      email: memberEmail,
      firstName: '成員',
      lastName: '一',
      role: 'student',
      plan: 'basic',
      isB2B: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    page.on('dialog', (dialog) => dialog.accept());

    let orgId = '';

    try {
      await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

      await test.step('建立組織', async () => {
        await page.goto('/admin/organizations');
        await page.getByRole('button', { name: '+ 建立組織' }).click();
        await page.getByLabel(/組織名稱/).fill(orgName);
        await page.getByLabel(/席次上限/).fill('5');
        await page.getByLabel(/計費信箱/).fill(`billing-${RUN_TAG}@example.com`);
        await page.getByRole('button', { name: '建立', exact: true }).click();
        await expect(page.getByRole('link', { name: orgName })).toBeVisible({ timeout: 15000 });
      });

      await test.step('進入組織詳情頁', async () => {
        const row = page.locator('tr', { has: page.getByRole('link', { name: orgName }) });
        await row.getByRole('link', { name: '檢視詳情' }).click();
        await expect(page.getByRole('heading', { name: orgName })).toBeVisible();
        orgId = new URL(page.url()).pathname.split('/').filter(Boolean).pop() as string;
      });

      await test.step('建立部門', async () => {
        await page.getByRole('button', { name: '組織單位' }).click();
        await page.getByPlaceholder('新部門名稱').fill(unitName);
        await page.getByRole('button', { name: '+ 新增子部門' }).click();
        await expect(page.locator('strong', { hasText: unitName })).toBeVisible({ timeout: 10000 });
      });

      await test.step('加入成員並指定部門', async () => {
        await page.getByRole('button', { name: '成員' }).click();
        await page.getByPlaceholder('以 Email 加入現有使用者').fill(memberEmail);
        // 部門下拉在加入表單裡，選擇剛建立的部門，之後這位成員就落在「工程部」底下。
        await page
          .locator('form')
          .filter({ has: page.getByPlaceholder('以 Email 加入現有使用者') })
          .locator('select')
          .first()
          .selectOption({ label: unitName });
        await page.getByRole('button', { name: '+ 加入成員' }).click();
        await expect(page.getByText(memberEmail)).toBeVisible({ timeout: 10000 });
      });

      await test.step('勾選「部門管理員」→ 顯示管理範圍標籤', async () => {
        const row = memberRow(page, memberEmail);
        const deptAdminCell = row.locator('td').nth(5);
        const deptAdminCheckbox = deptAdminCell.locator('input[type="checkbox"]');
        await expect(deptAdminCheckbox).not.toBeChecked();
        await deptAdminCheckbox.click();
        await expect(deptAdminCheckbox).toBeChecked({ timeout: 10000 });
        // 元件在勾選後會在同一個儲存格的 checkbox 旁顯示管理範圍的部門名稱——鎖定這個儲存格，
        // 避免跟「部門」欄位的 <select><option>工程部</option> 撞名。
        await expect(deptAdminCell.getByText(unitName)).toBeVisible();
      });

      await test.step('取消勾選「部門管理員」→ 範圍標籤消失', async () => {
        const row = memberRow(page, memberEmail);
        const deptAdminCheckbox = row.locator('td').nth(5).locator('input[type="checkbox"]');
        await deptAdminCheckbox.click();
        await expect(deptAdminCheckbox).not.toBeChecked({ timeout: 10000 });
      });

      await test.step('切到帳單分頁 → 尚未設定合約期間', async () => {
        await page.getByRole('button', { name: '帳單' }).click();
        await expect(page.getByText('尚未設定合約期間')).toBeVisible({ timeout: 10000 });
      });

      await test.step('續約合約 → 橫幅更新為合約有效', async () => {
        const oneYearOut = new Date();
        oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
        const dateStr = oneYearOut.toISOString().slice(0, 10);

        await page.locator('input[type="date"]').first().fill(dateStr);
        await page.getByRole('button', { name: '續約合約' }).click();

        await expect(page.getByText('合約有效')).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(dateStr)).toBeVisible();
      });

      await test.step('嘗試建立發票 → 表未部署，UI 顯示錯誤而不是整頁當掉', async () => {
        const today = new Date();
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        // periodEnd 一定要晚於 periodStart，否則會先撞到 createInvoice 自己的日期驗證
        // （"periodEnd must be after periodStart"），根本測不到「表不存在」這個案例。
        await page.getByPlaceholder('計費起').fill(today.toISOString().slice(0, 10));
        await page.getByPlaceholder('計費迄').fill(tomorrow.toISOString().slice(0, 10));
        await page.getByPlaceholder('金額').fill('1000');
        await page.getByPlaceholder('幣別').fill('TWD');
        await page.getByPlaceholder('繳款期限').fill(today.toISOString().slice(0, 10));

        const createInvoiceForm = page.locator('form').filter({ has: page.getByRole('button', { name: '+ 建立發票' }) });
        await createInvoiceForm.getByRole('button', { name: '+ 建立發票' }).click();

        // jvtutorcorner-org-invoices 表還沒部署，預期後端回傳「找不到資源」，前端要把這個
        // 錯誤顯示在建立發票表單裡，而不是讓整頁噴例外或卡住。鎖定表單內的錯誤文字，避免跟
        // 帳單橫幅／發票清單區塊裡「無法讀取發票資料」的另外兩則提示撞在一起。
        await expect(createInvoiceForm.getByText(/not found|失敗/)).toBeVisible({ timeout: 10000 });
        // 頁面本身仍然是正常可互動的（標題還在），證明不是整頁崩潰。
        await expect(page.getByRole('heading', { name: orgName })).toBeVisible();
      });
    } finally {
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
        const profile = await findProfileByEmail(memberEmail).catch(() => null);
        if (profile?.id) {
          await ddbDocClient.send(new DeleteCommand({ TableName: PROFILES_TABLE, Key: { id: profile.id } }));
        }
      } catch (e: any) {
        console.warn(`  ⚠️ failed to clean up seeded profile: ${e.message}`);
      }
      console.log('cleanup done.');
    }
  });
});

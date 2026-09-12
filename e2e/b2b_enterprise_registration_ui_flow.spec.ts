import { test, expect } from '@playwright/test';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../lib/dynamo';
import { findProfileByEmail, PROFILES_TABLE } from '../lib/profilesService';
import { createOrganization, deleteOrganization } from '../lib/organizationService';
import { deleteLicense } from '../lib/licenseService';

/**
 * 企業自助註冊 — 真實瀏覽器操作流程 (/login/register_enterprise)
 *
 * 跟 scripts/verify-b2b-enterprise-registration.mjs 互補：那支腳本直接打
 * POST /api/register，深度驗證網域檢查、席次競態下的 rollback；這支測試改用
 * 真實瀏覽器把「單筆註冊」與「CSV 批次匯入」兩條路徑都走一遍。
 *
 * 寫這支測試時抓到一個真的壞掉的功能：CSV 批次匯入送出的每一筆
 * POST /api/register 完全沒帶 captchaToken/captchaValue，導致每一列都會
 * 收到 captcha_incorrect 而失敗——CSV 匯入功能在修復前是 100% 不能用的。
 * 已在 app/login/register_enterprise/page.tsx 補上（沿用頁面頂部驗證碼的
 * captchaToken/captchaValue，因為 verifyCaptcha 的 token 是無狀態的，同一個
 * token 可以驗證多次，不需要每列重新拿驗證碼）。
 *
 * 用法：
 *   npm run dev
 *   npx playwright test e2e/b2b_enterprise_registration_ui_flow.spec.ts --project=chromium-headed
 */

function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  throw new Error(`Missing required environment variable(s): ${keys.join(', ')}`);
}

const LOGIN_BYPASS_SECRET = requireEnv('LOGIN_BYPASS_SECRET', 'NEXT_PUBLIC_LOGIN_BYPASS_SECRET', 'QA_CAPTCHA_BYPASS');

test.describe('企業自助註冊 — 真實瀏覽器操作流程', () => {
  test('單筆註冊 + CSV 批次匯入', async ({ page }) => {
    test.setTimeout(120000);

    const RUN_TAG = `e2e-reg-${Date.now()}`;
    const domain = `${RUN_TAG}.test`;
    const org = await createOrganization({
      name: `E2E 註冊驗證組織 ${RUN_TAG}`,
      domain,
      planTier: 'business',
      maxSeats: 5,
      billingEmail: `billing-${RUN_TAG}@${domain}`
    });

    const createdEmails: string[] = [];

    try {
      await test.step('單筆註冊', async () => {
        const email = `single@${domain}`;
        createdEmails.push(email);

        await page.goto('/login/register_enterprise');
        // The page fires 3 independent fetches on mount (orgs, roles, captcha), each
        // triggering its own re-render as it resolves — interacting before they've all
        // settled is what was causing "element detached from DOM, retrying" at random
        // spots earlier.
        await page.waitForLoadState('networkidle');
        console.log('   [debug] after goto, url =', page.url());
        await expect(page.locator('.field', { hasText: '所屬組織' })).toBeVisible({ timeout: 10000 });
        console.log('   [debug] 所屬組織 field visible');
        await page.locator('.field', { hasText: '所屬組織' }).locator('select').selectOption(org.id, { timeout: 10000 });
        console.log('   [debug] org selected');
        await page.locator('.field', { hasText: '身份' }).locator('select').selectOption('student', { timeout: 10000 });
        console.log('   [debug] role selected');
        // 姓名標籤已在地化為「名」「姓」（first_name_label／last_name_label），input 沒有 name；
        // 以 label 全文比對，避免單字「名」「姓」誤中其他欄位。
        await page.locator('.field').filter({ has: page.locator('label', { hasText: /^名\s*\*$/ }) }).locator('input').fill('Verify', { timeout: 10000 });
        await page.locator('.field').filter({ has: page.locator('label', { hasText: /^姓\s*\*$/ }) }).locator('input').fill('Bot', { timeout: 10000 });
        await page.locator('.field', { hasText: 'Email' }).locator('input').fill(email, { timeout: 10000 });
        await page.locator('input[type="password"]').nth(0).fill('TestPassw0rd!', { timeout: 10000 });
        await page.locator('input[type="password"]').nth(1).fill('TestPassw0rd!', { timeout: 10000 });
        await page.locator('.field', { hasText: '出生日期' }).locator('input').fill('2000-01-01', { timeout: 10000 });
        await page.locator('.field', { hasText: '性別' }).locator('select').selectOption('male', { timeout: 10000 });
        await page.locator('.field', { hasText: '國家' }).locator('select').selectOption('TW', { timeout: 10000 });
        // Something on this page keeps shifting layout (captcha image swapping in,
        // most likely), which trips Playwright's coordinate-based actionability/
        // stability checks — and worse, force:true (bypassing those checks) was
        // clicking at a stale coordinate that had drifted onto the navbar's home
        // logo link, silently navigating to "/" instead of toggling the checkbox.
        // dispatchEvent('click') fires a real DOM click directly on the element
        // (via its own reference, not screen coordinates), sidestepping all of that.
        await page.locator('input[name="terms"]').dispatchEvent('click');
        console.log('   [debug] form filled');

        await page.waitForSelector('img[alt="captcha"]', { timeout: 15000 }).catch(() => {});
        await page.getByPlaceholder('請輸入上方驗證碼').fill(LOGIN_BYPASS_SECRET, { timeout: 10000 });
        console.log('   [debug] captcha filled, submitting');
        await page.getByRole('button', { name: '建立帳戶' }).dispatchEvent('click');

        await page.waitForURL(/\/login(?!\/register)/, { timeout: 15000 });
        console.log('   [debug] navigated to', page.url());
      });

      const singleProfile = await findProfileByEmail(createdEmails[0]);
      expect(singleProfile, '單筆註冊的 profile 真的寫進 DB').toBeTruthy();
      expect(singleProfile?.isB2B, '單筆註冊的成員 isB2B=true').toBe(true);
      expect(singleProfile?.orgId, '單筆註冊的成員 orgId 指到剛建立的組織').toBe(org.id);

      await test.step('CSV 批次匯入', async () => {
        const csvEmail1 = `csv1@${domain}`;
        const csvEmail2 = `csv2@${domain}`;
        createdEmails.push(csvEmail1, csvEmail2);

        const csvContent = [
          'email,password,firstName,lastName,role,birthdate,gender,country',
          `${csvEmail1},TestPassw0rd!,CSV,One,student,2000-01-01,male,TW`,
          `${csvEmail2},TestPassw0rd!,CSV,Two,student,2001-02-02,female,TW`
        ].join('\n');

        await page.goto('/login/register_enterprise');
        // The page fires 3 independent fetches on mount (orgs, roles, captcha), each
        // triggering its own re-render as it resolves — interacting before they've all
        // settled is what was causing "element detached from DOM, retrying" at random
        // spots earlier.
        await page.waitForLoadState('networkidle');
        console.log('   [debug csv] after goto, url =', page.url());
        await expect(page.locator('.field', { hasText: '所屬組織' })).toBeVisible({ timeout: 10000 });
        await page.locator('.field', { hasText: '所屬組織' }).locator('select').selectOption(org.id, { timeout: 10000 });
        console.log('   [debug csv] org selected, url =', page.url());

        // CSV import reuses the page's top-level captchaValue state (see the fix in
        // app/login/register_enterprise/page.tsx) — it still has to actually be filled
        // in once on this fresh page load, same as a real user would.
        await page.waitForSelector('img[alt="captcha"]', { timeout: 15000 }).catch(() => {});
        await page.getByPlaceholder('請輸入上方驗證碼').fill(LOGIN_BYPASS_SECRET, { timeout: 10000 });

        await page.locator('input[type="file"]').setInputFiles({
          name: 'members.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csvContent, 'utf-8')
        });
        console.log('   [debug csv] file set, url =', page.url());
        await page.getByRole('button', { name: '匯入CSV' }).dispatchEvent('click');
        console.log('   [debug csv] clicked import, url =', page.url());
        await page.waitForTimeout(1000);
        console.log('   [debug csv] 1s after click, url =', page.url(), 'body text sample:', (await page.locator('body').innerText()).slice(0, 300));

        await expect(page.getByText(/成功\s*2/)).toBeVisible({ timeout: 20000 });
      });

      const csvProfile1 = await findProfileByEmail(`csv1@${domain}`);
      const csvProfile2 = await findProfileByEmail(`csv2@${domain}`);
      expect(csvProfile1, 'CSV 第一筆真的寫進 DB（驗證碼修復後才會成立）').toBeTruthy();
      expect(csvProfile2, 'CSV 第二筆真的寫進 DB（驗證碼修復後才會成立）').toBeTruthy();
    } finally {
      console.log('\n--- cleanup ---');
      for (const email of createdEmails) {
        try {
          const profile = await findProfileByEmail(email);
          if (profile?.id) {
            if (profile.licenseId) {
              await deleteLicense(profile.licenseId, true).catch(() => {});
            }
            await ddbDocClient.send(new DeleteCommand({ TableName: PROFILES_TABLE, Key: { id: profile.id } }));
          }
        } catch (e: any) {
          console.warn(`  ⚠️ failed to clean up ${email}: ${e.message}`);
        }
      }
      try {
        await deleteOrganization(org.id, true);
      } catch (e: any) {
        console.warn(`  ⚠️ failed to delete organization ${org.id}: ${e.message}`);
      }
      console.log('cleanup done.');
    }
  });
});

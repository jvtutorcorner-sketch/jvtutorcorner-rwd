import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../lib/dynamo';
import { putProfile, PROFILES_TABLE } from '../lib/profilesService';
import { createOrganization, deleteOrganization } from '../lib/organizationService';
import { deleteLicense } from '../lib/licenseService';

/**
 * 授權管理面板 — 真實瀏覽器操作流程 (OrgLicensesPanel / /admin/organizations/[id] 的「授權」分頁)
 *
 * scripts/verify-b2b-http-routes.mjs 已經深度驗證了 app/api/licenses/** 路由本身
 * （auth 分層、狀態碼、audit log）；這支測試改用真實瀏覽器把管理員實際會做的操作走一遍
 * ——批次核發、指派給成員、取消指派、撤銷未指派的授權——因為 OrgLicensesPanel.tsx 是
 * 唯一呼叫這組 API 的 UI，先前完全沒有任何測試覆蓋過它。
 *
 * 用法（一定要帶 chromium-headed 專案才會跳出瀏覽器視窗）：
 *   npx playwright test e2e/b2b_license_panel_ui_flow.spec.ts --project=chromium-headed
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

test.describe('授權管理面板 — 真實瀏覽器操作流程', () => {
  test('批次核發 → 指派 → 取消指派 → 撤銷', async ({ page }) => {
    test.setTimeout(120000);

    const RUN_TAG = `e2e-lic-${Date.now()}`;
    const memberEmail = `${RUN_TAG}-member@example.com`;

    // maxSeats 刻意設得很小（2）——核發上限的回歸測試需要「revoked 記錄的數量會頂到
    // maxSeats 邊緣」才有意義：席次夠寬裕的話，修復前的 bug（誤把 revoked 算進配額）
    // 不會被觸發，測試也就驗證不到東西。
    const org = await createOrganization({
      name: `E2E 授權面板驗證組織 ${RUN_TAG}`,
      planTier: 'business',
      maxSeats: 2,
      billingEmail: `billing-${RUN_TAG}@example.com`
    });

    const memberId = randomUUID();
    await putProfile({
      id: memberId,
      email: memberEmail,
      firstName: '授權',
      lastName: '測試對象',
      role: 'student',
      plan: 'basic',
      isB2B: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    page.on('dialog', (dialog) => dialog.accept()); // 「確定要取消指派/撤銷嗎」等 confirm() 一律確認

    const licenseIds: string[] = [];

    try {
      await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'Admin');

      await page.goto(`/admin/organizations/${org.id}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: '授權' }).click();
      await expect(page.getByRole('heading', { name: '授權', exact: true })).toBeVisible({ timeout: 10000 });

      await test.step('批次核發 2 個未指派授權', async () => {
        const provisionResponsePromise = page.waitForResponse(
          (r) => r.url().includes('/api/licenses') && r.request().method() === 'POST' && !r.url().includes('/assign')
        );
        await page.locator('input[type="number"]').fill('2');
        await page.getByRole('button', { name: '核發', exact: true }).click();
        const provisionResponse = await provisionResponsePromise;
        expect(provisionResponse.ok(), '核發 API 回應 2xx').toBeTruthy();
        const provisionData = await provisionResponse.json();
        expect(provisionData.ok, '核發 API ok:true').toBe(true);
        expect(provisionData.count, '核發 API 回報建立了 2 筆').toBe(2);
        licenseIds.push(...provisionData.licenses.map((l: any) => l.id));

        for (const id of licenseIds) {
          await expect(page.locator('tr', { hasText: id.slice(0, 8) })).toContainText('未指派（庫存）', { timeout: 10000 });
        }
      });

      await test.step('指派第一筆授權給成員', async () => {
        const row = page.locator('tr', { hasText: licenseIds[0].slice(0, 8) });
        await row.getByRole('button', { name: '指派' }).click();
        await row.locator('input[type="email"]').fill(memberEmail);

        const assignResponsePromise = page.waitForResponse(
          (r) => r.url().includes(`/api/licenses/${licenseIds[0]}/assign`) && r.request().method() === 'POST'
        );
        await row.getByRole('button', { name: '確定' }).click();
        const assignResponse = await assignResponsePromise;
        expect(assignResponse.ok(), '指派 API 回應 2xx').toBeTruthy();

        await expect(row).toContainText('已指派', { timeout: 10000 });
        await expect(row).toContainText(memberEmail);
      });

      await test.step('取消指派 → 授權變為「已撤銷」（不是回到可再指派的庫存）', async () => {
        // DELETE /api/licenses/[id]/assign 底層呼叫 orgMembershipService.removeMemberFromOrg，
        // 它把授權標成 revoked（不是 pending）——這支路由的原始文件註解已經寫明是
        // "unassign (revoke)"，跟「移除成員」共用同一套邏輯：usedSeats 會釋放，但這筆
        // 授權記錄本身不會回到可重新指派的庫存池，組織要讓新成員加入得另外核發新授權。
        const row = page.locator('tr', { hasText: licenseIds[0].slice(0, 8) });
        const unassignResponsePromise = page.waitForResponse(
          (r) => r.url().includes(`/api/licenses/${licenseIds[0]}/assign`) && r.request().method() === 'DELETE'
        );
        await row.getByRole('button', { name: '取消指派' }).click();
        const unassignResponse = await unassignResponsePromise;
        expect(unassignResponse.ok(), '取消指派 API 回應 2xx').toBeTruthy();

        await expect(row).toContainText('已撤銷', { timeout: 10000 });
        await expect(row).not.toContainText(memberEmail);
      });

      await test.step('核發新授權不受剛才那筆已撤銷授權影響（回歸：核發上限曾經誤把 revoked 算進配額）', async () => {
        // 在修復前，POST /api/licenses 的上限檢查用 listLicensesByOrg(orgId) 撈「這個組織
        // 所有歷史授權記錄」（含 revoked/expired）跟 maxSeats 比較，而不是只算目前活著的
        // 用量。這個組織 maxSeats=2：核發了 2 筆（existing.length=2）、上一步把其中 1 筆
        // 指派後又取消指派變成 revoked，目前活著的用量其實只有 usedSeats(0) + pending(1) = 1，
        // 明明還有 1 個空席次。修復前 existing.length(2) + 1 = 3 > maxSeats(2) 會被誤擋 409；
        // 如果組織經歷更多次「加入又移除成員」，revoked 記錄還會繼續累積，最終即使 usedSeats
        // 遠低於 maxSeats 也核發不出新授權。這裡核發 1 筆驗證修復後不會被那筆 revoked 記錄擋下來。
        const provisionResponsePromise = page.waitForResponse(
          (r) => r.url().includes('/api/licenses') && r.request().method() === 'POST' && !r.url().includes('/assign')
        );
        await page.locator('input[type="number"]').fill('1');
        await page.getByRole('button', { name: '核發', exact: true }).click();
        const provisionResponse = await provisionResponsePromise;
        expect(provisionResponse.ok(), '核發 API 不該被那筆 revoked 授權誤擋 -> 2xx').toBeTruthy();
        const provisionData = await provisionResponse.json();
        expect(provisionData.count).toBe(1);
        licenseIds.push(...provisionData.licenses.map((l: any) => l.id));
      });

      await test.step('撤銷一筆未指派授權（UI 走軟刪除，列不會消失，只是狀態變已撤銷）', async () => {
        // OrgLicensesPanel 的「撤銷」按鈕呼叫 DELETE /api/licenses/[id] 且不帶 ?hard=true，
        // 對應 licenseService.deleteLicense(id, false) 其實是呼叫 revokeLicense（軟刪除）
        // ——不是真的從資料表移除，只是把 status 改成 revoked。所以這裡驗證的是「列還在、
        // 狀態變了」，不是「列消失」。
        const targetId = licenseIds[1];
        const row = page.locator('tr', { hasText: targetId.slice(0, 8) });
        const revokeResponsePromise = page.waitForResponse(
          (r) => r.url().includes(`/api/licenses/${targetId}`) &&
            !r.url().includes('/assign') &&
            r.request().method() === 'DELETE'
        );
        await row.getByRole('button', { name: '撤銷' }).click();
        const revokeResponse = await revokeResponsePromise;
        expect(revokeResponse.ok(), '撤銷 API 回應 2xx').toBeTruthy();

        await expect(row).toContainText('已撤銷', { timeout: 10000 });
      });
    } finally {
      console.log('\n--- cleanup ---');
      for (const licenseId of licenseIds) {
        try {
          await deleteLicense(licenseId, true);
        } catch (e: any) {
          console.warn(`  ⚠️ failed to delete license ${licenseId}: ${e.message}`);
        }
      }
      try {
        await ddbDocClient.send(new DeleteCommand({ TableName: PROFILES_TABLE, Key: { id: memberId } }));
      } catch (e: any) {
        console.warn(`  ⚠️ failed to delete profile ${memberId}: ${e.message}`);
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

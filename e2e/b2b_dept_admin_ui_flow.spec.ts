import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../lib/dynamo';
import { putProfile, PROFILES_TABLE, getProfileById } from '../lib/profilesService';
import { createOrganization, deleteOrganization } from '../lib/organizationService';
import { createOrgUnit, deleteOrgUnit } from '../lib/orgUnitService';

/**
 * dept_admin 指派 — 真實瀏覽器操作流程 (OrgMembersPanel / /admin/organizations/[id] 的「成員」分頁)
 *
 * scripts/verify-b2b-dept-admin-scope.mjs 已經深度驗證了 lib/auth/orgAccess.ts 的
 * requireOrgUnitAccess/requireMemberScopeAccess guard 邏輯與 orgMembershipService.
 * setMemberDeptAdmin 的欄位變化；scripts/verify-b2b-http-routes.mjs 的 7b 段落已經驗證
 * 了 PATCH /api/organizations/[id]/members/[profileId] 的 isDeptAdmin 授權邊界（org
 * admin/system admin 可以、純 dept_admin 與一般成員不行、缺 orgUnitId 會被拒）。
 *
 * 在這之前，產品完全沒有任何畫面能把一個成員設成 dept_admin ——
 * 這支測試用真實瀏覽器把 OrgMembersPanel.tsx 新增的「設為部門管理員」/「取消」按鈕
 * 實際點過一次，確認它真的呼叫得到、畫面真的更新。
 *
 * 用法（一定要帶 chromium-headed 專案才會跳出瀏覽器視窗）：
 *   npx playwright test e2e/b2b_dept_admin_ui_flow.spec.ts --project=chromium-headed
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

/** 跟 e2e/b2b_admin_ui_flow.spec.ts / e2e/b2b_license_panel_ui_flow.spec.ts 同一套登入流程。 */
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

test.describe('dept_admin 指派 — 真實瀏覽器操作流程', () => {
  test('設為部門管理員 → 取消 → 還原原本角色', async ({ page }) => {
    test.setTimeout(120000);

    const RUN_TAG = `e2e-deptadmin-${Date.now()}`;
    const memberEmail = `${RUN_TAG}-member@example.com`;

    const org = await createOrganization({
      name: `E2E 部門管理員驗證組織 ${RUN_TAG}`,
      planTier: 'business',
      maxSeats: 5,
      billingEmail: `billing-${RUN_TAG}@example.com`
    });

    const unit = await createOrgUnit({ orgId: org.id, name: 'Engineering' });

    const memberId = randomUUID();
    await putProfile({
      id: memberId,
      email: memberEmail,
      firstName: 'DeptAdminE2E',
      lastName: '測試對象',
      role: 'teacher',
      plan: null,
      isB2B: true,
      orgId: org.id,
      orgUnitId: unit.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    page.on('dialog', (dialog) => dialog.accept()); // 「請先指派部門」等 alert() 一律確認

    try {
      await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'Admin');

      await page.goto(`/admin/organizations/${org.id}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: '成員' }).click();
      await expect(page.getByRole('heading', { name: '成員', exact: true })).toBeVisible({ timeout: 10000 });

      const row = page.locator('tr', { hasText: memberEmail });
      await expect(row).toBeVisible({ timeout: 10000 });
      await expect(row).toContainText('teacher');

      await test.step('設為部門管理員', async () => {
        const promoteResponsePromise = page.waitForResponse(
          (r) => r.url().includes(`/api/organizations/${org.id}/members/${memberId}`) && r.request().method() === 'PATCH'
        );
        await row.getByRole('button', { name: '設為部門管理員' }).click();
        const promoteResponse = await promoteResponsePromise;
        expect(promoteResponse.ok(), '設為部門管理員 API 回應 2xx').toBeTruthy();
        const promoteData = await promoteResponse.json();
        expect(promoteData.profile?.role, 'API 回傳 role 已變成 dept_admin').toBe('dept_admin');

        await expect(row).toContainText('部門管理員', { timeout: 10000 });
      });

      await test.step('取消 → 還原成原本的 teacher 角色', async () => {
        const revokeResponsePromise = page.waitForResponse(
          (r) => r.url().includes(`/api/organizations/${org.id}/members/${memberId}`) && r.request().method() === 'PATCH'
        );
        await row.getByRole('button', { name: '取消' }).click();
        const revokeResponse = await revokeResponsePromise;
        expect(revokeResponse.ok(), '取消 API 回應 2xx').toBeTruthy();
        const revokeData = await revokeResponse.json();
        expect(revokeData.profile?.role, 'API 回傳 role 已還原成 teacher').toBe('teacher');

        await expect(row).toContainText('teacher', { timeout: 10000 });
        // 「設為部門管理員」按鈕文字本身就含有「部門管理員」四個字，所以不能用
        // not.toContainText 判斷是否還原——改成直接確認「取消」按鈕消失、
        // 「設為部門管理員」按鈕重新出現，這才是真正區分兩種狀態的依據。
        await expect(row.getByRole('button', { name: '取消' })).toHaveCount(0);
        await expect(row.getByRole('button', { name: '設為部門管理員' })).toBeVisible();
      });

      const persisted = await getProfileById(memberId);
      expect((persisted as any)?.role, 'DynamoDB 裡的 role 真的還原了，不只是畫面顯示').toBe('teacher');
      expect((persisted as any)?.previousRole, 'previousRole 在還原後已被清除').toBeUndefined();
    } finally {
      console.log('\n--- cleanup ---');
      try {
        await ddbDocClient.send(new DeleteCommand({ TableName: PROFILES_TABLE, Key: { id: memberId } }));
      } catch (e: any) {
        console.warn(`  ⚠️ failed to delete profile ${memberId}: ${e.message}`);
      }
      try {
        await deleteOrgUnit(unit.id, true);
      } catch (e: any) {
        console.warn(`  ⚠️ failed to delete org unit ${unit.id}: ${e.message}`);
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

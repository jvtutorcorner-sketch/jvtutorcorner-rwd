import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../lib/dynamo';
import { putProfile, PROFILES_TABLE } from '../lib/profilesService';
import { createSession, deleteSession } from '../lib/auth/sessionManager';
import organizationService from '../lib/organizationService';
import orgUnitService from '../lib/orgUnitService';

/**
 * B2B-07 跨租戶隔離 — 真實 HTTP 請求層驗證
 *
 * docs/b2b-b2c-module-matrix.md 把這個模組標成 BLOCKED，理由是「SessionPayload 沒有
 * tenantId，且沒有真實的 Org A / Org B SSO fixture」。但實際讀完 lib/auth/orgAccess.ts
 * 後發現：這個專案的組織權限判斷不是靠 session 帶的 tenant 宣告，而是每個請求都重新從
 * DynamoDB 查 profile.orgId/isOrgAdmin（resolveOrgActor），client 端完全無法偽造。也就是
 * 說加 tenantId 到 SessionPayload 不會提升安全性——真正缺的是一支「兩個真實登入 session
 * 對打真實 HTTP API」的證據，而不是 requireOrgAccess() 的單元測試（那部分已經被
 * scripts/verify-b2b-access-orgunits.mjs 涵蓋）。
 *
 * 這支測試建立兩個真實組織 Org A / Org B，各自的組織管理員都用真實簽名的 session token
 * （lib/auth/sessionManager.createSession，跟真的登入完全同一套）以真實 fetch 打
 * 對方組織的 API，驗證：
 *   1. Org A 管理員讀/寫 Org B 的組織、部門、成員、授權 — 一律 403
 *   2. Org A 管理員讀/寫「自己」的組織 — 正常成功（正對照，避免 guard 壞掉變成全擋）
 *
 * 用法：
 *   npx playwright test e2e/b2b_cross_tenant_isolation.spec.ts --project=chromium-headless
 */

test.describe('B2B 跨租戶隔離 — 真實 HTTP API 驗證', () => {
  test('Org A 管理員無法讀寫 Org B 的任何資源', async ({ request, baseURL }) => {
    test.setTimeout(120000);

    const RUN_TAG = `xtenant-${Date.now()}`;
    let orgA: Awaited<ReturnType<typeof organizationService.createOrganization>> | null = null;
    let orgB: Awaited<ReturnType<typeof organizationService.createOrganization>> | null = null;
    let unitB: Awaited<ReturnType<typeof orgUnitService.createOrgUnit>> | null = null;
    const profileAId = randomUUID();
    const profileBId = randomUUID();
    let tokenA: string | null = null;
    let tokenB: string | null = null;

    try {
      orgA = await organizationService.createOrganization({
        name: `Cross-Tenant Org A ${RUN_TAG}`,
        planTier: 'business',
        maxSeats: 5,
        billingEmail: `billing-a-${RUN_TAG}@example.com`
      });
      orgB = await organizationService.createOrganization({
        name: `Cross-Tenant Org B ${RUN_TAG}`,
        planTier: 'business',
        maxSeats: 5,
        billingEmail: `billing-b-${RUN_TAG}@example.com`
      });
      unitB = await orgUnitService.createOrgUnit({ orgId: orgB.id, name: 'Org B Root Unit' });

      await putProfile({
        id: profileAId,
        email: `${RUN_TAG}-admin-a@example.com`,
        firstName: 'Admin',
        lastName: 'A',
        role: 'student',
        plan: null as any,
        isB2B: true,
        orgId: orgA.id,
        isOrgAdmin: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as any);
      await putProfile({
        id: profileBId,
        email: `${RUN_TAG}-admin-b@example.com`,
        firstName: 'Admin',
        lastName: 'B',
        role: 'student',
        plan: null as any,
        isB2B: true,
        orgId: orgB.id,
        isOrgAdmin: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as any);

      // 跟真正的登入流程走同一支 createSession — 不是用假造的物件繞過驗證。
      tokenA = await createSession({
        userId: profileAId,
        email: `${RUN_TAG}-admin-a@example.com`,
        role: 'student',
        plan: 'free'
      });
      tokenB = await createSession({
        userId: profileBId,
        email: `${RUN_TAG}-admin-b@example.com`,
        role: 'student',
        plan: 'free'
      });

      const asA = { headers: { Cookie: `session=${tokenA}` } };

      await test.step('Org A 讀取 Org B 詳情 -> 403', async () => {
        const res = await request.get(`${baseURL}/api/organizations/${orgB!.id}`, asA);
        expect(res.status()).toBe(403);
      });

      await test.step('Org A 改 Org B 詳情 -> 403', async () => {
        const res = await request.patch(`${baseURL}/api/organizations/${orgB!.id}`, {
          ...asA,
          data: { name: 'hijacked by org A' }
        });
        expect(res.status()).toBe(403);
      });

      await test.step('Org A 列出 Org B 成員 -> 403', async () => {
        const res = await request.get(`${baseURL}/api/organizations/${orgB!.id}/members`, asA);
        expect(res.status()).toBe(403);
      });

      await test.step('Org A 把自己加進 Org B -> 403', async () => {
        const res = await request.post(`${baseURL}/api/organizations/${orgB!.id}/members`, {
          ...asA,
          data: { profileId: profileAId }
        });
        expect(res.status()).toBe(403);
      });

      await test.step('Org A 移除 Org B 的成員 -> 403', async () => {
        const res = await request.delete(
          `${baseURL}/api/organizations/${orgB!.id}/members/${profileBId}`,
          asA
        );
        expect(res.status()).toBe(403);
      });

      await test.step('Org A 讀取 Org B 的部門 -> 403', async () => {
        const res = await request.get(`${baseURL}/api/org-units?orgId=${orgB!.id}`, asA);
        expect(res.status()).toBe(403);
      });

      await test.step('Org A 在 Org B 底下建部門 -> 403', async () => {
        const res = await request.post(`${baseURL}/api/org-units`, {
          ...asA,
          data: { orgId: orgB!.id, name: 'hijacked unit' }
        });
        expect(res.status()).toBe(403);
      });

      await test.step('Org A 搬移 Org B 的部門 -> 403', async () => {
        const res = await request.post(`${baseURL}/api/org-units/${unitB!.id}/move`, {
          ...asA,
          data: { newParentId: null }
        });
        expect(res.status()).toBe(403);
      });

      await test.step('Org A 刪除 Org B 的部門 -> 403', async () => {
        const res = await request.delete(`${baseURL}/api/org-units/${unitB!.id}`, asA);
        expect(res.status()).toBe(403);
      });

      await test.step('Org A 查詢 Org B 的授權清單 -> 403', async () => {
        const res = await request.get(`${baseURL}/api/licenses?orgId=${orgB!.id}`, asA);
        expect(res.status()).toBe(403);
      });

      await test.step('Org A 核發 Org B 的授權 -> 403', async () => {
        const res = await request.post(`${baseURL}/api/licenses`, { ...asA, data: { orgId: orgB!.id } });
        expect(res.status()).toBe(403);
      });

      // 正對照：同一組 guard，Org A 管理員操作自己的組織必須正常成功——
      // 證明前面一連串 403 是「正確拒絕跨租戶」，不是 guard 本身壞掉、對誰都擋。
      await test.step('正對照：Org A 讀取自己的組織 -> 200', async () => {
        const res = await request.get(`${baseURL}/api/organizations/${orgA!.id}`, asA);
        expect(res.status()).toBe(200);
      });

      await test.step('正對照：Org A 讀取自己的部門 -> 200', async () => {
        const res = await request.get(`${baseURL}/api/org-units?orgId=${orgA!.id}`, asA);
        expect(res.status()).toBe(200);
      });
    } finally {
      console.log('\n--- cleanup ---');
      if (tokenA) await deleteSession(tokenA).catch(() => {});
      if (tokenB) await deleteSession(tokenB).catch(() => {});
      for (const id of [profileAId, profileBId]) {
        await ddbDocClient.send(new DeleteCommand({ TableName: PROFILES_TABLE, Key: { id } })).catch(() => {});
      }
      if (unitB) await orgUnitService.deleteOrgUnit(unitB.id, true).catch(() => {});
      if (orgA) await organizationService.deleteOrganization(orgA.id, true).catch(() => {});
      if (orgB) await organizationService.deleteOrganization(orgB.id, true).catch(() => {});
      console.log('cleanup done.');
    }
  });
});

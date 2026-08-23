import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../lib/dynamo';
import { putProfile, PROFILES_TABLE } from '../lib/profilesService';
import { createSession, deleteSession } from '../lib/auth/sessionManager';
import organizationService from '../lib/organizationService';
import orgUnitService from '../lib/orgUnitService';
import orgMembershipService from '../lib/orgMembershipService';

/**
 * B2B-06 dept_admin 部門/子部門範圍 — 真實 HTTP 請求層驗證
 *
 * docs/b2b-b2c-module-matrix.md 原本引用 scripts/verify-b2b-dept-admin-scope.mjs 作為這個
 * 模組的測試證據，但那支腳本從來沒被建立過——dept_admin 這個角色連 lib/auth/orgAccess.ts
 * 裡都完全不存在（只有 isSystemAdmin / isOrgAdmin 兩層）。這支測試對應的是新加的
 * ProfileB2B.isDeptAdmin / deptAdminUnitId 欄位、orgAccess.ts 的 requireOrgUnitAccess /
 * requireOrgOrDeptAccess，以及 org-units、organizations members 路由的部門範圍過濾。
 *
 * 組織架構：
 *   Org A
 *     Engineering (dept admin 的管理範圍)
 *       └─ Backend        ← 子部門，應在範圍內
 *     Sales                ← 兄弟部門，應在範圍外
 *   Org B
 *     OrgB Unit             ← 跨組織，應在範圍外
 *
 * 用法：
 *   npx playwright test e2e/b2b_dept_admin_scope.spec.ts --project=chromium-headless
 */

test.describe('B2B dept_admin 部門範圍 — 真實 HTTP API 驗證', () => {
  test('部門管理員只能管理自己與子部門，範圍以外一律拒絕；範圍隨部門搬移動態重算', async ({
    request,
    baseURL
  }) => {
    test.setTimeout(120000);

    const RUN_TAG = `deptadmin-${Date.now()}`;
    let orgA: Awaited<ReturnType<typeof organizationService.createOrganization>> | null = null;
    let orgB: Awaited<ReturnType<typeof organizationService.createOrganization>> | null = null;
    let unitEng: Awaited<ReturnType<typeof orgUnitService.createOrgUnit>> | null = null;
    let unitBackend: Awaited<ReturnType<typeof orgUnitService.createOrgUnit>> | null = null;
    let unitSales: Awaited<ReturnType<typeof orgUnitService.createOrgUnit>> | null = null;
    let unitOrgB: Awaited<ReturnType<typeof orgUnitService.createOrgUnit>> | null = null;

    const deptAdminId = randomUUID();
    const orgAdminId = randomUUID();
    const memberInBackendId = randomUUID();
    const memberInSalesId = randomUUID();
    const spareProfileId = randomUUID();
    const profileIds = [deptAdminId, orgAdminId, memberInBackendId, memberInSalesId, spareProfileId];

    let deptAdminToken: string | null = null;
    let orgAdminToken: string | null = null;
    const createdUnitIds: string[] = [];

    try {
      orgA = await organizationService.createOrganization({
        name: `Dept Admin Org A ${RUN_TAG}`,
        planTier: 'business',
        maxSeats: 10,
        billingEmail: `billing-a-${RUN_TAG}@example.com`
      });
      orgB = await organizationService.createOrganization({
        name: `Dept Admin Org B ${RUN_TAG}`,
        planTier: 'business',
        maxSeats: 5,
        billingEmail: `billing-b-${RUN_TAG}@example.com`
      });

      unitEng = await orgUnitService.createOrgUnit({ orgId: orgA.id, name: 'Engineering' });
      unitBackend = await orgUnitService.createOrgUnit({ orgId: orgA.id, name: 'Backend', parentId: unitEng.id });
      unitSales = await orgUnitService.createOrgUnit({ orgId: orgA.id, name: 'Sales' });
      unitOrgB = await orgUnitService.createOrgUnit({ orgId: orgB.id, name: 'OrgB Unit' });
      createdUnitIds.push(unitEng.id, unitBackend.id, unitSales.id, unitOrgB.id);

      const now = new Date().toISOString();
      await putProfile({
        id: deptAdminId,
        email: `${RUN_TAG}-dept-admin@example.com`,
        firstName: 'Dept',
        lastName: 'Admin',
        role: 'student',
        plan: null,
        isB2B: true,
        orgId: orgA.id,
        orgUnitId: unitEng.id,
        isDeptAdmin: true,
        deptAdminUnitId: unitEng.id,
        createdAt: now,
        updatedAt: now
      } as any);
      await putProfile({
        id: orgAdminId,
        email: `${RUN_TAG}-org-admin@example.com`,
        firstName: 'Org',
        lastName: 'Admin',
        role: 'student',
        plan: null,
        isB2B: true,
        orgId: orgA.id,
        isOrgAdmin: true,
        createdAt: now,
        updatedAt: now
      } as any);
      await putProfile({
        id: spareProfileId,
        email: `${RUN_TAG}-spare@example.com`,
        firstName: 'Spare',
        lastName: 'User',
        role: 'student',
        plan: 'free',
        isB2B: false,
        createdAt: now,
        updatedAt: now
      } as any);

      // memberInBackend / memberInSales go through the real assign transaction (consumes a
      // real seat + license) so the "member list filtering" and "remove" checks operate on
      // fully real B2B members, not hand-rolled profile rows. The bare profile row has to
      // exist BEFORE assignMemberWithLicense runs (it does getProfileById as part of the
      // transaction pre-check) — org fields are then set by the transaction itself, not here.
      await putProfile({
        id: memberInBackendId,
        email: `${RUN_TAG}-member-backend@example.com`,
        firstName: 'Member',
        lastName: 'Backend',
        role: 'student',
        plan: 'free',
        isB2B: false,
        createdAt: now,
        updatedAt: now
      } as any);
      await putProfile({
        id: memberInSalesId,
        email: `${RUN_TAG}-member-sales@example.com`,
        firstName: 'Member',
        lastName: 'Sales',
        role: 'student',
        plan: 'free',
        isB2B: false,
        createdAt: now,
        updatedAt: now
      } as any);
      await orgMembershipService.assignMemberWithLicense({
        orgId: orgA.id,
        profileId: memberInBackendId,
        orgUnitId: unitBackend.id,
        assignedBy: 'test-setup'
      });
      await orgMembershipService.assignMemberWithLicense({
        orgId: orgA.id,
        profileId: memberInSalesId,
        orgUnitId: unitSales.id,
        assignedBy: 'test-setup'
      });

      deptAdminToken = await createSession({
        userId: deptAdminId,
        email: `${RUN_TAG}-dept-admin@example.com`,
        role: 'student',
        plan: 'free'
      });
      orgAdminToken = await createSession({
        userId: orgAdminId,
        email: `${RUN_TAG}-org-admin@example.com`,
        role: 'student',
        plan: 'free'
      });

      const asDeptAdmin = { headers: { Cookie: `session=${deptAdminToken}` } };
      const asOrgAdmin = { headers: { Cookie: `session=${orgAdminToken}` } };

      await test.step('自己的部門 -> 200', async () => {
        const res = await request.get(`${baseURL}/api/org-units/${unitEng!.id}`, asDeptAdmin);
        expect(res.status()).toBe(200);
      });

      await test.step('子部門 -> 200', async () => {
        const res = await request.get(`${baseURL}/api/org-units/${unitBackend!.id}`, asDeptAdmin);
        expect(res.status()).toBe(200);
      });

      await test.step('兄弟部門 -> 403', async () => {
        const res = await request.get(`${baseURL}/api/org-units/${unitSales!.id}`, asDeptAdmin);
        expect(res.status()).toBe(403);
      });

      await test.step('跨組織部門 -> 403', async () => {
        const res = await request.get(`${baseURL}/api/org-units/${unitOrgB!.id}`, asDeptAdmin);
        expect(res.status()).toBe(403);
      });

      await test.step('列出組織單位 -> 只看得到自己與子部門，看不到 Sales', async () => {
        const res = await request.get(`${baseURL}/api/org-units?orgId=${orgA!.id}`, asDeptAdmin);
        expect(res.status()).toBe(200);
        const data = await res.json();
        const ids = (data.orgUnits || []).map((u: any) => u.id);
        expect(ids).toContain(unitEng!.id);
        expect(ids).toContain(unitBackend!.id);
        expect(ids).not.toContain(unitSales!.id);
      });

      await test.step('在子部門底下建立新單位 -> 201', async () => {
        const res = await request.post(`${baseURL}/api/org-units`, {
          ...asDeptAdmin,
          data: { orgId: orgA!.id, name: 'Backend-Sub', parentId: unitBackend!.id }
        });
        expect(res.status()).toBe(201);
        const data = await res.json();
        createdUnitIds.push(data.orgUnit.id);
      });

      await test.step('建立組織根層級單位 -> 403（部門管理員不能做組織層級重組）', async () => {
        const res = await request.post(`${baseURL}/api/org-units`, {
          ...asDeptAdmin,
          data: { orgId: orgA!.id, name: 'Root Level Unit', parentId: null }
        });
        expect(res.status()).toBe(403);
      });

      await test.step('在兄弟部門底下建立新單位 -> 403', async () => {
        const res = await request.post(`${baseURL}/api/org-units`, {
          ...asDeptAdmin,
          data: { orgId: orgA!.id, name: 'Sales-Sub', parentId: unitSales!.id }
        });
        expect(res.status()).toBe(403);
      });

      await test.step('修改兄弟部門 -> 403', async () => {
        const res = await request.patch(`${baseURL}/api/org-units/${unitSales!.id}`, {
          ...asDeptAdmin,
          data: { name: 'hijacked' }
        });
        expect(res.status()).toBe(403);
      });

      await test.step('刪除兄弟部門 -> 403', async () => {
        const res = await request.delete(`${baseURL}/api/org-units/${unitSales!.id}`, asDeptAdmin);
        expect(res.status()).toBe(403);
      });

      await test.step('把子部門搬到兄弟部門底下 -> 403（目的地不在範圍內）', async () => {
        const res = await request.post(`${baseURL}/api/org-units/${unitBackend!.id}/move`, {
          ...asDeptAdmin,
          data: { newParentId: unitSales!.id }
        });
        expect(res.status()).toBe(403);
      });

      await test.step('把子部門搬到組織根層級 -> 403', async () => {
        const res = await request.post(`${baseURL}/api/org-units/${unitBackend!.id}/move`, {
          ...asDeptAdmin,
          data: { newParentId: null }
        });
        expect(res.status()).toBe(403);
      });

      await test.step('列出組織成員 -> 只看得到範圍內的人', async () => {
        const res = await request.get(`${baseURL}/api/organizations/${orgA!.id}/members`, asDeptAdmin);
        expect(res.status()).toBe(200);
        const data = await res.json();
        const ids = (data.members || []).map((m: any) => m.id);
        expect(ids).toContain(memberInBackendId);
        expect(ids).not.toContain(memberInSalesId);
      });

      await test.step('加入成員但不指定部門 -> 403', async () => {
        const res = await request.post(`${baseURL}/api/organizations/${orgA!.id}/members`, {
          ...asDeptAdmin,
          data: { profileId: spareProfileId }
        });
        expect(res.status()).toBe(403);
      });

      await test.step('把成員加到兄弟部門 -> 403', async () => {
        const res = await request.post(`${baseURL}/api/organizations/${orgA!.id}/members`, {
          ...asDeptAdmin,
          data: { profileId: spareProfileId, orgUnitId: unitSales!.id }
        });
        expect(res.status()).toBe(403);
      });

      await test.step('把成員加到自己的子部門 -> 201', async () => {
        const res = await request.post(`${baseURL}/api/organizations/${orgA!.id}/members`, {
          ...asDeptAdmin,
          data: { profileId: spareProfileId, orgUnitId: unitBackend!.id }
        });
        expect(res.status()).toBe(201);
      });

      await test.step('移除範圍外的成員 -> 403', async () => {
        const res = await request.delete(
          `${baseURL}/api/organizations/${orgA!.id}/members/${memberInSalesId}`,
          asDeptAdmin
        );
        expect(res.status()).toBe(403);
      });

      await test.step('移除範圍內的成員 -> 200', async () => {
        const res = await request.delete(
          `${baseURL}/api/organizations/${orgA!.id}/members/${spareProfileId}`,
          asDeptAdmin
        );
        expect(res.status()).toBe(200);
      });

      await test.step('部門管理員不能把 isOrgAdmin 授予別人 -> 403', async () => {
        const res = await request.patch(`${baseURL}/api/organizations/${orgA!.id}/members/${memberInBackendId}`, {
          ...asDeptAdmin,
          data: { isOrgAdmin: true }
        });
        expect(res.status()).toBe(403);
      });

      await test.step('部門管理員不能把 isDeptAdmin 授予別人（無法自我擴權/橫向授權） -> 403', async () => {
        const res = await request.patch(`${baseURL}/api/organizations/${orgA!.id}/members/${memberInBackendId}`, {
          ...asDeptAdmin,
          data: { isDeptAdmin: true, deptAdminUnitId: unitBackend!.id }
        });
        expect(res.status()).toBe(403);
      });

      // 正對照：組織管理員本來就該無視部門邊界。
      await test.step('正對照：組織管理員讀取 Sales -> 200', async () => {
        const res = await request.get(`${baseURL}/api/org-units/${unitSales!.id}`, asOrgAdmin);
        expect(res.status()).toBe(200);
      });

      await test.step('正對照：組織管理員可以把部門管理員身分授予別人 -> 200', async () => {
        const res = await request.patch(`${baseURL}/api/organizations/${orgA!.id}/members/${memberInBackendId}`, {
          ...asOrgAdmin,
          data: { isDeptAdmin: true, deptAdminUnitId: unitBackend!.id }
        });
        expect(res.status()).toBe(200);
        // 收回，避免影響後面的清理判斷
        await request.patch(`${baseURL}/api/organizations/${orgA!.id}/members/${memberInBackendId}`, {
          ...asOrgAdmin,
          data: { isDeptAdmin: false }
        });
      });

      // 關鍵：範圍是用 orgUnit.path 前綴動態算的，不是寫死的清單——組織管理員把 Sales
      // 搬到 Engineering 底下之後，部門管理員完全不用重新授權，範圍就該自動涵蓋 Sales。
      await test.step('組織管理員把 Sales 搬到 Engineering 底下', async () => {
        const res = await request.post(`${baseURL}/api/org-units/${unitSales!.id}/move`, {
          ...asOrgAdmin,
          data: { newParentId: unitEng!.id }
        });
        expect(res.status()).toBe(200);
      });

      await test.step('搬移後，部門管理員的範圍自動涵蓋 Sales（不用重新授權） -> 200', async () => {
        const res = await request.get(`${baseURL}/api/org-units/${unitSales!.id}`, asDeptAdmin);
        expect(res.status()).toBe(200);
      });
    } finally {
      console.log('\n--- cleanup ---');
      if (deptAdminToken) await deleteSession(deptAdminToken).catch(() => {});
      if (orgAdminToken) await deleteSession(orgAdminToken).catch(() => {});

      // 先把成員移出（釋放席次/授權），再刪部門單位，最後刪組織——順序反過來會因為
      // 「有子部門不能 hard delete」或外鍵式的資料不一致而失敗。
      for (const profileId of [memberInBackendId, memberInSalesId, spareProfileId]) {
        await orgMembershipService.removeMemberFromOrg({ orgId: orgA!.id, profileId }).catch(() => {});
      }
      for (const id of profileIds) {
        await ddbDocClient.send(new DeleteCommand({ TableName: PROFILES_TABLE, Key: { id } })).catch(() => {});
      }
      // 測試過程中把 Sales 搬到 Engineering 底下、又額外建了 Backend-Sub，最終樹狀結構跟
      // 一開始不一樣了——用「重試到全部刪完」而不是猜路徑深度，避免「有子部門不能 hard
      // delete」用錯誤的順序擋下清理。
      let remaining = [...new Set(createdUnitIds)];
      for (let round = 0; round < remaining.length + 1 && remaining.length > 0; round++) {
        const stillFailing: string[] = [];
        for (const id of remaining) {
          try {
            await orgUnitService.deleteOrgUnit(id, true);
          } catch {
            stillFailing.push(id);
          }
        }
        remaining = stillFailing;
      }
      if (orgA) await organizationService.deleteOrganization(orgA.id, true).catch(() => {});
      if (orgB) await organizationService.deleteOrganization(orgB.id, true).catch(() => {});
      console.log('cleanup done.');
    }
  });
});

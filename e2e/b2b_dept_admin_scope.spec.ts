import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../lib/dynamo';
import { createOrganization, deleteOrganization } from '../lib/organizationService';
import { PROFILES_TABLE, putProfile } from '../lib/profilesService';
import {
  requireOrgUnitAccess,
  filterOrgUnitsForActor,
  requireMemberScopeAccess,
  filterMembersForActor,
  requireOrgAccess,
  resolveOrgActor,
  type OrgActor,
} from '../lib/auth/orgAccess';
import { createOrgUnit, getOrgUnitById, deleteOrgUnit } from '../lib/orgUnitService';
import type { Session } from '../lib/auth/sessionManager';
import type { OrgUnit } from '../lib/types/b2b';

/**
 * dept_admin orgUnit scope — 之前 docs/b2b-access-orgunit-manual-test-guide.md 與
 * .agents/skills/b2b-tenant-isolation/SKILL.md 都明確標記「apiGuard 沒有 scope 概念，
 * dept_admin 子部門範圍完全沒有實作」。這支測試驗證 lib/auth/orgAccess.ts 新增的
 * requireOrgUnitAccess / filterOrgUnitsForActor / requireMemberScopeAccess /
 * filterMembersForActor 這四個函式，是實際擋在 app/api/org-units/** 與
 * app/api/organizations/[id]/members/** 前面的守門邏輯（不是走瀏覽器 UI ——
 * 產品目前沒有任何畫面能把某個成員設成 dept_admin + 指定 orgUnitId，
 * 所以這裡直接對 guard 函式本身斷言，而不是假裝有一個可以點的畫面）。
 *
 * 對應直接可執行的無頭版本：scripts/verify-b2b-dept-admin-scope.mjs（同一組斷言）。
 */

const RUN_TAG = `dept-admin-e2e-${Date.now()}`;

function fakeSession(userId: string, role: string): Session {
  return {
    sessionId: `test-${userId}`,
    userId,
    email: `${userId}@${RUN_TAG}.test`,
    role,
    plan: 'system',
    createdAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
}

function fakeReq(session: Session) {
  return { session } as any;
}

async function makeProfile(tag: string, fields: Record<string, any>) {
  const id = randomUUID();
  const profile = {
    id,
    email: `${tag}-${RUN_TAG}@${RUN_TAG}.test`,
    firstName: 'DeptAdminE2E',
    lastName: tag,
    role: 'student',
    plan: 'basic',
    isB2B: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...fields,
  };
  await putProfile(profile);
  return profile;
}

let orgA: any;
let orgB: any;
let engineering: OrgUnit;
let backend: OrgUnit;
let backendApi: OrgUnit;
let frontend: OrgUnit;
let sales: OrgUnit;
let unitInOrgB: OrgUnit;
let deptAdmin: any;
let memberInScope: any;
let memberOutOfScope: any;
let memberNoUnit: any;

const createdProfileIds: string[] = [];
const createdUnitIds: string[] = [];

test.describe.configure({ mode: 'serial' });

test.describe('B2B dept_admin orgUnit scope (lib/auth/orgAccess.ts)', () => {
  test.beforeAll(async () => {
    orgA = await createOrganization({
      name: `Dept Admin E2E Org A ${RUN_TAG}`,
      planTier: 'business',
      maxSeats: 10,
      billingEmail: `billing-a@${RUN_TAG}.test`,
    });
    orgB = await createOrganization({
      name: `Dept Admin E2E Org B ${RUN_TAG}`,
      planTier: 'business',
      maxSeats: 5,
      billingEmail: `billing-b@${RUN_TAG}.test`,
    });

    // Engineering (root) -> Backend -> Backend-API; Frontend is a sibling of Backend;
    // Sales is an unrelated root. dept_admin is scoped to Backend.
    engineering = await createOrgUnit({ orgId: orgA.id, name: 'Engineering' });
    backend = await createOrgUnit({ orgId: orgA.id, name: 'Backend', parentId: engineering.id });
    backendApi = await createOrgUnit({ orgId: orgA.id, name: 'Backend-API', parentId: backend.id });
    frontend = await createOrgUnit({ orgId: orgA.id, name: 'Frontend', parentId: engineering.id });
    sales = await createOrgUnit({ orgId: orgA.id, name: 'Sales' });
    unitInOrgB = await createOrgUnit({ orgId: orgB.id, name: 'OrgB-Unit' });
    createdUnitIds.push(engineering.id, backend.id, backendApi.id, frontend.id, sales.id, unitInOrgB.id);

    deptAdmin = await makeProfile('deptAdminBackend', { role: 'dept_admin', orgId: orgA.id, orgUnitId: backend.id });
    memberInScope = await makeProfile('memberBackendApi', { orgId: orgA.id, orgUnitId: backendApi.id });
    memberOutOfScope = await makeProfile('memberFrontend', { orgId: orgA.id, orgUnitId: frontend.id });
    memberNoUnit = await makeProfile('memberNoUnit', { orgId: orgA.id, orgUnitId: null });
    createdProfileIds.push(deptAdmin.id, memberInScope.id, memberOutOfScope.id, memberNoUnit.id);
  });

  test.afterAll(async () => {
    const remaining = new Set(createdUnitIds);
    for (let pass = 0; pass < 4 && remaining.size > 0; pass++) {
      for (const unitId of [...remaining].reverse()) {
        const stillExists = await getOrgUnitById(unitId).catch(() => null);
        if (!stillExists) {
          remaining.delete(unitId);
          continue;
        }
        try {
          await deleteOrgUnit(unitId, true);
          remaining.delete(unitId);
        } catch {
          // still has children this pass
        }
      }
    }
    for (const profileId of createdProfileIds) {
      await ddbDocClient.send(new DeleteCommand({ TableName: PROFILES_TABLE, Key: { id: profileId } })).catch(() => {});
    }
    await deleteOrganization(orgA.id, true).catch(() => {});
    await deleteOrganization(orgB.id, true).catch(() => {});
  });

  test('dept_admin can read/write own unit and descendants', async () => {
    const req = fakeReq(fakeSession(deptAdmin.id, 'dept_admin'));
    expect((await requireOrgUnitAccess(req, backend, 'read')).ok).toBe(true);
    expect((await requireOrgUnitAccess(req, backend, 'write')).ok).toBe(true);
    expect((await requireOrgUnitAccess(req, backendApi, 'read')).ok).toBe(true);
  });

  test('dept_admin cannot read sibling, parent, unrelated, or cross-org units', async () => {
    const req = fakeReq(fakeSession(deptAdmin.id, 'dept_admin'));

    const sibling = await requireOrgUnitAccess(req, frontend, 'read');
    expect(sibling.ok).toBe(false);
    if (!sibling.ok) expect(sibling.response.status).toBe(403);

    const parent = await requireOrgUnitAccess(req, engineering, 'read');
    expect(parent.ok).toBe(false);
    if (!parent.ok) expect(parent.response.status).toBe(403);

    const unrelated = await requireOrgUnitAccess(req, sales, 'write');
    expect(unrelated.ok).toBe(false);
    if (!unrelated.ok) expect(unrelated.response.status).toBe(403);

    const crossOrg = await requireOrgUnitAccess(req, unitInOrgB, 'read');
    expect(crossOrg.ok).toBe(false);
    if (!crossOrg.ok) expect(crossOrg.response.status).toBe(403);
  });

  test('system admin bypasses orgUnit scope entirely', async () => {
    const req = fakeReq(fakeSession('sys-admin-test', 'admin'));
    expect((await requireOrgUnitAccess(req, sales, 'write')).ok).toBe(true);
  });

  test('filterOrgUnitsForActor returns exactly the dept_admin subtree', async () => {
    const req = fakeReq(fakeSession(deptAdmin.id, 'dept_admin'));
    const actor: OrgActor = await resolveOrgActor(req);
    const filtered = await filterOrgUnitsForActor(actor, [engineering, backend, backendApi, frontend, sales]);
    const ids = new Set(filtered.map((u) => u.id));
    expect(ids.has(backend.id)).toBe(true);
    expect(ids.has(backendApi.id)).toBe(true);
    expect(ids.has(engineering.id)).toBe(false);
    expect(ids.has(frontend.id)).toBe(false);
    expect(ids.has(sales.id)).toBe(false);
    expect(filtered.length).toBe(2);
  });

  test('dept_admin can manage members inside scope, not outside it', async () => {
    const req = fakeReq(fakeSession(deptAdmin.id, 'dept_admin'));
    expect((await requireMemberScopeAccess(req, orgA.id, backendApi.id)).ok).toBe(true);
    expect((await requireMemberScopeAccess(req, orgA.id, backend.id)).ok).toBe(true);

    const outOfScope = await requireMemberScopeAccess(req, orgA.id, frontend.id);
    expect(outOfScope.ok).toBe(false);
    if (!outOfScope.ok) expect(outOfScope.response.status).toBe(403);

    const noUnit = await requireMemberScopeAccess(req, orgA.id, null);
    expect(noUnit.ok).toBe(false);
    if (!noUnit.ok) expect(noUnit.response.status).toBe(403);
  });

  test('filterMembersForActor returns exactly the members inside the dept_admin subtree', async () => {
    const req = fakeReq(fakeSession(deptAdmin.id, 'dept_admin'));
    const actor: OrgActor = await resolveOrgActor(req);
    const members = [
      { id: memberInScope.id, orgUnitId: memberInScope.orgUnitId },
      { id: memberOutOfScope.id, orgUnitId: memberOutOfScope.orgUnitId },
      { id: memberNoUnit.id, orgUnitId: memberNoUnit.orgUnitId },
      { id: deptAdmin.id, orgUnitId: deptAdmin.orgUnitId },
    ];
    const filtered = await filterMembersForActor(actor, orgA.id, members);
    const ids = new Set(filtered.map((m) => m.id));
    expect(ids.has(memberInScope.id)).toBe(true);
    expect(ids.has(deptAdmin.id)).toBe(true);
    expect(ids.has(memberOutOfScope.id)).toBe(false);
    expect(ids.has(memberNoUnit.id)).toBe(false);
  });

  test('dept_admin cannot escalate to org-level access (billing / isOrgAdmin-grant gate)', async () => {
    const req = fakeReq(fakeSession(deptAdmin.id, 'dept_admin'));
    const orgLevel = await requireOrgAccess(req, orgA.id, 'write');
    expect(orgLevel.ok).toBe(false);
    if (!orgLevel.ok) expect(orgLevel.response.status).toBe(403);
  });
});

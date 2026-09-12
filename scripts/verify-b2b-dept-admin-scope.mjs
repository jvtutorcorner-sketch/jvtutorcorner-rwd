// scripts/verify-b2b-dept-admin-scope.mjs
/**
 * Regression script for dept_admin orgUnit scope — the gap explicitly called out as
 * NOT_IMPLEMENTED in docs/b2b-access-orgunit-manual-test-guide.md and
 * .agents/skills/b2b-tenant-isolation/SKILL.md (M2): "apiGuard scope:'orgUnit' 在程式碼中
 * 不存在". This script exercises the actual implementation added in lib/auth/orgAccess.ts:
 *
 *   - requireOrgUnitAccess   — org unit read/write scoped to a dept_admin's own subtree
 *   - filterOrgUnitsForActor — filters an org-wide unit list down to a dept_admin's subtree
 *   - requireMemberScopeAccess — member management scoped to a dept_admin's subtree
 *   - filterMembersForActor  — filters an org-wide member list down to a dept_admin's subtree
 *
 * Runs against the real DynamoDB tables from .env.local (same as
 * verify-b2b-access-orgunits.mjs) and hard-deletes everything it creates in a finally block.
 *
 * Usage:
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2b-dept-admin-scope.mjs
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const { randomUUID } = await import('crypto');
const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
const { ddbDocClient } = await import('../lib/dynamo.ts');
const { createOrganization, deleteOrganization } = await import('../lib/organizationService.ts');
const { PROFILES_TABLE, putProfile } = await import('../lib/profilesService.ts');
const {
  requireOrgUnitAccess,
  filterOrgUnitsForActor,
  requireMemberScopeAccess,
  filterMembersForActor,
  resolveOrgActor,
} = await import('../lib/auth/orgAccess.ts');
const { createOrgUnit, getOrgUnitById, deleteOrgUnit } = await import('../lib/orgUnitService.ts');
const { setMemberDeptAdmin } = await import('../lib/orgMembershipService.ts');
const { getProfileById } = await import('../lib/profilesService.ts');

const RUN_TAG = `deptadmin-${Date.now()}`;

let passCount = 0;
let failCount = 0;

function assert(condition, label) {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${label}`);
  } else {
    failCount++;
    console.error(`  ❌ ${label}`);
  }
}

function fakeReq({ userId, role }) {
  return {
    session: {
      sessionId: `test-${userId}`,
      userId,
      email: `${userId}@${RUN_TAG}.test`,
      role,
      plan: 'system',
      createdAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    },
  };
}

async function makeProfile(tag, fields) {
  const id = randomUUID();
  const profile = {
    id,
    email: `${tag}-${RUN_TAG}@${RUN_TAG}.test`,
    firstName: 'DeptAdminVerify',
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

async function main() {
  console.log(`=== B2B dept_admin orgUnit scope verification (${RUN_TAG}) ===\n`);

  const orgA = await createOrganization({
    name: `Dept Admin Verify Org A ${RUN_TAG}`,
    planTier: 'business',
    maxSeats: 10,
    billingEmail: `billing-a@${RUN_TAG}.test`,
  });
  const orgB = await createOrganization({
    name: `Dept Admin Verify Org B ${RUN_TAG}`,
    planTier: 'business',
    maxSeats: 5,
    billingEmail: `billing-b@${RUN_TAG}.test`,
  });
  console.log(`Created orgA ${orgA.id}, orgB ${orgB.id}. If this script is killed, clean these up manually.\n`);

  const createdProfileIds = [];
  const createdUnitIds = [];

  try {
    // Org A structure:
    //   Engineering (root)
    //     ├── Backend (dept_admin scope root)
    //     │     └── Backend-API (grandchild — in scope)
    //     └── Frontend (sibling — NOT in scope)
    //   Sales (unrelated root — NOT in scope)
    const engineering = await createOrgUnit({ orgId: orgA.id, name: 'Engineering' });
    const backend = await createOrgUnit({ orgId: orgA.id, name: 'Backend', parentId: engineering.id });
    const backendApi = await createOrgUnit({ orgId: orgA.id, name: 'Backend-API', parentId: backend.id });
    const frontend = await createOrgUnit({ orgId: orgA.id, name: 'Frontend', parentId: engineering.id });
    const sales = await createOrgUnit({ orgId: orgA.id, name: 'Sales' });
    const unitInOrgB = await createOrgUnit({ orgId: orgB.id, name: 'OrgB-Unit' });
    createdUnitIds.push(engineering.id, backend.id, backendApi.id, frontend.id, sales.id, unitInOrgB.id);

    const deptAdmin = await makeProfile('deptAdminBackend', {
      role: 'dept_admin',
      orgId: orgA.id,
      orgUnitId: backend.id,
    });
    const memberInScope = await makeProfile('memberBackendApi', { orgId: orgA.id, orgUnitId: backendApi.id });
    const memberOutOfScope = await makeProfile('memberFrontend', { orgId: orgA.id, orgUnitId: frontend.id });
    const memberNoUnit = await makeProfile('memberNoUnit', { orgId: orgA.id, orgUnitId: null });
    createdProfileIds.push(deptAdmin.id, memberInScope.id, memberOutOfScope.id, memberNoUnit.id);

    const deptAdminReq = fakeReq({ userId: deptAdmin.id, role: 'dept_admin' });
    const sysAdminReq = fakeReq({ userId: 'sys-admin-test', role: 'admin' });

    // ==================================================================
    // requireOrgUnitAccess
    // ==================================================================
    console.log('--- requireOrgUnitAccess ---');

    assert(
      (await requireOrgUnitAccess(deptAdminReq, backend, 'read')).ok === true,
      'dept_admin: read own unit -> ok'
    );
    assert(
      (await requireOrgUnitAccess(deptAdminReq, backend, 'write')).ok === true,
      'dept_admin: write own unit -> ok'
    );
    assert(
      (await requireOrgUnitAccess(deptAdminReq, backendApi, 'read')).ok === true,
      'dept_admin: read descendant unit (grandchild) -> ok'
    );
    const siblingResult = await requireOrgUnitAccess(deptAdminReq, frontend, 'read');
    assert(
      siblingResult.ok === false && siblingResult.response.status === 403,
      'dept_admin: read sibling unit (Frontend, same parent) -> 403'
    );
    const parentResult = await requireOrgUnitAccess(deptAdminReq, engineering, 'read');
    assert(
      parentResult.ok === false && parentResult.response.status === 403,
      'dept_admin: read own parent unit -> 403 (scope is downward-only, not upward)'
    );
    const unrelatedResult = await requireOrgUnitAccess(deptAdminReq, sales, 'write');
    assert(
      unrelatedResult.ok === false && unrelatedResult.response.status === 403,
      'dept_admin: write unrelated root unit (Sales) -> 403'
    );
    const crossOrgResult = await requireOrgUnitAccess(deptAdminReq, unitInOrgB, 'read');
    assert(
      crossOrgResult.ok === false && crossOrgResult.response.status === 403,
      'dept_admin: read a unit in a different organization -> 403'
    );
    assert(
      (await requireOrgUnitAccess(sysAdminReq, sales, 'write')).ok === true,
      'system admin: write any unit regardless of scope -> ok'
    );

    // ==================================================================
    // filterOrgUnitsForActor
    // ==================================================================
    console.log('\n--- filterOrgUnitsForActor ---');

    const deptAdminActor = await resolveOrgActor(deptAdminReq);
    const allUnits = [engineering, backend, backendApi, frontend, sales];
    const filtered = await filterOrgUnitsForActor(deptAdminActor, allUnits);
    const filteredIds = new Set(filtered.map((u) => u.id));
    assert(
      filteredIds.has(backend.id) && filteredIds.has(backendApi.id),
      'filterOrgUnitsForActor: dept_admin sees own unit + descendant'
    );
    assert(
      !filteredIds.has(engineering.id) && !filteredIds.has(frontend.id) && !filteredIds.has(sales.id),
      'filterOrgUnitsForActor: dept_admin does NOT see parent/sibling/unrelated units'
    );
    assert(filtered.length === 2, `filterOrgUnitsForActor: exactly 2 units in scope (got ${filtered.length})`);

    // ==================================================================
    // requireMemberScopeAccess / filterMembersForActor
    // ==================================================================
    console.log('\n--- requireMemberScopeAccess / filterMembersForActor ---');

    assert(
      (await requireMemberScopeAccess(deptAdminReq, orgA.id, backendApi.id)).ok === true,
      'dept_admin: manage a member in a descendant unit -> ok'
    );
    assert(
      (await requireMemberScopeAccess(deptAdminReq, orgA.id, backend.id)).ok === true,
      'dept_admin: manage a member directly in own unit -> ok'
    );
    const outOfScopeMemberResult = await requireMemberScopeAccess(deptAdminReq, orgA.id, frontend.id);
    assert(
      outOfScopeMemberResult.ok === false && outOfScopeMemberResult.response.status === 403,
      'dept_admin: manage a member in a sibling unit (Frontend) -> 403 (cannot manage other departments)'
    );
    const noUnitMemberResult = await requireMemberScopeAccess(deptAdminReq, orgA.id, null);
    assert(
      noUnitMemberResult.ok === false && noUnitMemberResult.response.status === 403,
      'dept_admin: manage a member with no orgUnitId -> 403 (not implicitly in scope)'
    );

    const allMembers = [
      { id: memberInScope.id, orgUnitId: memberInScope.orgUnitId },
      { id: memberOutOfScope.id, orgUnitId: memberOutOfScope.orgUnitId },
      { id: memberNoUnit.id, orgUnitId: memberNoUnit.orgUnitId },
      { id: deptAdmin.id, orgUnitId: deptAdmin.orgUnitId },
    ];
    const filteredMembers = await filterMembersForActor(deptAdminActor, orgA.id, allMembers);
    const filteredMemberIds = new Set(filteredMembers.map((m) => m.id));
    assert(
      filteredMemberIds.has(memberInScope.id) && filteredMemberIds.has(deptAdmin.id),
      'filterMembersForActor: dept_admin sees members in own unit + descendants (incl. self)'
    );
    assert(
      !filteredMemberIds.has(memberOutOfScope.id) && !filteredMemberIds.has(memberNoUnit.id),
      'filterMembersForActor: dept_admin does NOT see out-of-scope or unassigned members'
    );

    // ==================================================================
    // Cannot escalate: isOrgAdmin grant / billing fields still blocked for dept_admin
    // (this is enforced in the route handlers, not orgAccess — verified here at the
    // orgAccess layer by confirming dept_admin never satisfies requireOrgAccess itself,
    // which every isOrgAdmin-grant / billing-field check in the routes is gated behind).
    // ==================================================================
    const { requireOrgAccess } = await import('../lib/auth/orgAccess.ts');
    const orgLevelResult = await requireOrgAccess(deptAdminReq, orgA.id, 'write');
    assert(
      orgLevelResult.ok === false && orgLevelResult.response.status === 403,
      'dept_admin: org-level requireOrgAccess (billing/isOrgAdmin-grant gate) still 403 — scope is orgUnit-only, never org-wide'
    );

    // ==================================================================
    // setMemberDeptAdmin (service layer): promote/demote, previousRole restore,
    // orgUnitId-required validation
    // ==================================================================
    console.log('\n--- setMemberDeptAdmin (service layer) ---');

    // orgMembershipService.setMemberDeptAdmin 只允許學生身分升為 dept_admin（老師會被拒絕，見下方反向案例）。
    const promotable = await makeProfile('promotable', {
      role: 'student',
      orgId: orgA.id,
      orgUnitId: backendApi.id,
    });
    createdProfileIds.push(promotable.id);

    const teacherMember = await makeProfile('teacherMember', {
      role: 'teacher',
      orgId: orgA.id,
      orgUnitId: backendApi.id,
    });
    createdProfileIds.push(teacherMember.id);

    const noUnitPromotable = await makeProfile('noUnitPromotable', {
      role: 'student',
      orgId: orgA.id,
      orgUnitId: null,
    });
    createdProfileIds.push(noUnitPromotable.id);

    let rejectedNoUnit = false;
    try {
      await setMemberDeptAdmin({ orgId: orgA.id, profileId: noUnitPromotable.id, isDeptAdmin: true });
    } catch (e) {
      rejectedNoUnit = /必須先指派 orgUnit/.test(e.message);
    }
    assert(rejectedNoUnit, 'setMemberDeptAdmin: promoting a member with no orgUnitId is rejected');

    let rejectedTeacher = false;
    try {
      await setMemberDeptAdmin({ orgId: orgA.id, profileId: teacherMember.id, isDeptAdmin: true });
    } catch (e) {
      rejectedTeacher = /僅學生身分/.test(e.message);
    }
    assert(rejectedTeacher, 'setMemberDeptAdmin: promoting a teacher to dept_admin is rejected (students only)');

    const promoted = await setMemberDeptAdmin({ orgId: orgA.id, profileId: promotable.id, isDeptAdmin: true });
    assert(promoted.role === 'dept_admin', 'setMemberDeptAdmin: promote sets role to dept_admin');
    assert(promoted.previousRole === 'student', 'setMemberDeptAdmin: promote records previousRole (student)');

    const promotedAgain = await setMemberDeptAdmin({ orgId: orgA.id, profileId: promotable.id, isDeptAdmin: true });
    assert(promotedAgain.role === 'dept_admin', 'setMemberDeptAdmin: promoting an already-dept_admin member is idempotent');

    const demoted = await setMemberDeptAdmin({ orgId: orgA.id, profileId: promotable.id, isDeptAdmin: false });
    assert(demoted.role === 'student', 'setMemberDeptAdmin: demote restores previousRole (student)');
    assert(demoted.previousRole === undefined, 'setMemberDeptAdmin: demote clears previousRole');

    const demotedAgain = await setMemberDeptAdmin({ orgId: orgA.id, profileId: promotable.id, isDeptAdmin: false });
    assert(demotedAgain.role === 'student', 'setMemberDeptAdmin: demoting a non-dept_admin member is idempotent (no-op)');

    // A member who was already dept_admin before this feature existed (no previousRole
    // on record) should fall back to 'student' on demote, not throw or leave it blank.
    const legacyDeptAdmin = await makeProfile('legacyDeptAdmin', {
      role: 'dept_admin',
      orgId: orgA.id,
      orgUnitId: backend.id,
    });
    createdProfileIds.push(legacyDeptAdmin.id);
    const legacyDemoted = await setMemberDeptAdmin({ orgId: orgA.id, profileId: legacyDeptAdmin.id, isDeptAdmin: false });
    assert(
      legacyDemoted.role === 'student',
      `setMemberDeptAdmin: demote with no previousRole on record falls back to 'student' (got '${legacyDemoted.role}')`
    );

    const persisted = await getProfileById(promotable.id);
    assert(persisted.role === 'student', 'setMemberDeptAdmin: role change is actually persisted in DynamoDB, not just returned');
  } finally {
    console.log('\n--- cleanup ---');
    // 先刪成員 profile：deleteOrgUnit 會拒絕硬刪仍有成員掛著（profile.orgUnitId 指向它）的部門，
    // 先刪部門再刪 profile 會讓部門殘留在正式資料庫。
    for (const profileId of createdProfileIds) {
      try {
        await ddbDocClient.send(new DeleteCommand({ TableName: PROFILES_TABLE, Key: { id: profileId } }));
      } catch (e) {
        console.warn(`  ⚠️ failed to delete profile ${profileId}: ${e.message}`);
      }
    }
    const remainingUnitIds = new Set(createdUnitIds);
    for (let pass = 0; pass < 4 && remainingUnitIds.size > 0; pass++) {
      for (const unitId of [...remainingUnitIds].reverse()) {
        const stillExists = await getOrgUnitById(unitId).catch(() => null);
        if (!stillExists) {
          remainingUnitIds.delete(unitId);
          continue;
        }
        try {
          await deleteOrgUnit(unitId, true);
          remainingUnitIds.delete(unitId);
        } catch {
          // still has children this pass — retry once they're gone
        }
      }
    }
    for (const unitId of remainingUnitIds) {
      const stillThere = await getOrgUnitById(unitId).catch(() => null);
      if (stillThere) {
        console.warn(`  ⚠️ org unit ${unitId} (${stillThere.name}) could not be cleaned up automatically`);
      }
    }
    try {
      await deleteOrganization(orgA.id, true);
      await deleteOrganization(orgB.id, true);
    } catch (e) {
      console.warn(`  ⚠️ failed to delete organizations: ${e.message}`);
    }
    console.log('cleanup done.');
  }

  console.log(`\n=== Result: ${passCount} passed, ${failCount} failed ===`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('\n💥 Script crashed:', e);
  process.exit(1);
});

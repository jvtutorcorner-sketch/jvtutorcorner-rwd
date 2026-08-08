// scripts/verify-b2b-access-orgunits.mjs
/**
 * Regression script for the two other B2B modules explicitly called out as
 * "Core Fixes" in 32c5977 (companion to scripts/verify-b2b-seat-membership.mjs,
 * which already covers licenseService/orgMembershipService):
 *
 *  1) lib/auth/orgAccess.ts — requireOrgAccess/requireSystemAdmin, the guard
 *     behind every app/api/organizations/** and app/api/org-units/** route.
 *     Only two tiers actually exist in code: system admin (session.role is
 *     'admin'/'system') and org admin (profile.isOrgAdmin && profile.orgId ===
 *     orgId). The b2b-tenant-isolation skill's "dept_admin scoped to their
 *     orgUnit" (M2) is NOT implemented anywhere — apiGuard.ts has no `scope`
 *     concept — so it is intentionally not covered here.
 *  2) lib/orgUnitService.ts's moveOrgUnit — "atomicity using TransactWriteCommand
 *     with optimistic concurrency" (the #path = :expectedOldPath condition on
 *     every affected row), plus the surrounding guards (self/descendant/cross-org)
 *     and the repairOrgUnitPaths backstop for partially-failed multi-chunk moves.
 *
 * Runs against the real DynamoDB tables from .env.local (same as
 * verify-b2b-seat-membership.mjs) and hard-deletes everything it creates in a
 * finally block. Org ids are printed up front in case a killed run needs
 * manual cleanup.
 *
 * Usage:
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2b-access-orgunits.mjs
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const { randomUUID } = await import('crypto');
const { DeleteCommand, UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
const { ddbDocClient } = await import('../lib/dynamo.ts');
const { createOrganization, deleteOrganization } = await import('../lib/organizationService.ts');
const { PROFILES_TABLE, putProfile } = await import('../lib/profilesService.ts');
const { requireOrgAccess, requireSystemAdmin } = await import('../lib/auth/orgAccess.ts');
const {
  ORG_UNITS_TABLE,
  createOrgUnit,
  getOrgUnitById,
  getDescendantUnits,
  moveOrgUnit,
  deleteOrgUnit,
  repairOrgUnitPaths
} = await import('../lib/orgUnitService.ts');

const RUN_TAG = `b2baccess-${Date.now()}`;

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

async function assertThrows(fn, label) {
  try {
    await fn();
    failCount++;
    console.error(`  ❌ ${label} (expected an error, none was thrown)`);
  } catch (e) {
    passCount++;
    console.log(`  ✅ ${label} (threw: ${e.message})`);
  }
}

function fakeReq({ userId, role }) {
  // orgAccess.ts only reads req.session — a plain object is enough, no real
  // Request/cookie needed.
  return {
    session: {
      sessionId: `test-${userId}`,
      userId,
      email: `${userId}@${RUN_TAG}.test`,
      role,
      plan: 'system',
      createdAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 3600
    }
  };
}

async function makeProfile(tag, fields) {
  const id = randomUUID();
  const profile = {
    id,
    email: `${tag}-${RUN_TAG}@${RUN_TAG}.test`,
    firstName: 'B2BVerify',
    lastName: tag,
    role: 'student',
    plan: 'basic',
    isB2B: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...fields
  };
  await putProfile(profile);
  return profile;
}

async function main() {
  console.log(`=== B2B orgAccess + orgUnitService verification (${RUN_TAG}) ===\n`);

  const orgA = await createOrganization({
    name: `Access Verify Org A ${RUN_TAG}`,
    planTier: 'business',
    maxSeats: 5,
    billingEmail: `billing-a@${RUN_TAG}.test`
  });
  const orgB = await createOrganization({
    name: `Access Verify Org B ${RUN_TAG}`,
    planTier: 'business',
    maxSeats: 5,
    billingEmail: `billing-b@${RUN_TAG}.test`
  });
  console.log(`Created orgA ${orgA.id}, orgB ${orgB.id}. If this script is killed, clean these up manually.\n`);

  const createdProfileIds = [];
  const createdUnitIds = [];

  try {
    // ==================================================================
    // 1. lib/auth/orgAccess.ts
    // ==================================================================
    console.log('--- 1. orgAccess: system admin / org admin / plain member tiers ---');

    const orgAdminA = await makeProfile('orgAdminA', { isOrgAdmin: true, orgId: orgA.id });
    const memberA = await makeProfile('memberA', { isOrgAdmin: false, orgId: orgA.id });
    createdProfileIds.push(orgAdminA.id, memberA.id);

    const sysAdminReq = fakeReq({ userId: 'sys-admin-test', role: 'admin' });
    const orgAdminAReq = fakeReq({ userId: orgAdminA.id, role: 'student' });
    const memberAReq = fakeReq({ userId: memberA.id, role: 'student' });

    assert((await requireOrgAccess(sysAdminReq, orgA.id, 'read')).ok === true, 'system admin: read on any org -> ok');
    assert((await requireOrgAccess(sysAdminReq, orgA.id, 'write')).ok === true, 'system admin: write on any org -> ok');
    assert((await requireOrgAccess(sysAdminReq, orgA.id, 'system')).ok === true, 'system admin: system-level op -> ok');
    assert((await requireSystemAdmin(sysAdminReq)).ok === true, 'requireSystemAdmin: system admin -> ok');

    assert((await requireOrgAccess(orgAdminAReq, orgA.id, 'read')).ok === true, 'org admin: read own org -> ok');
    assert((await requireOrgAccess(orgAdminAReq, orgA.id, 'write')).ok === true, 'org admin: write own org -> ok');

    const orgAdminSystemResult = await requireOrgAccess(orgAdminAReq, orgA.id, 'system');
    assert(orgAdminSystemResult.ok === false && orgAdminSystemResult.response.status === 403,
      'org admin: system-level op on own org still 403 (billing ops require system admin)');

    const orgAdminCrossOrgResult = await requireOrgAccess(orgAdminAReq, orgB.id, 'read');
    assert(orgAdminCrossOrgResult.ok === false && orgAdminCrossOrgResult.response.status === 403,
      'org admin: read on a different org -> 403');

    const orgAdminSysGuardResult = await requireSystemAdmin(orgAdminAReq);
    assert(orgAdminSysGuardResult.ok === false && orgAdminSysGuardResult.response.status === 403,
      'requireSystemAdmin: org admin -> 403');

    const memberReadResult = await requireOrgAccess(memberAReq, orgA.id, 'read');
    assert(memberReadResult.ok === false && memberReadResult.response.status === 403,
      "plain member (isOrgAdmin=false): read on OWN org still 403 (isOrgAdmin is required, not just membership)");

    const missingOrgIdResult = await requireOrgAccess(orgAdminAReq, '', 'read');
    assert(missingOrgIdResult.ok === false && missingOrgIdResult.response.status === 400,
      'missing orgId -> 400');

    // ==================================================================
    // 2. lib/orgUnitService.ts — hierarchy + moveOrgUnit atomicity
    // ==================================================================
    console.log('\n--- 2. orgUnitService: hierarchy, moveOrgUnit guards, concurrency ---');

    const root = await createOrgUnit({ orgId: orgA.id, name: 'Engineering' });
    const child = await createOrgUnit({ orgId: orgA.id, name: 'Backend', parentId: root.id });
    const grandchild = await createOrgUnit({ orgId: orgA.id, name: 'Backend-API', parentId: child.id });
    const child2 = await createOrgUnit({ orgId: orgA.id, name: 'Frontend', parentId: root.id });
    const root2 = await createOrgUnit({ orgId: orgA.id, name: 'Sales' });
    const unitInOrgB = await createOrgUnit({ orgId: orgB.id, name: 'OtherOrgUnit' });
    createdUnitIds.push(root.id, child.id, grandchild.id, child2.id, root2.id, unitInOrgB.id);

    assert(root.path === `/${root.id}` && root.level === 0, 'createOrgUnit: root path/level correct');
    assert(child.path === `${root.path}/${child.id}` && child.level === 1, 'createOrgUnit: child path/level correct');
    assert(grandchild.path === `${child.path}/${grandchild.id}` && grandchild.level === 2, 'createOrgUnit: grandchild path/level correct');

    await assertThrows(
      () => createOrgUnit({ orgId: orgA.id, name: 'Cross-org child', parentId: unitInOrgB.id }),
      'createOrgUnit: parentId from a different org is rejected'
    );

    await assertThrows(() => moveOrgUnit(child.id, child.id), 'moveOrgUnit: move unit to itself is rejected');
    await assertThrows(() => moveOrgUnit(root.id, grandchild.id), 'moveOrgUnit: move unit under its own descendant is rejected');
    await assertThrows(() => moveOrgUnit(child.id, unitInOrgB.id), 'moveOrgUnit: move unit into a different org is rejected');

    const movedChild2 = await moveOrgUnit(child2.id, child.id);
    assert(movedChild2.path === `${child.path}/${child2.id}` && movedChild2.level === 2,
      'moveOrgUnit: simple move (no descendants) updates path/level correctly');

    // child now has descendants [grandchild, child2] — move child itself and verify the
    // whole subtree's paths are rewritten via prefix-slice, not corrupted.
    const oldChildPath = child.path;
    const movedChild = await moveOrgUnit(child.id, root2.id);
    const expectedNewChildPath = `${root2.path}/${child.id}`;
    assert(movedChild.path === expectedNewChildPath, 'moveOrgUnit (subtree): moved unit path updated');

    const refetchedGrandchild = await getOrgUnitById(grandchild.id);
    const refetchedChild2 = await getOrgUnitById(child2.id);
    assert(refetchedGrandchild.path === `${expectedNewChildPath}/${grandchild.id}`,
      'moveOrgUnit (subtree): grandchild path rewritten via prefix-slice, not corrupted');
    assert(refetchedChild2.path === `${expectedNewChildPath}/${child2.id}`,
      'moveOrgUnit (subtree): other descendant (child2) path rewritten correctly too');
    assert(!refetchedGrandchild.path.includes(oldChildPath) || refetchedGrandchild.path.startsWith(expectedNewChildPath),
      'moveOrgUnit (subtree): old path prefix fully replaced (no leftover fragment)');

    const descendantsOfMovedChild = await getDescendantUnits(child.id);
    assert(descendantsOfMovedChild.length === 2, 'getDescendantUnits: moved subtree still reports exactly 2 descendants');

    const noOpResult = await moveOrgUnit(grandchild.id, grandchild.parentId);
    assert(noOpResult.path === refetchedGrandchild.path, 'moveOrgUnit: no-op move (same parent) returns unit unchanged');

    // Concurrency: fire two moves of the same leaf unit at two different valid targets.
    // Exactly one should win; the loser's ConditionExpression (#path = :expectedOldPath)
    // must fail because the winner already advanced the path.
    const concurrentTargets = [root.id, root2.id];
    const concurrentSettled = await Promise.allSettled(
      concurrentTargets.map((targetId) => moveOrgUnit(child2.id, targetId))
    );
    const concurrentFulfilled = concurrentSettled.filter((s) => s.status === 'fulfilled');
    const concurrentRejected = concurrentSettled.filter((s) => s.status === 'rejected');
    assert(concurrentFulfilled.length === 1, `moveOrgUnit concurrency: exactly 1 of 2 concurrent moves succeeded (got ${concurrentFulfilled.length})`);
    assert(concurrentRejected.length === 1, `moveOrgUnit concurrency: exactly 1 of 2 concurrent moves was rejected (got ${concurrentRejected.length})`);

    const child2Final = await getOrgUnitById(child2.id);
    assert(
      concurrentTargets.some((targetId) => child2Final.parentId === targetId),
      'moveOrgUnit concurrency: final state matches exactly one of the two attempted targets (not corrupted)'
    );

    // --- delete guards (dedicated subtree so earlier moves don't interfere) ---
    const deleteParent = await createOrgUnit({ orgId: orgA.id, name: 'DeleteTestParent' });
    const deleteChild = await createOrgUnit({ orgId: orgA.id, name: 'DeleteTestChild', parentId: deleteParent.id });
    createdUnitIds.push(deleteParent.id, deleteChild.id);

    await assertThrows(() => deleteOrgUnit(deleteParent.id, true), 'deleteOrgUnit: hard delete blocked while children exist');

    await deleteOrgUnit(deleteParent.id, false);
    const archivedParent = await getOrgUnitById(deleteParent.id);
    assert(archivedParent.status === 'archived', 'deleteOrgUnit: soft delete sets status=archived');

    await deleteOrgUnit(deleteChild.id, true);
    const deletedChildCheck = await getOrgUnitById(deleteChild.id);
    assert(deletedChildCheck === null, 'deleteOrgUnit: child hard-deleted successfully');

    await deleteOrgUnit(deleteParent.id, true);
    const deletedParentCheck = await getOrgUnitById(deleteParent.id);
    assert(deletedParentCheck === null, 'deleteOrgUnit: parent hard-delete succeeds once childless');

    // --- repairOrgUnitPaths backstop ---
    const repairRoot = await createOrgUnit({ orgId: orgA.id, name: 'RepairRoot' });
    const repairChild = await createOrgUnit({ orgId: orgA.id, name: 'RepairChild', parentId: repairRoot.id });
    createdUnitIds.push(repairRoot.id, repairChild.id);

    // Simulate the partial-chunk-failure drift repairOrgUnitPaths exists to fix.
    await ddbDocClient.send(new UpdateCommand({
      TableName: ORG_UNITS_TABLE,
      Key: { id: repairChild.id },
      UpdateExpression: 'SET #path = :corrupted, #level = :corruptedLevel',
      ExpressionAttributeNames: { '#path': 'path', '#level': 'level' },
      ExpressionAttributeValues: { ':corrupted': '/WRONG/PATH', ':corruptedLevel': 99 }
    }));

    const repairResult = await repairOrgUnitPaths(orgA.id);
    assert(repairResult.repaired >= 1, `repairOrgUnitPaths: reports at least 1 repaired unit (got ${repairResult.repaired})`);

    const repairedChild = await getOrgUnitById(repairChild.id);
    assert(repairedChild.path === `${repairRoot.path}/${repairChild.id}` && repairedChild.level === 1,
      'repairOrgUnitPaths: corrupted path/level recomputed correctly from parentId chain');
  } finally {
    // ------------------------------------------------------------------
    // Cleanup — best-effort, runs even if an assertion/throw happened above.
    // Several units were already deleted mid-test and some parents only
    // become deletable after their children are gone, so retry in reverse
    // creation order across a few passes rather than a single linear pass.
    // ------------------------------------------------------------------
    console.log('\n--- cleanup ---');
    const remainingUnitIds = new Set(createdUnitIds);
    for (let pass = 0; pass < 4 && remainingUnitIds.size > 0; pass++) {
      for (const unitId of [...remainingUnitIds].reverse()) {
        const stillExists = await getOrgUnitById(unitId).catch(() => null);
        if (!stillExists) {
          remainingUnitIds.delete(unitId); // already deleted mid-test — nothing to do
          continue;
        }
        try {
          await deleteOrgUnit(unitId, true);
          remainingUnitIds.delete(unitId);
        } catch {
          // still has children this pass — will retry once they're gone
        }
      }
    }
    for (const unitId of remainingUnitIds) {
      const stillThere = await getOrgUnitById(unitId).catch(() => null);
      if (stillThere) {
        console.warn(`  ⚠️ org unit ${unitId} (${stillThere.name}) could not be cleaned up automatically`);
      }
    }
    for (const profileId of createdProfileIds) {
      try {
        await ddbDocClient.send(new DeleteCommand({ TableName: PROFILES_TABLE, Key: { id: profileId } }));
      } catch (e) {
        console.warn(`  ⚠️ failed to delete profile ${profileId}: ${e.message}`);
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

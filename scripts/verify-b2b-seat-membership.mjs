// scripts/verify-b2b-seat-membership.mjs
/**
 * Regression script for the two highest-risk B2B modules touched by recent commits:
 *
 *  1) lib/licenseService.ts + lib/orgMembershipService.ts seat accounting
 *     (32c5977 rewrote incrementUsedSeats as a TransactWriteCommand condition
 *     expression — this checks the limit actually holds, including under
 *     concurrent assignment).
 *  2) lib/orgMembershipService.ts member add/remove, including the plan
 *     restore-to-'free' fix from 7dd3400 (previously removal left `plan: null`,
 *     stranding the former member with no B2C plan either).
 *
 * Runs against the real DynamoDB tables from .env.local (same tables the app
 * uses locally) and hard-deletes everything it creates in a finally block.
 * All records are tagged with a per-run domain so a killed run can be found
 * and cleaned up manually — the org id and profile ids are printed up front.
 *
 * Usage:
 *   node scripts/verify-b2b-seat-membership.mjs
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

// Dynamic imports so dotenv has already populated process.env before these
// modules read DYNAMODB_TABLE_* / AWS_* at top-level module scope.
const { randomUUID } = await import('crypto');
const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
const { ddbDocClient } = await import('../lib/dynamo.ts');
const { createOrganization, getOrganizationById, deleteOrganization } = await import('../lib/organizationService.ts');
const { PROFILES_TABLE, getProfileById, putProfile } = await import('../lib/profilesService.ts');
const { getLicenseById, listLicensesByOrg, deleteLicense } = await import('../lib/licenseService.ts');
const { assignMemberWithLicense, removeMemberFromOrg } = await import('../lib/orgMembershipService.ts');

const RUN_TAG = `b2bverify-${Date.now()}`;
const TEST_DOMAIN = `${RUN_TAG}.test`;

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

async function makeProfile(tag) {
  const id = randomUUID();
  const profile = {
    id,
    email: `${tag}-${RUN_TAG}@${TEST_DOMAIN}`,
    firstName: 'B2BVerify',
    lastName: tag,
    role: 'student',
    plan: 'basic',
    isB2B: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await putProfile(profile);
  return profile;
}

async function main() {
  console.log(`=== B2B seat + membership verification (${RUN_TAG}) ===\n`);

  const org = await createOrganization({
    name: `B2B Verify Org ${RUN_TAG}`,
    domain: TEST_DOMAIN,
    planTier: 'business',
    maxSeats: 2,
    billingEmail: `billing@${TEST_DOMAIN}`
  });
  console.log(`Created org ${org.id} (maxSeats=2). If this script is killed, clean it up manually.\n`);

  const createdProfileIds = [];
  const createdLicenseIds = [];

  try {
    // ------------------------------------------------------------------
    // 1) Seat limit enforcement (sequential)
    // ------------------------------------------------------------------
    console.log('--- 1. Seat limit enforcement ---');
    const p1 = await makeProfile('p1');
    const p2 = await makeProfile('p2');
    const p3 = await makeProfile('p3');
    createdProfileIds.push(p1.id, p2.id, p3.id);

    const r1 = await assignMemberWithLicense({ orgId: org.id, profileId: p1.id, assignedBy: 'verify-script' });
    createdLicenseIds.push(r1.license.id);
    assert(r1.usedSeats === 1, 'assign p1 -> usedSeats becomes 1');

    const r2 = await assignMemberWithLicense({ orgId: org.id, profileId: p2.id, assignedBy: 'verify-script' });
    createdLicenseIds.push(r2.license.id);
    assert(r2.usedSeats === 2, 'assign p2 -> usedSeats becomes 2 (at maxSeats)');

    await assertThrows(
      () => assignMemberWithLicense({ orgId: org.id, profileId: p3.id, assignedBy: 'verify-script' }),
      'assign p3 beyond maxSeats is rejected'
    );

    const orgAfterOverflow = await getOrganizationById(org.id);
    assert(orgAfterOverflow.usedSeats === 2, 'usedSeats still 2 after rejected 3rd assignment (no partial write)');

    const p3After = await getProfileById(p3.id);
    assert(!p3After.orgId, 'p3 profile untouched after rejected assignment (transaction rolled back)');

    // Free both seats before the concurrency test.
    await removeMemberFromOrg({ orgId: org.id, profileId: p1.id });
    await removeMemberFromOrg({ orgId: org.id, profileId: p2.id });
    const orgAfterReset = await getOrganizationById(org.id);
    assert(orgAfterReset.usedSeats === 0, 'usedSeats back to 0 after freeing both test seats');

    // ------------------------------------------------------------------
    // 2) Seat limit enforcement under concurrency
    // ------------------------------------------------------------------
    console.log('\n--- 2. Seat limit under concurrent assignment ---');
    const concurrentProfiles = await Promise.all(
      ['c1', 'c2', 'c3', 'c4', 'c5'].map((tag) => makeProfile(tag))
    );
    createdProfileIds.push(...concurrentProfiles.map((p) => p.id));

    const settled = await Promise.allSettled(
      concurrentProfiles.map((p) =>
        assignMemberWithLicense({ orgId: org.id, profileId: p.id, assignedBy: 'verify-script-concurrent' })
      )
    );
    const fulfilled = settled.filter((s) => s.status === 'fulfilled');
    const rejected = settled.filter((s) => s.status === 'rejected');
    fulfilled.forEach((s) => createdLicenseIds.push(s.value.license.id));

    assert(fulfilled.length === 2, `exactly 2 of 5 concurrent assignments succeeded (got ${fulfilled.length})`);
    assert(rejected.length === 3, `exactly 3 of 5 concurrent assignments were rejected (got ${rejected.length})`);

    const orgAfterConcurrency = await getOrganizationById(org.id);
    assert(orgAfterConcurrency.usedSeats === 2, `usedSeats settled at exactly 2 under race (got ${orgAfterConcurrency.usedSeats})`);

    const activeLicenses = await listLicensesByOrg(org.id, 'active');
    assert(activeLicenses.length === 2, `exactly 2 active licenses recorded for org (got ${activeLicenses.length})`);

    // ------------------------------------------------------------------
    // 3) Member removal: seat release + license revoke + plan restore
    // ------------------------------------------------------------------
    console.log('\n--- 3. Member removal (seat release, license revoke, plan restore) ---');
    const winner = fulfilled[0].value.profile;
    const winnerBefore = await getProfileById(winner.id);
    assert(winnerBefore.plan === null, 'assigned member has plan=null while active (B2B, no B2C plan)');
    assert(winnerBefore.isB2B === true, 'assigned member has isB2B=true');
    assert(!!winnerBefore.licenseId, 'assigned member has a licenseId');

    const removedLicenseId = winnerBefore.licenseId;
    const removeResult = await removeMemberFromOrg({ orgId: org.id, profileId: winner.id });

    assert(removeResult.usedSeats === 1, `usedSeats decremented to 1 after removal (got ${removeResult.usedSeats})`);
    assert(removeResult.profile.plan === 'free', `removed member's plan restored to 'free' (got '${removeResult.profile.plan}') — regression check for 7dd3400`);
    assert(!removeResult.profile.orgId, 'removed member orgId cleared');
    assert(removeResult.profile.isB2B === false, 'removed member isB2B reset to false');
    assert(!removeResult.profile.licenseId, 'removed member licenseId cleared');

    const revokedLicense = await getLicenseById(removedLicenseId);
    assert(revokedLicense.status === 'revoked', 'former license status is revoked');
    assert(!revokedLicense.userId, 'former license userId removed (sparse GSI drop)');

    // ------------------------------------------------------------------
    // 4) Removal edge case: member with no active license doesn't touch usedSeats
    // ------------------------------------------------------------------
    console.log('\n--- 4. Removal edge case: no active license ---');
    const orphan = await makeProfile('orphan');
    createdProfileIds.push(orphan.id);
    await putProfile({ ...orphan, orgId: org.id, isB2B: true, plan: null, licenseId: null });

    const orgBeforeOrphanRemoval = await getOrganizationById(org.id);
    const orphanRemoveResult = await removeMemberFromOrg({ orgId: org.id, profileId: orphan.id });

    assert(
      orphanRemoveResult.usedSeats === orgBeforeOrphanRemoval.usedSeats,
      `usedSeats unchanged when removing a member with no active license (${orphanRemoveResult.usedSeats})`
    );
    assert(orphanRemoveResult.profile.plan === 'free', "orphaned member's plan also restored to 'free'");
  } finally {
    // ------------------------------------------------------------------
    // Cleanup — best-effort, runs even if an assertion/throw happened above.
    // ------------------------------------------------------------------
    console.log('\n--- cleanup ---');
    for (const licenseId of createdLicenseIds) {
      try {
        await deleteLicense(licenseId, true);
      } catch (e) {
        console.warn(`  ⚠️ failed to delete license ${licenseId}: ${e.message}`);
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
      await deleteOrganization(org.id, true);
    } catch (e) {
      console.warn(`  ⚠️ failed to delete organization ${org.id}: ${e.message}`);
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

// scripts/verify-b2b-enterprise-registration.mjs
/**
 * Regression script for the enterprise self-registration path:
 *   app/api/organizations/public/route.ts (org picker listing)
 *   app/api/register/route.ts's orgId branch (atomic seat consumption + rollback)
 *
 * This is the API layer behind app/login/register_enterprise/page.tsx (single
 * registration + CSV bulk import both funnel through the same POST /api/register).
 *
 * Unlike the other verify-b2b-*.mjs scripts, this one talks to a REAL running dev
 * server over HTTP (POST /api/register triggers email sending, captcha checks, etc.
 * that only exist in the route handler, not in a directly-importable lib function).
 * Requires `npm run dev` running first.
 *
 * Usage:
 *   npm run dev   # in another terminal, if not already running
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2b-enterprise-registration.mjs
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const { randomUUID } = await import('crypto');
const { DeleteCommand, GetCommand } = await import('@aws-sdk/lib-dynamodb');
const { ddbDocClient } = await import('../lib/dynamo.ts');
const { createOrganization, updateOrganization, getOrganizationById, deleteOrganization } = await import(
  '../lib/organizationService.ts'
);
const { findProfileByEmail, PROFILES_TABLE } = await import('../lib/profilesService.ts');
const { deleteLicense } = await import('../lib/licenseService.ts');
const { createOrgUnit, deleteOrgUnit } = await import('../lib/orgUnitService.ts');

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const E2E_SECRET = process.env.LOGIN_BYPASS_SECRET;
if (!E2E_SECRET) {
  console.error('Missing LOGIN_BYPASS_SECRET in .env.local — required to bypass captcha.');
  process.exit(1);
}

const RUN_TAG = `b2breg-${Date.now()}`;
const DOMAIN = `${RUN_TAG}.test`;

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

async function registerRequest(payload) {
  const res = await fetch(`${BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-E2E-Secret': E2E_SECRET },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

function basePayload(email, overrides = {}) {
  return {
    roid_id: randomUUID(),
    email,
    password: 'TestPassw0rd!',
    firstName: 'Verify',
    lastName: 'Bot',
    role: 'student',
    birthdate: '2000-01-01',
    gender: 'male',
    country: 'TW',
    termsAccepted: true,
    ...overrides
  };
}

async function main() {
  console.log(`=== B2B enterprise registration verification (${RUN_TAG}) ===\n`);
  console.log(`Using dev server at ${BASE_URL} — make sure \`npm run dev\` is running.\n`);

  const org = await createOrganization({
    name: `Reg Verify Org ${RUN_TAG}`,
    domain: DOMAIN,
    planTier: 'business',
    maxSeats: 5,
    billingEmail: `billing@${DOMAIN}`
  });
  const noDomainOrg = await createOrganization({
    name: `Reg Verify NoDomain Org ${RUN_TAG}`,
    planTier: 'business',
    maxSeats: 5,
    billingEmail: `billing-nodomain@${DOMAIN}`
  });
  const suspendedOrg = await createOrganization({
    name: `Reg Verify Suspended Org ${RUN_TAG}`,
    domain: `suspended.${DOMAIN}`,
    planTier: 'business',
    maxSeats: 5,
    billingEmail: `billing-suspended@${DOMAIN}`
  });
  await updateOrganization(suspendedOrg.id, { status: 'suspended' });
  const unit = await createOrgUnit({ orgId: org.id, name: 'Engineering' });

  console.log(`org ${org.id} (domain=${DOMAIN}), noDomainOrg ${noDomainOrg.id}, suspendedOrg ${suspendedOrg.id}.`);
  console.log('If this script is killed, clean these up manually.\n');

  const createdEmails = [];
  const createdLicenseIds = [];
  const createdUnitIds = [unit.id];
  let teacherRecordId = null;

  try {
    // ==================================================================
    // 1. Public org listing
    // ==================================================================
    console.log('--- 1. GET /api/organizations/public ---');
    const publicRes = await fetch(`${BASE_URL}/api/organizations/public`);
    const publicData = await publicRes.json();
    const listedIds = new Set((publicData.organizations || []).map((o) => o.id));
    assert(listedIds.has(org.id), 'org with a domain set appears in the public listing');
    assert(!listedIds.has(noDomainOrg.id), 'org WITHOUT a domain is excluded from the public listing (no open self-registration)');
    const listedOrg = (publicData.organizations || []).find((o) => o.id === org.id);
    assert(listedOrg?.availableSeats === 5, `public listing reports correct availableSeats (got ${listedOrg?.availableSeats})`);

    // ==================================================================
    // 2. Single registration — happy path + validation branches
    // ==================================================================
    console.log('\n--- 2. POST /api/register (orgId branch) ---');

    const validEmail = `member1@${DOMAIN}`;
    createdEmails.push(validEmail);
    const r1 = await registerRequest(basePayload(validEmail, { orgId: org.id, orgUnitId: unit.id }));
    assert(r1.status === 201, `valid registration succeeds (got ${r1.status}: ${JSON.stringify(r1.data).slice(0, 200)})`);
    assert(r1.data?.profile?.isB2B === true, 'registered profile has isB2B=true');
    assert(r1.data?.profile?.plan === null, 'registered B2B profile has plan=null (not a B2C free plan)');
    assert(r1.data?.profile?.orgUnitId === unit.id, 'registered profile assigned to the requested org unit');
    assert(!!r1.data?.licenseId, 'registration response includes a licenseId');
    if (r1.data?.licenseId) createdLicenseIds.push(r1.data.licenseId);

    const orgAfterFirst = await getOrganizationById(org.id);
    assert(orgAfterFirst.usedSeats === 1, `org.usedSeats incremented to 1 after registration (got ${orgAfterFirst.usedSeats})`);

    const wrongDomainEmail = `member2@not-${DOMAIN}`;
    createdEmails.push(wrongDomainEmail);
    const r2 = await registerRequest(basePayload(wrongDomainEmail, { orgId: org.id }));
    assert(r2.status === 400 && /網域/.test(r2.data?.message || ''), `email domain mismatch rejected (got ${r2.status}: ${r2.data?.message})`);
    assert((await findProfileByEmail(wrongDomainEmail)) === null, 'no profile was created for the domain-mismatch attempt');

    const badOrgEmail = `member3@${DOMAIN}`;
    createdEmails.push(badOrgEmail);
    const r3 = await registerRequest(basePayload(badOrgEmail, { orgId: 'does-not-exist' }));
    assert(r3.status === 400 && /無效的組織/.test(r3.data?.message || ''), `nonexistent orgId rejected (got ${r3.status}: ${r3.data?.message})`);

    const suspendedEmail = `member4@suspended.${DOMAIN}`;
    createdEmails.push(suspendedEmail);
    const r4 = await registerRequest(basePayload(suspendedEmail, { orgId: suspendedOrg.id }));
    assert(r4.status === 400 && /無法接受新成員/.test(r4.data?.message || ''), `suspended org rejected (got ${r4.status}: ${r4.data?.message})`);

    const badUnitEmail = `member5@${DOMAIN}`;
    createdEmails.push(badUnitEmail);
    const r5 = await registerRequest(basePayload(badUnitEmail, { orgId: org.id, orgUnitId: 'not-a-real-unit' }));
    assert(r5.status === 400 && /無效的組織單位/.test(r5.data?.message || ''), `invalid orgUnitId rejected (got ${r5.status}: ${r5.data?.message})`);
    assert((await findProfileByEmail(badUnitEmail)) === null, 'no profile was created for the invalid-org-unit attempt');

    const dupR1 = await registerRequest(basePayload(validEmail, { orgId: org.id }));
    assert(dupR1.status === 409 && /already registered/i.test(dupR1.data?.message || ''), `duplicate email rejected (got ${dupR1.status}: ${dupR1.data?.message})`);
    const orgAfterDup = await getOrganizationById(org.id);
    assert(orgAfterDup.usedSeats === 1, 'duplicate-email rejection does not touch usedSeats');

    const teacherEmail = `teacher1@${DOMAIN}`;
    createdEmails.push(teacherEmail);
    const r6 = await registerRequest(basePayload(teacherEmail, { orgId: org.id, role: 'teacher' }));
    assert(r6.status === 201, `teacher-role registration succeeds (got ${r6.status})`);
    if (r6.data?.licenseId) createdLicenseIds.push(r6.data.licenseId);
    teacherRecordId = r6.data?.profile?.roid_id || null;
    const teacherRecord = teacherRecordId
      ? await ddbDocClient.send(
          new GetCommand({
            TableName: process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers',
            Key: { id: teacherRecordId }
          })
        )
      : { Item: null };
    assert(!!teacherRecord.Item, 'teacher-role registration also creates a Teachers table record');

    // ==================================================================
    // 3. Seat-race concurrency + rollback
    // ==================================================================
    console.log('\n--- 3. Concurrent registrations racing the last seats (rollback on loser) ---');
    // org currently has usedSeats=2 (member1 + teacher1) out of maxSeats=5 -> 3 remain.
    // Fire 5 concurrent registrations for 3 remaining seats: exactly 3 should succeed.
    const raceEmails = ['race1', 'race2', 'race3', 'race4', 'race5'].map((t) => `${t}@${DOMAIN}`);
    createdEmails.push(...raceEmails);
    const raceResults = await Promise.all(raceEmails.map((email) => registerRequest(basePayload(email, { orgId: org.id }))));
    const raceSucceeded = raceResults.filter((r) => r.status === 201);
    const raceFailed = raceResults.filter((r) => r.status !== 201);
    raceSucceeded.forEach((r) => r.data?.licenseId && createdLicenseIds.push(r.data.licenseId));

    assert(raceSucceeded.length === 3, `exactly 3 of 5 concurrent registrations succeeded (got ${raceSucceeded.length})`);
    assert(raceFailed.length === 2, `exactly 2 of 5 concurrent registrations failed (got ${raceFailed.length})`);
    assert(
      raceFailed.every((r) => r.status === 409),
      `all rejected concurrent registrations got 409 (seat contention), not a raw transaction error (got: ${raceFailed.map((r) => r.status).join(', ')})`
    );

    const orgAfterRace = await getOrganizationById(org.id);
    assert(orgAfterRace.usedSeats === 5, `org.usedSeats settled at exactly maxSeats=5 under race (got ${orgAfterRace.usedSeats})`);

    // Rollback check: every email whose request did NOT return 201 must have no profile
    // left behind (assignMemberWithLicense failed after the profile PutCommand, and the
    // route's catch block must have deleted it).
    let orphanedCount = 0;
    for (let i = 0; i < raceEmails.length; i++) {
      const failed = raceResults[i].status !== 201;
      if (failed) {
        const leftover = await findProfileByEmail(raceEmails[i]);
        if (leftover) orphanedCount++;
      }
    }
    assert(orphanedCount === 0, `no orphaned profile left behind for any of the losing registrations (found ${orphanedCount})`);
  } finally {
    // ------------------------------------------------------------------
    console.log('\n--- cleanup ---');
    for (const licenseId of createdLicenseIds) {
      try {
        await deleteLicense(licenseId, true);
      } catch (e) {
        console.warn(`  ⚠️ failed to delete license ${licenseId}: ${e.message}`);
      }
    }
    for (const email of createdEmails) {
      try {
        const profile = await findProfileByEmail(email);
        if (profile?.id) {
          await ddbDocClient.send(new DeleteCommand({ TableName: PROFILES_TABLE, Key: { id: profile.id } }));
        }
      } catch (e) {
        console.warn(`  ⚠️ failed to delete profile ${email}: ${e.message}`);
      }
    }
    if (teacherRecordId) {
      try {
        const teachersTable = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';
        await ddbDocClient.send(new DeleteCommand({ TableName: teachersTable, Key: { id: teacherRecordId } }));
      } catch (e) {
        console.warn(`  ⚠️ failed to delete teacher record ${teacherRecordId}: ${e.message}`);
      }
    }
    for (const unitId of createdUnitIds) {
      try {
        await deleteOrgUnit(unitId, true);
      } catch (e) {
        console.warn(`  ⚠️ failed to delete org unit ${unitId}: ${e.message}`);
      }
    }
    try {
      await deleteOrganization(org.id, true);
      await deleteOrganization(noDomainOrg.id, true);
      await deleteOrganization(suspendedOrg.id, true);
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

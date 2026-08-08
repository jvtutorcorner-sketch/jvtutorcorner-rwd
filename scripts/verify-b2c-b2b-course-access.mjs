// scripts/verify-b2c-b2b-course-access.mjs
/**
 * Regression script for lib/accessControl.ts's verifyCourseAccess — the one
 * function where regular (B2C) permission checks and enterprise (B2B) seat
 * checks run through the exact same code path (used by
 * app/api/courses/[id]/materials/**, app/api/whiteboard/room/route.ts).
 *
 * Written after finding a real bug while building this script: the B2C branch
 * scanned enrollments on `studentID`/`courseID`, but every enrollment record
 * ever written (app/api/enroll/route.ts's EnrollmentRecord type, confirmed
 * against live table data) uses `userId`/`courseId`. That field-name mismatch
 * meant the B2C branch could never match a real record — a paying B2C student
 * with a valid ACTIVE enrollment would fall through to the B2B check, find no
 * license, and be denied materials-preview/whiteboard access. Fixed in
 * lib/accessControl.ts (see the diff) before this script was left green.
 *
 * Runs against the real DynamoDB tables from .env.local and hard-deletes/
 * reverts everything it creates in a finally block.
 *
 * Usage:
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2c-b2b-course-access.mjs
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const { randomUUID } = await import('crypto');
const { PutCommand, DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
const { ddbDocClient } = await import('../lib/dynamo.ts');
const { verifyCourseAccess, stripTabId } = await import('../lib/accessControl.ts');
const { createOrganization, updateOrganization, deleteOrganization } = await import('../lib/organizationService.ts');
const { createLicense, revokeLicense, deleteLicense } = await import('../lib/licenseService.ts');

// Matches lib/accessControl.ts's own fallback exactly (not the extra
// DYNAMODB_TABLE_ENROLLMENTS alias app/api/enroll/route.ts also accepts) —
// this must be the same table verifyCourseAccess actually queries.
const ENROLLMENTS_TABLE = process.env.ENROLLMENTS_TABLE || 'jvtutorcorner-enrollments';

const RUN_TAG = `access-verify-${Date.now()}`;

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

function testUserId(tag) {
  return `${RUN_TAG}-${tag}`;
}

async function main() {
  console.log(`=== B2C/B2B course access verification (${RUN_TAG}) ===\n`);

  const org = await createOrganization({
    name: `Access Verify Org ${RUN_TAG}`,
    planTier: 'business',
    maxSeats: 20,
    billingEmail: `billing@${RUN_TAG}.test`
  });
  const suspendedOrg = await createOrganization({
    name: `Access Verify Suspended Org ${RUN_TAG}`,
    planTier: 'business',
    maxSeats: 5,
    billingEmail: `billing-suspended@${RUN_TAG}.test`
  });
  await updateOrganization(suspendedOrg.id, { status: 'suspended' });
  console.log(`Created org ${org.id} (trial), suspendedOrg ${suspendedOrg.id}. If killed, clean up manually.\n`);

  const courseA = `course-${RUN_TAG}-A`;
  const courseB = `course-${RUN_TAG}-B`;

  const createdEnrollmentIds = [];
  const createdLicenseIds = [];

  async function createEnrollment(userId, courseId, status) {
    const id = `enr_${randomUUID()}`;
    const now = new Date().toISOString();
    await ddbDocClient.send(new PutCommand({
      TableName: ENROLLMENTS_TABLE,
      Item: {
        id,
        name: 'B2B/B2C Access Verify',
        email: `${userId}@${RUN_TAG}.test`,
        userId,
        courseId,
        courseTitle: 'Access Verify Course',
        status,
        sourceType: 'B2C',
        createdAt: now,
        updatedAt: now
      }
    }));
    createdEnrollmentIds.push(id);
    return id;
  }

  try {
    // ==================================================================
    // stripTabId — pure function, no DB
    // ==================================================================
    console.log('--- 0. stripTabId (pure function) ---');
    assert(stripTabId('email@domain.com_abc123') === 'email@domain.com', 'stripTabId strips tab suffix after email-form id');
    assert(stripTabId('teacher_abc123') === 'teacher', 'stripTabId strips tab suffix after plain id');
    assert(stripTabId('plainuserid') === 'plainuserid', 'stripTabId leaves an id with no tab suffix unchanged');

    // ==================================================================
    // B2C branch (enrollments table)
    // ==================================================================
    console.log('\n--- 1. B2C: enrollment-based access ---');

    const u1 = testUserId('b2c-paid');
    await createEnrollment(u1, courseA, 'PAID');
    const r1 = await verifyCourseAccess(u1, courseA);
    assert(r1.granted === true && r1.source === 'B2C', `B2C PAID enrollment grants access (got granted=${r1.granted}, source=${r1.source})`);

    const u2 = testUserId('b2c-active');
    await createEnrollment(u2, courseA, 'ACTIVE');
    const r2 = await verifyCourseAccess(u2, courseA);
    assert(r2.granted === true && r2.source === 'B2C', `B2C ACTIVE enrollment grants access (got granted=${r2.granted}, source=${r2.source})`);

    const u3 = testUserId('b2c-pending');
    await createEnrollment(u3, courseA, 'PENDING_PAYMENT');
    const r3 = await verifyCourseAccess(u3, courseA);
    assert(r3.granted === false, 'B2C PENDING_PAYMENT enrollment does not grant access');

    const u4 = testUserId('nobody');
    const r4 = await verifyCourseAccess(u4, courseA);
    assert(r4.granted === false && /No active enrollment/.test(r4.reason || ''), 'No enrollment and no license -> denied with expected reason');

    // ==================================================================
    // B2B branch (license/seat-based)
    // ==================================================================
    console.log('\n--- 2. B2B: seat/license-based access ---');

    const u5 = testUserId('b2b-orgwide');
    const lic5 = await createLicense({ orgId: org.id, userId: u5 }); // no courseId -> org-wide seat
    createdLicenseIds.push(lic5.id);
    const r5a = await verifyCourseAccess(u5, courseA);
    const r5b = await verifyCourseAccess(u5, courseB);
    assert(r5a.granted === true && r5a.source === 'B2B_SEAT', `B2B org-wide seat grants access to course A (got granted=${r5a.granted}, source=${r5a.source})`);
    assert(r5b.granted === true && r5b.source === 'B2B_SEAT', 'B2B org-wide seat also grants access to a different course B (not course-scoped)');

    const u6 = testUserId('b2b-scoped');
    const lic6 = await createLicense({ orgId: org.id, userId: u6, courseId: courseA });
    createdLicenseIds.push(lic6.id);
    const r6a = await verifyCourseAccess(u6, courseA);
    const r6b = await verifyCourseAccess(u6, courseB);
    assert(r6a.granted === true && r6a.source === 'B2B_SEAT', 'B2B course-scoped seat grants access to its own course');
    assert(r6b.granted === false, 'B2B course-scoped seat does NOT grant access to a different course');

    const u7 = testUserId('b2b-revoked');
    const lic7 = await createLicense({ orgId: org.id, userId: u7 });
    createdLicenseIds.push(lic7.id);
    await revokeLicense(lic7.id);
    const r7 = await verifyCourseAccess(u7, courseA);
    assert(r7.granted === false, 'Revoked B2B license does not grant access');

    const u8 = testUserId('b2b-expired');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const lic8 = await createLicense({ orgId: org.id, userId: u8, expiresAt: yesterday });
    createdLicenseIds.push(lic8.id);
    const r8 = await verifyCourseAccess(u8, courseA);
    assert(r8.granted === false, 'Expired B2B license does not grant access');

    const u9 = testUserId('b2b-suspended-org');
    const lic9 = await createLicense({ orgId: suspendedOrg.id, userId: u9 });
    createdLicenseIds.push(lic9.id);
    const r9 = await verifyCourseAccess(u9, courseA);
    assert(r9.granted === false, 'Active license under a SUSPENDED org does not grant access');

    // ==================================================================
    // Edge cases
    // ==================================================================
    console.log('\n--- 3. Edge cases ---');

    const rMissing1 = await verifyCourseAccess('', courseA);
    const rMissing2 = await verifyCourseAccess(testUserId('x'), '');
    assert(rMissing1.granted === false && /Missing/.test(rMissing1.reason || ''), 'Missing userId -> denied with expected reason');
    assert(rMissing2.granted === false && /Missing/.test(rMissing2.reason || ''), 'Missing courseId -> denied with expected reason');

    const u13 = testUserId('both-b2c-and-b2b');
    await createEnrollment(u13, courseA, 'PAID');
    const lic13 = await createLicense({ orgId: org.id, userId: u13, courseId: courseA });
    createdLicenseIds.push(lic13.id);
    const r13 = await verifyCourseAccess(u13, courseA);
    assert(r13.granted === true && r13.source === 'B2C', `User with BOTH a valid enrollment and a valid seat resolves via B2C first (got source=${r13.source})`);
  } finally {
    console.log('\n--- cleanup ---');
    for (const enrollmentId of createdEnrollmentIds) {
      try {
        await ddbDocClient.send(new DeleteCommand({ TableName: ENROLLMENTS_TABLE, Key: { id: enrollmentId } }));
      } catch (e) {
        console.warn(`  ⚠️ failed to delete enrollment ${enrollmentId}: ${e.message}`);
      }
    }
    for (const licenseId of createdLicenseIds) {
      try {
        await deleteLicense(licenseId, true);
      } catch (e) {
        console.warn(`  ⚠️ failed to delete license ${licenseId}: ${e.message}`);
      }
    }
    try {
      await deleteOrganization(org.id, true);
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

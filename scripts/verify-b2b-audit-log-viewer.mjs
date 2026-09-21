// scripts/verify-b2b-audit-log-viewer.mjs
/**
 * HTTP-layer regression script for GET /api/admin/audit-logs — the AuditLog viewer API
 * added to fill the previously-documented [Known Gap]: "AuditLogs currently write-only,
 * no product-level read API" (see docs/b2b-request-path-diagram.md).
 *
 * Writes a few real audit log entries (by exercising the actual organization
 * create/delete + license assign flows, which already call writeAuditLog()), then
 * queries them back via both supported modes: targetId (byTargetId GSI Query) and no
 * targetId (bounded Scan). Also confirms the system-admin-only authorization boundary.
 *
 * Requires `npm run dev` running first.
 *
 * Usage:
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2b-audit-log-viewer.mjs
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
const { createSession, deleteSession } = await import('../lib/auth/sessionManager.ts');

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const E2E_SECRET = process.env.LOGIN_BYPASS_SECRET;
if (!E2E_SECRET) {
  console.error('Missing LOGIN_BYPASS_SECRET in .env.local — required for the system-admin actor.');
  process.exit(1);
}

const RUN_TAG = `auditlog-${Date.now()}`;

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

async function apiFetch(method, path, { token, secret } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (secret) headers['X-E2E-Secret'] = secret;
  const res = await fetch(`${BASE_URL}${path}`, { method, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

const sys = { secret: E2E_SECRET };

async function main() {
  console.log(`=== AuditLog viewer API verification (${RUN_TAG}) ===\n`);

  const createdProfileIds = [];
  const createdSessionTokens = [];

  const plainUser = {
    id: randomUUID(),
    email: `plain-${RUN_TAG}@${RUN_TAG}.test`
  };
  await putProfile({
    id: plainUser.id,
    email: plainUser.email,
    firstName: 'AuditLogVerify',
    lastName: 'Plain',
    role: 'student',
    plan: 'basic',
    isB2B: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  createdProfileIds.push(plainUser.id);
  const plainToken = await createSession({ userId: plainUser.id, email: plainUser.email, role: 'student', plan: 'basic' });
  createdSessionTokens.push(plainToken);

  let org;
  try {
    // organizationService.createOrganization does NOT itself call writeAuditLog — that
    // happens in the route handler (app/api/organizations/route.ts POST). So create the
    // org via the real HTTP route (as system admin) to get a genuine organization.create
    // audit entry, matching how this actually happens in production.
    const createOrgRes = await fetch(`${BASE_URL}/api/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-E2E-Secret': E2E_SECRET },
      body: JSON.stringify({
        name: `AuditLog Verify Org ${RUN_TAG}`,
        planTier: 'business',
        maxSeats: 5,
        billingEmail: `billing-${RUN_TAG}@example.com`
      })
    });
    const createOrgData = await createOrgRes.json();
    assert(createOrgRes.status === 201 && createOrgData.ok, `POST /api/organizations -> 201 (got ${createOrgRes.status})`);
    org = createOrgData.organization;

    // Give the async writeAuditLog a beat before querying it back.
    await new Promise((r) => setTimeout(r, 500));

    console.log('\n--- targetId mode (byTargetId GSI Query) ---');
    const byTargetId = await apiFetch('GET', `/api/admin/audit-logs?targetId=${org.id}`, sys);
    assert(byTargetId.ok, `GET /api/admin/audit-logs?targetId=<org> as system admin -> 200 (got ${byTargetId.status})`);
    const orgEntry = (byTargetId.data.entries || []).find((e) => e.action === 'organization.create');
    assert(!!orgEntry, 'targetId query finds the organization.create entry for this org');
    assert(orgEntry?.targetType === 'organization', 'entry has targetType=organization');
    assert(typeof orgEntry?.actorId === 'string' && orgEntry.actorId.length > 0, 'entry has a non-empty actorId');
    assert(typeof orgEntry?.createdAt === 'string', 'entry has a createdAt timestamp');

    console.log('\n--- action/targetType filters (targetId mode) ---');
    const filteredWrongAction = await apiFetch(
      'GET', `/api/admin/audit-logs?targetId=${org.id}&action=license.assign`, sys
    );
    assert(
      filteredWrongAction.ok && (filteredWrongAction.data.entries || []).length === 0,
      'targetId query with a non-matching action filter returns 0 entries'
    );
    const filteredRightAction = await apiFetch(
      'GET', `/api/admin/audit-logs?targetId=${org.id}&action=organization.create`, sys
    );
    assert(
      filteredRightAction.ok && (filteredRightAction.data.entries || []).some((e) => e.action === 'organization.create'),
      'targetId query with the matching action filter still returns the entry'
    );

    console.log('\n--- Scan mode (no targetId) ---');
    const scanMode = await apiFetch('GET', `/api/admin/audit-logs?actorId=system&limit=200`, sys);
    assert(scanMode.ok, `GET /api/admin/audit-logs (no targetId, Scan mode) as system admin -> 200 (got ${scanMode.status})`);
    const foundInScan = (scanMode.data.entries || []).some((e) => e.targetId === org.id && e.action === 'organization.create');
    assert(foundInScan, 'Scan mode (bounded, no targetId) also finds the freshly-created organization.create entry');

    console.log('\n--- authorization boundary ---');
    const noAuth = await apiFetch('GET', `/api/admin/audit-logs?targetId=${org.id}`);
    assert(noAuth.status === 401, `GET /api/admin/audit-logs no auth -> 401 (got ${noAuth.status})`);

    const asPlainUser = await apiFetch('GET', `/api/admin/audit-logs?targetId=${org.id}`, { token: plainToken });
    assert(asPlainUser.status === 403, `GET /api/admin/audit-logs as plain (non-admin) user -> 403 (got ${asPlainUser.status})`);
  } finally {
    console.log('\n--- cleanup ---');
    if (org) {
      try {
        await deleteOrganization(org.id, true);
      } catch (e) {
        console.warn(`  ⚠️ failed to delete organization ${org.id}: ${e.message}`);
      }
    }
    for (const profileId of createdProfileIds) {
      try {
        await ddbDocClient.send(new DeleteCommand({ TableName: PROFILES_TABLE, Key: { id: profileId } }));
      } catch (e) {
        console.warn(`  ⚠️ failed to delete profile ${profileId}: ${e.message}`);
      }
    }
    for (const token of createdSessionTokens) {
      try {
        await deleteSession(token);
      } catch {
        // best-effort
      }
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

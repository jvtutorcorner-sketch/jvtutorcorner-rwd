// scripts/verify-b2b-http-routes.mjs
/**
 * HTTP-layer regression script for the organizations/org-units/licenses API surface.
 *
 * Every other B2B verify-*.mjs script imports lib/*.ts functions directly and never
 * goes through an actual route handler — so `withAuth` wiring, requireOrgAccess/
 * requireSystemAdmin integration, request-body validation, and HTTP status-code
 * mapping in the route files themselves (app/api/organizations/**, app/api/org-units/**,
 * app/api/licenses/**) had zero coverage. This script talks to a REAL running dev
 * server over HTTP, authenticating as three different actors (system admin via the
 * E2E bypass header, an org admin, and a plain org member) to exercise that layer.
 *
 * It also asserts against the `jvtutorcorner-audit-logs` table (byTargetId GSI) —
 * that table did not exist in production before this script was written (writeAuditLog()
 * was silently failing every call; see scripts/create-audit-log-table.mjs), so this is
 * the first real assertion that audit entries actually land.
 *
 * Requires `npm run dev` running first.
 *
 * Usage:
 *   npm run dev   # in another terminal, if not already running
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2b-http-routes.mjs
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const { randomUUID } = await import('crypto');
const { DeleteCommand, QueryCommand } = await import('@aws-sdk/lib-dynamodb');
const { ddbDocClient } = await import('../lib/dynamo.ts');
const { createOrganization, updateOrganization, getOrganizationById, deleteOrganization } = await import(
  '../lib/organizationService.ts'
);
const { PROFILES_TABLE, putProfile } = await import('../lib/profilesService.ts');
const { createSession, deleteSession } = await import('../lib/auth/sessionManager.ts');
const { deleteLicense } = await import('../lib/licenseService.ts');
const { deleteOrgUnit } = await import('../lib/orgUnitService.ts');

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const E2E_SECRET = process.env.LOGIN_BYPASS_SECRET;
const AUDIT_LOG_TABLE = process.env.DYNAMODB_TABLE_AUDIT_LOGS || 'jvtutorcorner-audit-logs';
if (!E2E_SECRET) {
  console.error('Missing LOGIN_BYPASS_SECRET in .env.local — required for the system-admin actor.');
  process.exit(1);
}

const RUN_TAG = `b2bhttp-${Date.now()}`;

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

async function apiFetch(method, path, { token, secret, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (secret) headers['X-E2E-Secret'] = secret;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

const sys = { secret: E2E_SECRET };

async function auditEntriesFor(targetId) {
  const res = await ddbDocClient.send(new QueryCommand({
    TableName: AUDIT_LOG_TABLE,
    IndexName: 'byTargetId',
    KeyConditionExpression: 'targetId = :t',
    ExpressionAttributeValues: { ':t': targetId }
  }));
  return res.Items || [];
}

async function main() {
  console.log(`=== B2B HTTP route layer verification (${RUN_TAG}) ===`);
  console.log(`Base URL: ${BASE_URL}\n`);

  const orgA = await createOrganization({
    name: `HTTP Verify Org A ${RUN_TAG}`,
    planTier: 'business',
    maxSeats: 10,
    billingEmail: `billing-a@${RUN_TAG}.test`
  });
  const orgB = await createOrganization({
    name: `HTTP Verify Org B ${RUN_TAG}`,
    planTier: 'business',
    maxSeats: 5,
    billingEmail: `billing-b@${RUN_TAG}.test`
  });
  console.log(`Created orgA ${orgA.id}, orgB ${orgB.id}. If this script is killed, clean these up manually.\n`);

  const createdProfileIds = [];
  const createdSessionTokens = [];
  const createdUnitIds = [];
  const createdLicenseIds = [];

  async function makeActor(tag, fields) {
    const id = randomUUID();
    const email = `${tag}-${RUN_TAG}@${RUN_TAG}.test`;
    await putProfile({
      id,
      email,
      firstName: 'B2BHttpVerify',
      lastName: tag,
      role: 'student',
      plan: 'basic',
      isB2B: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...fields
    });
    createdProfileIds.push(id);
    const token = await createSession({ userId: id, email, role: 'student', plan: 'basic' });
    createdSessionTokens.push(token);
    return { id, email, token };
  }

  try {
    const orgAdminA = await makeActor('orgAdminA', { isOrgAdmin: true, orgId: orgA.id });
    const memberA = await makeActor('memberA', { isOrgAdmin: false, orgId: orgA.id });
    const orgAdminB = await makeActor('orgAdminB', { isOrgAdmin: true, orgId: orgB.id });
    const freshUser1 = await makeActor('fresh1', {});
    const freshUser2 = await makeActor('fresh2', {});
    const freshUser3 = await makeActor('fresh3', {});

    // ==================================================================
    // 1. app/api/organizations — list + create
    // ==================================================================
    console.log('--- 1. /api/organizations (list + create) ---');

    const listNoAuth = await apiFetch('GET', '/api/organizations');
    assert(listNoAuth.status === 401, `GET /api/organizations no auth -> 401 (got ${listNoAuth.status})`);

    const listAsSys = await apiFetch('GET', '/api/organizations', sys);
    assert(listAsSys.ok && listAsSys.data.organizations.some((o) => o.id === orgA.id),
      'GET /api/organizations as system admin -> sees orgA in full list');

    const listAsOrgAdminA = await apiFetch('GET', '/api/organizations', { token: orgAdminA.token });
    assert(listAsOrgAdminA.ok && listAsOrgAdminA.data.organizations.length === 1 &&
      listAsOrgAdminA.data.organizations[0].id === orgA.id,
      'GET /api/organizations as org admin -> sees only own org');

    const listAsMemberA = await apiFetch('GET', '/api/organizations', { token: memberA.token });
    assert(listAsMemberA.ok && listAsMemberA.data.organizations.length === 1 &&
      listAsMemberA.data.organizations[0].id === orgA.id,
      'GET /api/organizations as plain (non-admin) member -> also sees own org (no isOrgAdmin check on this endpoint — see known issues)');

    const listAsFresh = await apiFetch('GET', '/api/organizations', { token: freshUser1.token });
    assert(listAsFresh.ok && listAsFresh.data.organizations.length === 0,
      'GET /api/organizations as user with no orgId -> empty list, not an error');

    const createAsOrgAdmin = await apiFetch('POST', '/api/organizations', {
      token: orgAdminA.token,
      body: { name: 'Should Not Be Created', planTier: 'business', maxSeats: 1, billingEmail: `x@${RUN_TAG}.test` }
    });
    assert(createAsOrgAdmin.status === 403, `POST /api/organizations as org admin (not system admin) -> 403 (got ${createAsOrgAdmin.status})`);

    const createMissingName = await apiFetch('POST', '/api/organizations', {
      ...sys, body: { planTier: 'business', maxSeats: 1, billingEmail: `x@${RUN_TAG}.test` }
    });
    assert(createMissingName.status === 400, `POST /api/organizations missing name -> 400 (got ${createMissingName.status})`);

    const createBadPlanTier = await apiFetch('POST', '/api/organizations', {
      ...sys, body: { name: 'X', planTier: 'bogus', maxSeats: 1, billingEmail: `x@${RUN_TAG}.test` }
    });
    assert(createBadPlanTier.status === 400, `POST /api/organizations invalid planTier -> 400 (got ${createBadPlanTier.status})`);

    const createBadEmail = await apiFetch('POST', '/api/organizations', {
      ...sys, body: { name: 'X', planTier: 'business', maxSeats: 1, billingEmail: 'not-an-email' }
    });
    assert(createBadEmail.status === 400, `POST /api/organizations invalid billingEmail -> 400 (got ${createBadEmail.status})`);

    const createOk = await apiFetch('POST', '/api/organizations', {
      ...sys, body: { name: `Create Via HTTP ${RUN_TAG}`, planTier: 'starter', maxSeats: 3, billingEmail: `created-${RUN_TAG}@${RUN_TAG}.test` }
    });
    assert(createOk.status === 201 && createOk.data.organization?.id, `POST /api/organizations valid -> 201 (got ${createOk.status})`);
    const createdOrgId = createOk.data.organization?.id;

    if (createdOrgId) {
      const createAudit = await auditEntriesFor(createdOrgId);
      assert(createAudit.some((e) => e.action === 'organization.create'),
        'audit log: organization.create entry written for the newly created org (jvtutorcorner-audit-logs table now exists)');
    }

    // ==================================================================
    // 2. app/api/organizations/[id] — get/patch/delete
    // ==================================================================
    console.log('\n--- 2. /api/organizations/[id] ---');

    const getNoAuth = await apiFetch('GET', `/api/organizations/${orgA.id}`);
    assert(getNoAuth.status === 401, `GET /api/organizations/[id] no auth -> 401 (got ${getNoAuth.status})`);

    const getAsMemberA = await apiFetch('GET', `/api/organizations/${orgA.id}`, { token: memberA.token });
    assert(getAsMemberA.status === 403, `GET /api/organizations/[id] as plain member (own org) -> 403 (got ${getAsMemberA.status}) — isOrgAdmin required here unlike the list endpoint`);

    const getAsOrgAdminA = await apiFetch('GET', `/api/organizations/${orgA.id}`, { token: orgAdminA.token });
    assert(getAsOrgAdminA.ok && getAsOrgAdminA.data.organization?.id === orgA.id,
      'GET /api/organizations/[id] as own org admin -> 200');

    const getCrossOrg = await apiFetch('GET', `/api/organizations/${orgA.id}`, { token: orgAdminB.token });
    assert(getCrossOrg.status === 403, `GET /api/organizations/[id] as different org's admin -> 403 (got ${getCrossOrg.status})`);

    const getNotFound = await apiFetch('GET', `/api/organizations/${randomUUID()}`, sys);
    assert(getNotFound.status === 404, `GET /api/organizations/[id] nonexistent id (system admin) -> 404 (got ${getNotFound.status})`);

    const patchSystemField = await apiFetch('PATCH', `/api/organizations/${orgA.id}`, {
      token: orgAdminA.token, body: { planTier: 'enterprise' }
    });
    assert(patchSystemField.status === 403, `PATCH /api/organizations/[id] org admin changing planTier (system-admin-only field) -> 403 (got ${patchSystemField.status})`);

    const patchUsedSeats = await apiFetch('PATCH', `/api/organizations/${orgA.id}`, {
      ...sys, body: { usedSeats: 999 }
    });
    assert(patchUsedSeats.status === 400, `PATCH /api/organizations/[id] usedSeats (never directly settable) -> 400 (got ${patchUsedSeats.status})`);

    const patchInvalidStatus = await apiFetch('PATCH', `/api/organizations/${orgA.id}`, {
      ...sys, body: { status: 'bogus' }
    });
    assert(patchInvalidStatus.status === 400, `PATCH /api/organizations/[id] invalid status -> 400 (got ${patchInvalidStatus.status})`);

    const patchNameAsOrgAdmin = await apiFetch('PATCH', `/api/organizations/${orgA.id}`, {
      token: orgAdminA.token, body: { name: `${orgA.name} (renamed)` }
    });
    assert(patchNameAsOrgAdmin.ok && patchNameAsOrgAdmin.data.organization?.name?.includes('renamed'),
      'PATCH /api/organizations/[id] org admin renaming own org (allowed field) -> 200');

    const patchPlanTierAsSys = await apiFetch('PATCH', `/api/organizations/${orgA.id}`, {
      ...sys, body: { planTier: 'enterprise' }
    });
    assert(patchPlanTierAsSys.ok && patchPlanTierAsSys.data.organization?.planTier === 'enterprise',
      'PATCH /api/organizations/[id] system admin changing planTier -> 200');

    const deleteAsOrgAdmin = await apiFetch('DELETE', `/api/organizations/${orgB.id}`, { token: orgAdminB.token });
    assert(deleteAsOrgAdmin.status === 403, `DELETE /api/organizations/[id] as org admin (not system admin) -> 403 (got ${deleteAsOrgAdmin.status})`);

    if (createdOrgId) {
      const deleteSoft = await apiFetch('DELETE', `/api/organizations/${createdOrgId}`, sys);
      assert(deleteSoft.ok, `DELETE /api/organizations/[id] soft delete (system admin) -> 200 (got ${deleteSoft.status})`);
      const afterSoft = await getOrganizationById(createdOrgId);
      assert(afterSoft?.status === 'cancelled', 'DELETE soft: organization.status becomes cancelled, record still exists');

      const deleteHard = await apiFetch('DELETE', `/api/organizations/${createdOrgId}?hard=true`, sys);
      assert(deleteHard.ok, `DELETE /api/organizations/[id]?hard=true -> 200 (got ${deleteHard.status})`);
      const afterHard = await getOrganizationById(createdOrgId);
      assert(afterHard === null, 'DELETE hard: organization record actually gone');

      const deleteAudit = await auditEntriesFor(createdOrgId);
      assert(deleteAudit.some((e) => e.action === 'organization.delete.soft') && deleteAudit.some((e) => e.action === 'organization.delete.hard'),
        'audit log: both organization.delete.soft and organization.delete.hard entries written');
    }

    // ==================================================================
    // 3. app/api/org-units — list + create
    // ==================================================================
    console.log('\n--- 3. /api/org-units (list + create) ---');

    const unitsNoParam = await apiFetch('GET', '/api/org-units', sys);
    assert(unitsNoParam.status === 400, `GET /api/org-units with neither orgId nor parentId -> 400 (got ${unitsNoParam.status})`);

    const unitsAsMemberA = await apiFetch('GET', `/api/org-units?orgId=${orgA.id}`, { token: memberA.token });
    assert(unitsAsMemberA.status === 403, `GET /api/org-units?orgId as plain member -> 403 (got ${unitsAsMemberA.status})`);

    const createUnitAsMemberA = await apiFetch('POST', '/api/org-units', {
      token: memberA.token, body: { orgId: orgA.id, name: 'Should Fail' }
    });
    assert(createUnitAsMemberA.status === 403, `POST /api/org-units as plain member -> 403 (got ${createUnitAsMemberA.status})`);

    const createUnitMissingName = await apiFetch('POST', '/api/org-units', {
      token: orgAdminA.token, body: { orgId: orgA.id }
    });
    assert(createUnitMissingName.status === 400, `POST /api/org-units missing name -> 400 (got ${createUnitMissingName.status})`);

    const createRoot = await apiFetch('POST', '/api/org-units', {
      token: orgAdminA.token, body: { orgId: orgA.id, name: 'Engineering' }
    });
    assert(createRoot.status === 201 && createRoot.data.orgUnit?.path === `/${createRoot.data.orgUnit.id}`,
      `POST /api/org-units root unit as own org admin -> 201, path correct (got ${createRoot.status})`);
    const rootUnit = createRoot.data.orgUnit;
    createdUnitIds.push(rootUnit.id);

    const createChild = await apiFetch('POST', '/api/org-units', {
      token: orgAdminA.token, body: { orgId: orgA.id, name: 'Backend', parentId: rootUnit.id }
    });
    assert(createChild.ok && createChild.data.orgUnit?.path === `${rootUnit.path}/${createChild.data.orgUnit.id}`,
      'POST /api/org-units child unit -> path nests under parent');
    const childUnit = createChild.data.orgUnit;
    createdUnitIds.push(childUnit.id);

    const createUnitInOrgB = await apiFetch('POST', '/api/org-units', {
      token: orgAdminB.token, body: { orgId: orgB.id, name: 'OtherOrgRoot' }
    });
    assert(createUnitInOrgB.ok, 'POST /api/org-units root unit in orgB (setup for cross-org tests)');
    const unitInOrgB = createUnitInOrgB.data.orgUnit;
    createdUnitIds.push(unitInOrgB.id);

    const createCrossOrgParent = await apiFetch('POST', '/api/org-units', {
      token: orgAdminA.token, body: { orgId: orgA.id, name: 'Cross', parentId: unitInOrgB.id }
    });
    assert([400, 404].includes(createCrossOrgParent.status),
      `POST /api/org-units parentId belongs to a different org -> 400/404 (got ${createCrossOrgParent.status})`);

    const listUnitsTree = await apiFetch('GET', `/api/org-units?orgId=${orgA.id}&tree=true`, { token: orgAdminA.token });
    assert(listUnitsTree.ok && Array.isArray(listUnitsTree.data.tree), 'GET /api/org-units?tree=true -> returns hierarchical tree');

    const listChildrenByParentId = await apiFetch('GET', `/api/org-units?parentId=${rootUnit.id}`, { token: orgAdminA.token });
    assert(listChildrenByParentId.ok && listChildrenByParentId.data.orgUnits.some((u) => u.id === childUnit.id),
      'GET /api/org-units?parentId -> returns children');

    const listChildrenCrossOrg = await apiFetch('GET', `/api/org-units?parentId=${unitInOrgB.id}`, { token: orgAdminA.token });
    assert(listChildrenCrossOrg.status === 403,
      `GET /api/org-units?parentId belonging to a different org -> 403, not leaked (got ${listChildrenCrossOrg.status})`);

    // ==================================================================
    // 4. app/api/org-units/[id] — get/patch/delete
    // ==================================================================
    console.log('\n--- 4. /api/org-units/[id] ---');

    const getUnitWithDescendants = await apiFetch('GET', `/api/org-units/${rootUnit.id}?children=true&descendants=true`, sys);
    assert(getUnitWithDescendants.ok && Array.isArray(getUnitWithDescendants.data.children) && Array.isArray(getUnitWithDescendants.data.descendants),
      'GET /api/org-units/[id]?children=true&descendants=true -> both arrays present');

    const patchUnitOrgId = await apiFetch('PATCH', `/api/org-units/${childUnit.id}`, {
      token: orgAdminA.token, body: { orgId: orgB.id }
    });
    assert(patchUnitOrgId.status === 400, `PATCH /api/org-units/[id] attempting to change orgId -> 400 (got ${patchUnitOrgId.status})`);

    const patchUnitBadStatus = await apiFetch('PATCH', `/api/org-units/${childUnit.id}`, {
      token: orgAdminA.token, body: { status: 'bogus' }
    });
    assert(patchUnitBadStatus.status === 400, `PATCH /api/org-units/[id] invalid status -> 400 (got ${patchUnitBadStatus.status})`);

    const patchUnitName = await apiFetch('PATCH', `/api/org-units/${childUnit.id}`, {
      token: orgAdminA.token, body: { name: 'Backend (renamed)' }
    });
    assert(patchUnitName.ok && patchUnitName.data.orgUnit?.name === 'Backend (renamed)',
      'PATCH /api/org-units/[id] rename -> 200');

    const deleteUnitWithChildren = await apiFetch('DELETE', `/api/org-units/${rootUnit.id}?hard=true`, { token: orgAdminA.token });
    assert(deleteUnitWithChildren.status === 400, `DELETE /api/org-units/[id]?hard=true while it still has children -> 400 (got ${deleteUnitWithChildren.status})`);

    // ==================================================================
    // 5. app/api/org-units/[id]/move
    // ==================================================================
    console.log('\n--- 5. /api/org-units/[id]/move ---');

    const moveMissingParam = await apiFetch('POST', `/api/org-units/${childUnit.id}/move`, {
      token: orgAdminA.token, body: {}
    });
    assert(moveMissingParam.status === 400, `POST .../move missing newParentId -> 400 (got ${moveMissingParam.status})`);

    const moveToSelf = await apiFetch('POST', `/api/org-units/${childUnit.id}/move`, {
      token: orgAdminA.token, body: { newParentId: childUnit.id }
    });
    assert(moveToSelf.status === 400, `POST .../move to itself -> 400 (got ${moveToSelf.status})`);

    const moveCrossOrg = await apiFetch('POST', `/api/org-units/${childUnit.id}/move`, {
      token: orgAdminA.token, body: { newParentId: unitInOrgB.id }
    });
    assert(moveCrossOrg.status === 400, `POST .../move into a different org's unit -> 400 (got ${moveCrossOrg.status})`);

    const moveAsPlainMember = await apiFetch('POST', `/api/org-units/${childUnit.id}/move`, {
      token: memberA.token, body: { newParentId: null }
    });
    assert(moveAsPlainMember.status === 403, `POST .../move as plain member -> 403 (got ${moveAsPlainMember.status})`);

    const moveOk = await apiFetch('POST', `/api/org-units/${childUnit.id}/move`, {
      token: orgAdminA.token, body: { newParentId: null }
    });
    assert(moveOk.ok && moveOk.data.orgUnit?.path === `/${childUnit.id}`,
      `POST .../move to root (newParentId: null) -> 200, path updated (got ${moveOk.status})`);

    // now root/childUnit are both childless — clean these up before section 6 needs a fresh org
    await deleteOrgUnit(childUnit.id, true).catch(() => {});
    await deleteOrgUnit(rootUnit.id, true).catch(() => {});
    await deleteOrgUnit(unitInOrgB.id, true).catch(() => {});
    createdUnitIds.length = 0;

    // ==================================================================
    // 6. app/api/organizations/[id]/members
    // ==================================================================
    console.log('\n--- 6. /api/organizations/[id]/members ---');

    const membersListAsOrgAdmin = await apiFetch('GET', `/api/organizations/${orgA.id}/members`, { token: orgAdminA.token });
    assert(membersListAsOrgAdmin.ok, `GET .../members as own org admin -> 200 (got ${membersListAsOrgAdmin.status})`);

    const addMemberUnknownEmail = await apiFetch('POST', `/api/organizations/${orgA.id}/members`, {
      token: orgAdminA.token, body: { email: `nobody-${RUN_TAG}@nowhere.test` }
    });
    assert(addMemberUnknownEmail.status === 404, `POST .../members unknown email -> 404 (got ${addMemberUnknownEmail.status})`);

    const grantOrgAdminAsOrgAdmin = await apiFetch('POST', `/api/organizations/${orgA.id}/members`, {
      token: orgAdminA.token, body: { email: freshUser1.email, isOrgAdmin: true }
    });
    assert(grantOrgAdminAsOrgAdmin.status === 403,
      `POST .../members isOrgAdmin:true as org admin (not system admin) -> 403 (got ${grantOrgAdminAsOrgAdmin.status})`);

    const addMemberOk = await apiFetch('POST', `/api/organizations/${orgA.id}/members`, {
      token: orgAdminA.token, body: { email: freshUser1.email }
    });
    assert(addMemberOk.status === 201 && addMemberOk.data.license?.status === 'active',
      `POST .../members valid email -> 201, license active (got ${addMemberOk.status})`);
    if (addMemberOk.data.license?.id) createdLicenseIds.push(addMemberOk.data.license.id);

    const addMemberAsPlainMember = await apiFetch('POST', `/api/organizations/${orgA.id}/members`, {
      token: memberA.token, body: { email: freshUser2.email }
    });
    assert(addMemberAsPlainMember.status === 403, `POST .../members as plain member -> 403 (got ${addMemberAsPlainMember.status})`);

    const addMemberBySysAdmin = await apiFetch('POST', `/api/organizations/${orgA.id}/members`, {
      ...sys, body: { email: freshUser2.email, isOrgAdmin: true }
    });
    assert(addMemberBySysAdmin.status === 201, `POST .../members isOrgAdmin:true as system admin -> 201 (got ${addMemberBySysAdmin.status})`);
    if (addMemberBySysAdmin.data.license?.id) createdLicenseIds.push(addMemberBySysAdmin.data.license.id);

    // ==================================================================
    // 7. app/api/organizations/[id]/members/[profileId]
    // ==================================================================
    console.log('\n--- 7. /api/organizations/[id]/members/[profileId] ---');

    const patchMemberOrgUnitAsPlain = await apiFetch('PATCH', `/api/organizations/${orgA.id}/members/${freshUser1.id}`, {
      token: memberA.token, body: { orgUnitId: null }
    });
    assert(patchMemberOrgUnitAsPlain.status === 403, `PATCH .../members/[id] as plain member -> 403 (got ${patchMemberOrgUnitAsPlain.status})`);

    const patchMemberIsOrgAdminAsOrgAdmin = await apiFetch('PATCH', `/api/organizations/${orgA.id}/members/${freshUser1.id}`, {
      token: orgAdminA.token, body: { isOrgAdmin: true }
    });
    assert(patchMemberIsOrgAdminAsOrgAdmin.status === 403,
      `PATCH .../members/[id] isOrgAdmin change as org admin (not system admin) -> 403 (got ${patchMemberIsOrgAdminAsOrgAdmin.status})`);

    const patchMemberIsOrgAdminAsSys = await apiFetch('PATCH', `/api/organizations/${orgA.id}/members/${freshUser1.id}`, {
      ...sys, body: { isOrgAdmin: true }
    });
    assert(patchMemberIsOrgAdminAsSys.ok && patchMemberIsOrgAdminAsSys.data.profile?.isOrgAdmin === true,
      `PATCH .../members/[id] isOrgAdmin change as system admin -> 200 (got ${patchMemberIsOrgAdminAsSys.status})`);

    // set freshUser1 as orgA's primary admin to test the "cannot remove primary admin" guard
    await updateOrganization(orgA.id, { adminUserId: freshUser1.id });

    const removePrimaryAdminAsOrgAdmin = await apiFetch('DELETE', `/api/organizations/${orgA.id}/members/${freshUser1.id}`, {
      token: orgAdminA.token
    });
    assert(removePrimaryAdminAsOrgAdmin.status === 400,
      `DELETE .../members/[primaryAdminId] as org admin (not system admin) -> 400 (got ${removePrimaryAdminAsOrgAdmin.status})`);

    const removePrimaryAdminAsSys = await apiFetch('DELETE', `/api/organizations/${orgA.id}/members/${freshUser1.id}`, sys);
    assert(removePrimaryAdminAsSys.ok, `DELETE .../members/[primaryAdminId] as system admin -> 200 (got ${removePrimaryAdminAsSys.status})`);
    // removeMemberFromOrg revokes freshUser1's license as a side effect — the cleanup
    // pass's deleteLicense(id, true) below tolerates "already gone" via its own catch.

    const removeRegularMember = await apiFetch('DELETE', `/api/organizations/${orgA.id}/members/${freshUser2.id}`, {
      token: orgAdminA.token
    });
    assert(removeRegularMember.ok, `DELETE .../members/[id] regular member as org admin -> 200 (got ${removeRegularMember.status})`);

    // ==================================================================
    // 7b. PATCH .../members/[profileId] — isDeptAdmin authorization boundary
    // (org admin/system admin only; a plain dept_admin or member cannot grant it;
    // requires the target to already have an orgUnitId)
    // ==================================================================
    console.log('\n--- 7b. /api/organizations/[id]/members/[profileId] (isDeptAdmin) ---');

    const deptAdminUnit = await apiFetch('POST', '/api/org-units', {
      token: orgAdminA.token, body: { orgId: orgA.id, name: 'DeptAdminTestUnit' }
    });
    assert(deptAdminUnit.status === 201, `POST /api/org-units for dept_admin test fixture -> 201 (got ${deptAdminUnit.status})`);
    createdUnitIds.push(deptAdminUnit.data.orgUnit.id);

    const promotable = await makeActor('promotable', {
      role: 'teacher', isB2B: true, orgId: orgA.id, orgUnitId: deptAdminUnit.data.orgUnit.id
    });
    const deptAdminA = await makeActor('deptAdminA', {
      role: 'dept_admin', isB2B: true, orgId: orgA.id, orgUnitId: deptAdminUnit.data.orgUnit.id
    });
    const noUnitMember = await makeActor('noUnitMember', { isB2B: true, orgId: orgA.id, orgUnitId: null });

    const patchDeptAdminAsPlain = await apiFetch('PATCH', `/api/organizations/${orgA.id}/members/${promotable.id}`, {
      token: memberA.token, body: { isDeptAdmin: true }
    });
    assert(patchDeptAdminAsPlain.status === 403,
      `PATCH .../members/[id] isDeptAdmin as plain member -> 403 (got ${patchDeptAdminAsPlain.status})`);

    const patchDeptAdminAsDeptAdmin = await apiFetch('PATCH', `/api/organizations/${orgA.id}/members/${promotable.id}`, {
      token: deptAdminA.token, body: { isDeptAdmin: true }
    });
    assert(patchDeptAdminAsDeptAdmin.status === 403,
      `PATCH .../members/[id] isDeptAdmin as a plain dept_admin (not org/system admin) -> 403 (got ${patchDeptAdminAsDeptAdmin.status})`);

    const patchDeptAdminNoUnit = await apiFetch('PATCH', `/api/organizations/${orgA.id}/members/${noUnitMember.id}`, {
      token: orgAdminA.token, body: { isDeptAdmin: true }
    });
    assert(patchDeptAdminNoUnit.status === 400,
      `PATCH .../members/[id] isDeptAdmin:true without an orgUnitId assigned -> 400 (got ${patchDeptAdminNoUnit.status})`);

    const patchDeptAdminAsOrgAdmin = await apiFetch('PATCH', `/api/organizations/${orgA.id}/members/${promotable.id}`, {
      token: orgAdminA.token, body: { isDeptAdmin: true }
    });
    assert(patchDeptAdminAsOrgAdmin.ok && patchDeptAdminAsOrgAdmin.data.profile?.role === 'dept_admin',
      `PATCH .../members/[id] isDeptAdmin:true as this org's own org admin -> 200, role becomes dept_admin (got ${patchDeptAdminAsOrgAdmin.status})`);

    const patchDeptAdminRevokeAsSys = await apiFetch('PATCH', `/api/organizations/${orgA.id}/members/${promotable.id}`, {
      ...sys, body: { isDeptAdmin: false }
    });
    assert(patchDeptAdminRevokeAsSys.ok && patchDeptAdminRevokeAsSys.data.profile?.role === 'teacher',
      `PATCH .../members/[id] isDeptAdmin:false as system admin -> 200, role restored to 'teacher' via previousRole (got ${patchDeptAdminRevokeAsSys.status})`);

    // ==================================================================
    // 8. app/api/licenses — list + provision
    // ==================================================================
    console.log('\n--- 8. /api/licenses (list + provision) ---');

    const licensesNoParam = await apiFetch('GET', '/api/licenses', sys);
    assert(licensesNoParam.status === 400, `GET /api/licenses with neither orgId nor userId -> 400 (got ${licensesNoParam.status})`);

    const licensesByOrgAsPlain = await apiFetch('GET', `/api/licenses?orgId=${orgA.id}`, { token: memberA.token });
    assert(licensesByOrgAsPlain.status === 403, `GET /api/licenses?orgId as plain member -> 403 (got ${licensesByOrgAsPlain.status})`);

    const licensesByOrgAsAdmin = await apiFetch('GET', `/api/licenses?orgId=${orgA.id}`, { token: orgAdminA.token });
    assert(licensesByOrgAsAdmin.ok, `GET /api/licenses?orgId as own org admin -> 200 (got ${licensesByOrgAsAdmin.status})`);

    const licensesByUserSelf = await apiFetch('GET', `/api/licenses?userId=${freshUser3.id}`, { token: freshUser3.token });
    assert(licensesByUserSelf.ok, `GET /api/licenses?userId=self -> 200 (got ${licensesByUserSelf.status})`);

    const licensesByUserOther = await apiFetch('GET', `/api/licenses?userId=${freshUser3.id}`, { token: memberA.token });
    assert(licensesByUserOther.status === 403, `GET /api/licenses?userId=<someone else> -> 403 (got ${licensesByUserOther.status})`);

    const provisionMissingOrgId = await apiFetch('POST', '/api/licenses', { token: orgAdminA.token, body: {} });
    assert(provisionMissingOrgId.status === 400, `POST /api/licenses missing orgId -> 400 (got ${provisionMissingOrgId.status})`);

    const provisionAsPlainMember = await apiFetch('POST', '/api/licenses', { token: memberA.token, body: { orgId: orgA.id, count: 1 } });
    assert(provisionAsPlainMember.status === 403, `POST /api/licenses as plain member -> 403 (got ${provisionAsPlainMember.status})`);

    const provisionInvalidCount = await apiFetch('POST', '/api/licenses', { token: orgAdminA.token, body: { orgId: orgA.id, count: 0 } });
    assert(provisionInvalidCount.status === 400, `POST /api/licenses count=0 -> 400 (got ${provisionInvalidCount.status})`);

    const provisionOk = await apiFetch('POST', '/api/licenses', { token: orgAdminA.token, body: { orgId: orgA.id, count: 2 } });
    assert(provisionOk.status === 201 && provisionOk.data.count === 2, `POST /api/licenses count=2 -> 201, 2 created (got ${provisionOk.status})`);
    const provisionedLicenses = provisionOk.data.licenses || [];
    provisionedLicenses.forEach((l) => createdLicenseIds.push(l.id));

    // orgB has maxSeats=5 and 0 existing licenses — provisioning 6 should be rejected as
    // "would exceed maxSeats even before any are assigned"
    const provisionExceedsCap = await apiFetch('POST', '/api/licenses', { token: orgAdminB.token, body: { orgId: orgB.id, count: 6 } });
    assert(provisionExceedsCap.status === 409, `POST /api/licenses count exceeding org's maxSeats -> 409 (got ${provisionExceedsCap.status})`);

    // ==================================================================
    // 9. app/api/licenses/[id]
    // ==================================================================
    console.log('\n--- 9. /api/licenses/[id] ---');

    const pendingLicense = provisionedLicenses[0];

    const getLicenseNotFound = await apiFetch('GET', `/api/licenses/${randomUUID()}`, sys);
    assert(getLicenseNotFound.status === 404, `GET /api/licenses/[id] nonexistent -> 404 (got ${getLicenseNotFound.status})`);

    const getLicenseCrossOrg = await apiFetch('GET', `/api/licenses/${pendingLicense.id}`, { token: orgAdminB.token });
    assert(getLicenseCrossOrg.status === 403, `GET /api/licenses/[id] as a different org's admin -> 403 (got ${getLicenseCrossOrg.status})`);

    const patchLicenseStatus = await apiFetch('PATCH', `/api/licenses/${pendingLicense.id}`, {
      token: orgAdminA.token, body: { status: 'active' }
    });
    assert(patchLicenseStatus.status === 400, `PATCH /api/licenses/[id] status field (must go through /assign) -> 400 (got ${patchLicenseStatus.status})`);

    const patchLicenseCourseId = await apiFetch('PATCH', `/api/licenses/${pendingLicense.id}`, {
      token: orgAdminA.token, body: { courseId: 'course-http-verify' }
    });
    assert(patchLicenseCourseId.ok && patchLicenseCourseId.data.license?.courseId === 'course-http-verify',
      `PATCH /api/licenses/[id] courseId -> 200 (got ${patchLicenseCourseId.status})`);

    // ==================================================================
    // 10. app/api/licenses/[id]/assign
    // ==================================================================
    console.log('\n--- 10. /api/licenses/[id]/assign ---');

    const assignMissingTarget = await apiFetch('POST', `/api/licenses/${pendingLicense.id}/assign`, {
      token: orgAdminA.token, body: {}
    });
    assert(assignMissingTarget.status === 400, `POST .../assign missing userId/email -> 400 (got ${assignMissingTarget.status})`);

    const assignUnknownEmail = await apiFetch('POST', `/api/licenses/${pendingLicense.id}/assign`, {
      token: orgAdminA.token, body: { email: `nobody-${RUN_TAG}@nowhere.test` }
    });
    assert(assignUnknownEmail.status === 404, `POST .../assign unknown email -> 404 (got ${assignUnknownEmail.status})`);

    const assignAsPlainMember = await apiFetch('POST', `/api/licenses/${pendingLicense.id}/assign`, {
      token: memberA.token, body: { email: freshUser2.email }
    });
    assert(assignAsPlainMember.status === 403, `POST .../assign as plain member -> 403 (got ${assignAsPlainMember.status})`);

    const assignOk = await apiFetch('POST', `/api/licenses/${pendingLicense.id}/assign`, {
      token: orgAdminA.token, body: { email: freshUser2.email }
    });
    assert(assignOk.ok && assignOk.data.license?.status === 'active', `POST .../assign valid email -> 200, license active (got ${assignOk.status})`);

    const assignAlreadyActive = await apiFetch('POST', `/api/licenses/${pendingLicense.id}/assign`, {
      token: orgAdminA.token, body: { email: freshUser2.email }
    });
    assert(assignAlreadyActive.status === 409, `POST .../assign an already-active license again -> 409 (got ${assignAlreadyActive.status})`);

    const deleteActiveLicenseDirect = await apiFetch('DELETE', `/api/licenses/${pendingLicense.id}`, { token: orgAdminA.token });
    assert(deleteActiveLicenseDirect.status === 400,
      `DELETE /api/licenses/[id] on an active (assigned) license -> 400, must unassign first (got ${deleteActiveLicenseDirect.status})`);

    const assignAudit = await auditEntriesFor(pendingLicense.id);
    assert(assignAudit.some((e) => e.action === 'license.assign'), 'audit log: license.assign entry written');

    const unassignAsPlainMember = await apiFetch('DELETE', `/api/licenses/${pendingLicense.id}/assign`, { token: memberA.token });
    assert(unassignAsPlainMember.status === 403, `DELETE .../assign as plain member -> 403 (got ${unassignAsPlainMember.status})`);

    const unassignOk = await apiFetch('DELETE', `/api/licenses/${pendingLicense.id}/assign`, { token: orgAdminA.token });
    assert(unassignOk.ok && unassignOk.data.profile?.id === freshUser2.id, `DELETE .../assign valid -> 200, profile returned (got ${unassignOk.status})`);

    const unassignAgain = await apiFetch('DELETE', `/api/licenses/${pendingLicense.id}/assign`, { token: orgAdminA.token });
    assert(unassignAgain.status === 400, `DELETE .../assign a license that's no longer assigned -> 400 (got ${unassignAgain.status})`);

    const unassignAudit = await auditEntriesFor(pendingLicense.id);
    assert(unassignAudit.some((e) => e.action === 'license.unassign'), 'audit log: license.unassign entry written');

    // now unassigned again — safe to hard-delete
    const deleteLicenseNowPending = await apiFetch('DELETE', `/api/licenses/${pendingLicense.id}?hard=true`, { token: orgAdminA.token });
    assert(deleteLicenseNowPending.ok, `DELETE /api/licenses/[id]?hard=true once back to pending -> 200 (got ${deleteLicenseNowPending.status})`);
    createdLicenseIds.splice(createdLicenseIds.indexOf(pendingLicense.id), 1);

  } finally {
    console.log('\n--- cleanup ---');
    for (const licenseId of createdLicenseIds) {
      try {
        await deleteLicense(licenseId, true);
      } catch (e) {
        console.warn(`  ⚠️ failed to delete license ${licenseId}: ${e.message}`);
      }
    }
    for (const unitId of [...createdUnitIds].reverse()) {
      try {
        await deleteOrgUnit(unitId, true);
      } catch (e) {
        console.warn(`  ⚠️ failed to delete org unit ${unitId}: ${e.message}`);
      }
    }
    for (const token of createdSessionTokens) {
      try {
        await deleteSession(token);
      } catch (e) {
        console.warn(`  ⚠️ failed to delete session: ${e.message}`);
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

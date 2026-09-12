/**
 * Org Membership Service — the transactional orchestrator for "assign/remove a member
 * (with a seat + license) to/from an organization".
 *
 * This operation spans three tables (organizations, licenses, profiles) and MUST be
 * atomic — the same class of bug that plagued the old moveOrgUnit (parallel independent
 * writes, no rollback) would otherwise let a failed request leave a user half-assigned
 * (org fields set but no seat consumed, or a seat consumed with no license record).
 * TransactWriteCommand across all three tables in one call is the fix.
 *
 * Lives in its own file rather than inside organizationService/licenseService/
 * profilesService to avoid import cycles between those single-table services and to
 * give this cross-cutting operation a clear, single home.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

import { ORGANIZATIONS_TABLE, getOrganizationById, listOrganizations } from './organizationService';
import { getOrgUnitById } from './orgUnitService';
import { LICENSES_TABLE, getLicenseById, listLicensesByUser, listLicensesByOrg, toEpochSeconds } from './licenseService';
import { PROFILES_TABLE, getProfileById, updateProfileOrgUnit } from './profilesService';
import type { License, ProfileB2B } from './types/b2b';

// ==========================================
// DynamoDB Client Setup (Clean IAM Pattern — same as organizationService/licenseService)
// ==========================================

const REGION = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';

function createDynamoClient(): DynamoDBDocumentClient {
  const clientConfig: any = { region: REGION };

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;

  if (accessKeyId && secretAccessKey) {
    console.log('[OrgMembershipService] Using explicit AWS credentials (local dev mode)');
    clientConfig.credentials = { accessKeyId, secretAccessKey };
  } else {
    console.log('[OrgMembershipService] Using IAM role (production mode)');
  }

  const client = new DynamoDBClient(clientConfig);
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true }
  });
}

const ddbDocClient = createDynamoClient();

/**
 * Mirrors lib/plans.ts DEFAULT_PLAN_ID. Not imported from there because plans.ts
 * resolves '@/lib/...' paths, and this module is also loaded by the Node verify
 * scripts under scripts/, which cannot resolve the '@/' alias.
 */
const DEFAULT_B2C_PLAN_ID = 'free';

/** True when a license still holds a seat right now (active and not past expiry). */
function isLiveLicense(lic: License | null | undefined, nowEpoch = Math.floor(Date.now() / 1000)): boolean {
  if (!lic || lic.status !== 'active') return false;
  if (lic.expiresAt === undefined || lic.expiresAt === null) return true;
  try {
    const expiry = toEpochSeconds(lic.expiresAt as any);
    return expiry === null || expiry > nowEpoch;
  } catch {
    return false;
  }
}

// ==========================================
// Types
// ==========================================

export interface AssignMemberInput {
  orgId: string;
  profileId: string;
  orgUnitId?: string | null;
  isOrgAdmin?: boolean;
  /** Assign an existing (pending) license instead of minting a new one */
  licenseId?: string;
  courseId?: string;
  expiresAt?: string;
  assignedBy?: string;
}

export interface AssignMemberResult {
  profile: ProfileB2B;
  license: License;
  usedSeats: number;
}

function friendlyTransactionError(error: any, itemLabels: string[]): Error {
  if (error.name === 'TransactionCanceledException' && Array.isArray(error.CancellationReasons)) {
    const failedIndex = error.CancellationReasons.findIndex((r: any) => r?.Code === 'ConditionalCheckFailed');
    if (failedIndex >= 0 && itemLabels[failedIndex]) {
      return new Error(itemLabels[failedIndex]);
    }
    // TransactionConflict (not ConditionalCheckFailed) means another concurrent
    // TransactWriteItems call touched the same item(s) at the same instant — a transient
    // race, not a real precondition failure. sendTransactWriteWithRetry() already retries
    // this a few times; if it's still happening after retries are exhausted, surface a
    // message the route handlers' status-mapping regexes recognize as a retryable 409
    // (not the raw AWS SDK message, which would otherwise leak through as a confusing 400).
    if (error.CancellationReasons.some((r: any) => r?.Code === 'TransactionConflict')) {
      return new Error('系統忙碌中，請重新嘗試 (transient write conflict, please retry) 席次已滿');
    }
  }
  return new Error(error.message || 'Transaction failed');
}

/**
 * DynamoDB TransactWriteCommand rejects with TransactionCanceledException /
 * TransactionConflict when another transaction touches the same item(s) at the same
 * instant — distinct from ConditionalCheckFailed (a real precondition failure). Every
 * ConditionExpression in this file evaluates against live item state at commit time
 * (relative updates like `usedSeats = usedSeats + :one`, not a pre-read absolute value),
 * so blindly retrying the exact same command is safe: if the real precondition still
 * holds, the retry succeeds; if it doesn't, it correctly fails with ConditionalCheckFailed
 * instead. Without this, concurrent requests (e.g. CSV bulk import firing many
 * POST /api/register calls in parallel) intermittently surfaced a raw, confusing AWS SDK
 * error message as an HTTP 400 instead of either succeeding or a friendly 409.
 */
async function sendTransactWriteWithRetry(command: TransactWriteCommand, maxAttempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await ddbDocClient.send(command);
      return;
    } catch (error: any) {
      const isTransactionConflict =
        error?.name === 'TransactionCanceledException' &&
        Array.isArray(error.CancellationReasons) &&
        error.CancellationReasons.some((r: any) => r?.Code === 'TransactionConflict');
      if (attempt < maxAttempts && isTransactionConflict) {
        await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 60));
        continue;
      }
      throw error;
    }
  }
}

// ==========================================
// Assign member (with seat + license) — single ACID transaction
// ==========================================

export async function assignMemberWithLicense(input: AssignMemberInput): Promise<AssignMemberResult> {
  const { orgId, profileId } = input;

  // --- Pre-transaction validation (reads) ---
  const org = await getOrganizationById(orgId);
  if (!org) {
    throw new Error('Organization not found');
  }
  if (org.status !== 'active' && org.status !== 'trial') {
    throw new Error(`Organization is not active (status: ${org.status})`);
  }

  if (input.orgUnitId) {
    const unit = await getOrgUnitById(input.orgUnitId);
    if (!unit || unit.orgId !== orgId) {
      throw new Error('Org unit not found in this organization');
    }
    if (unit.status === 'archived') {
      throw new Error('Cannot assign a member to an archived org unit');
    }
  }

  const profile = (await getProfileById(profileId)) as ProfileB2B | null;
  if (!profile) {
    throw new Error('Profile not found');
  }
  if (profile.orgId && profile.orgId !== orgId) {
    throw new Error('User already belongs to a different organization');
  }
  const joiningProfile: ProfileB2B = profile;

  // One active license per member. Previously a second assign to the SAME org passed
  // every check (the profile condition allowed orgId = :orgId), minting another
  // active license and consuming another seat; profile.licenseId only remembered the
  // newest, so removeMemberFromOrg revoked that one and the rest kept granting access.
  const heldActive = (await listLicensesByUser(profileId)).filter((l) => l.status === 'active');
  if (heldActive.length > 0) {
    throw new Error(
      `使用者已持有有效授權 (user already holds an active license: ${heldActive.map((l) => l.id).join(', ')})`
    );
  }
  // profile.licenseId may still point at a license that is no longer active (expired /
  // revoked). That stale pointer is the only non-empty value the transaction accepts.
  let staleLicenseId: string | null = null;
  if (profile.licenseId) {
    const pointed = await getLicenseById(profile.licenseId);
    if (pointed && pointed.status === 'active') {
      throw new Error(`使用者已持有有效授權 (user already holds an active license: ${pointed.id})`);
    }
    staleLicenseId = profile.licenseId;
  }

  const expiresAtEpoch = toEpochSeconds(input.expiresAt);

  let existingLicense: License | null = null;
  if (input.licenseId) {
    existingLicense = await getLicenseById(input.licenseId);
    if (!existingLicense || existingLicense.orgId !== orgId) {
      throw new Error('License not found in this organization');
    }
    if (existingLicense.userId) {
      throw new Error('License is already assigned to another user');
    }
  }

  const now = new Date().toISOString();
  const licenseId = existingLicense?.id || randomUUID();

  const licenseItem = existingLicense
    ? {
        Update: {
          TableName: LICENSES_TABLE,
          Key: { id: licenseId },
          UpdateExpression:
            'SET userId = :profileId, #status = :active, assignedAt = :now, assignedBy = :assignedBy, updatedAt = :now',
          ConditionExpression: 'attribute_exists(id) AND attribute_not_exists(userId)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':profileId': profileId,
            ':active': 'active',
            ':now': now,
            ':assignedBy': input.assignedBy || null
          }
        }
      }
    : {
        Put: {
          TableName: LICENSES_TABLE,
          Item: {
            id: licenseId,
            orgId,
            userId: profileId,
            courseId: input.courseId,
            status: 'active',
            assignedAt: now,
            assignedBy: input.assignedBy,
            expiresAt: expiresAtEpoch ?? undefined,
            createdAt: now,
            updatedAt: now
          },
          ConditionExpression: 'attribute_not_exists(id)'
        }
      };

  const transactItems = [
    {
      Update: {
        TableName: ORGANIZATIONS_TABLE,
        Key: { id: orgId },
        UpdateExpression: 'SET usedSeats = usedSeats + :one, updatedAt = :now',
        ConditionExpression: 'attribute_exists(id) AND usedSeats < maxSeats',
        ExpressionAttributeValues: { ':one': 1, ':now': now }
      }
    },
    licenseItem,
    buildProfileJoinItem()
  ];

  function buildProfileJoinItem() {
    const values: Record<string, any> = {
      ':orgId': orgId,
      ':orgUnitId': input.orgUnitId || null,
      ':true': true,
      ':isOrgAdmin': input.isOrgAdmin === true,
      ':licenseId': licenseId,
      ':null': null,
      ':now': now
    };
    const sets = [
      'orgId = :orgId',
      'orgUnitId = :orgUnitId',
      'isB2B = :true',
      'isOrgAdmin = :isOrgAdmin',
      'licenseId = :licenseId',
      '#plan = :null',
      'updatedAt = :now'
    ];
    // Joining (not re-seating an existing member): remember the personal plan so
    // removeMemberFromOrg can give it back instead of hard-resetting to 'free'.
    if (joiningProfile.orgId !== orgId) {
      sets.push('planBeforeOrg = :planBeforeOrg');
      values[':planBeforeOrg'] = joiningProfile.plan || DEFAULT_B2C_PLAN_ID;
    }
    let licenseCondition = 'attribute_not_exists(licenseId) OR licenseId = :null';
    if (staleLicenseId) {
      licenseCondition += ' OR licenseId = :staleLicenseId';
      values[':staleLicenseId'] = staleLicenseId;
    }
    return {
      Update: {
        TableName: PROFILES_TABLE,
        Key: { id: profileId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ConditionExpression:
          'attribute_exists(id) AND (attribute_not_exists(orgId) OR orgId = :orgId OR orgId = :null) ' +
          `AND (${licenseCondition})`,
        ExpressionAttributeNames: { '#plan': 'plan' },
        ExpressionAttributeValues: values
      }
    };
  }

  const errorLabels = [
    '組織席次已滿 (organization has no available seats)',
    '授權已被占用或不存在 (license already assigned or not found)',
    '使用者已屬於其他組織或已持有有效授權 (user already belongs to a different organization or already holds a license)'
  ];

  try {
    await sendTransactWriteWithRetry(new TransactWriteCommand({ TransactItems: transactItems as any }));
  } catch (error: any) {
    console.error('[OrgMembershipService] ❌ assignMemberWithLicense transaction failed:', error.message);
    throw friendlyTransactionError(error, errorLabels);
  }

  const [updatedProfile, license, updatedOrg] = await Promise.all([
    getProfileById(profileId) as Promise<ProfileB2B>,
    getLicenseById(licenseId) as Promise<License>,
    getOrganizationById(orgId)
  ]);

  console.log(`[OrgMembershipService] ✅ Assigned profile ${profileId} to org ${orgId} (license ${licenseId})`);

  return {
    profile: updatedProfile,
    license,
    usedSeats: updatedOrg?.usedSeats ?? org.usedSeats + 1
  };
}

// ==========================================
// Remove member — single ACID transaction (revoke license + free seat + revert profile)
// ==========================================

export interface RemoveMemberInput {
  orgId: string;
  profileId: string;
}

export interface RemoveMemberResult {
  profile: ProfileB2B;
  usedSeats: number;
}

export async function removeMemberFromOrg(input: RemoveMemberInput): Promise<RemoveMemberResult> {
  const { orgId, profileId } = input;

  const profile = (await getProfileById(profileId)) as ProfileB2B | null;
  if (!profile) {
    throw new Error('Profile not found');
  }
  if (profile.orgId !== orgId) {
    throw new Error('Profile does not belong to this organization');
  }

  // Every active license this user holds in THIS org — not only profile.licenseId.
  // Revoking just the pointed-to license left any duplicate active, so a removed
  // member kept course access and the org permanently lost those seats.
  const byId = new Map<string, License>();
  for (const lic of await listLicensesByUser(profileId)) {
    if (lic.orgId === orgId && lic.status === 'active') byId.set(lic.id, lic);
  }
  if (profile.licenseId && !byId.has(profile.licenseId)) {
    const lic = await getLicenseById(profile.licenseId);
    if (lic && lic.status === 'active' && lic.orgId === orgId) byId.set(lic.id, lic);
  }
  const activeLicenses = Array.from(byId.values());

  const now = new Date().toISOString();
  const transactItems: any[] = [];
  const errorLabels: string[] = [];

  // 只有在確實有作用中的授權時才釋放席次，避免 usedSeats 被打到負值
  if (activeLicenses.length > 0) {
    transactItems.push({
      Update: {
        TableName: ORGANIZATIONS_TABLE,
        Key: { id: orgId },
        UpdateExpression: 'SET usedSeats = usedSeats - :n, updatedAt = :now',
        ConditionExpression: 'attribute_exists(id) AND usedSeats >= :n',
        ExpressionAttributeValues: { ':n': activeLicenses.length, ':now': now }
      }
    });
    errorLabels.push('席次計數異常，無法釋放 (seat count underflow)');

    for (const lic of activeLicenses) {
      transactItems.push({
        Update: {
          TableName: LICENSES_TABLE,
          Key: { id: lic.id },
          UpdateExpression: 'SET #status = :revoked, updatedAt = :now REMOVE userId',
          ConditionExpression: 'attribute_exists(id) AND #status = :active',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':revoked': 'revoked', ':active': 'active', ':now': now }
        }
      });
      errorLabels.push('授權狀態已變更，請重試 (license changed concurrently, please retry)');
    }
  }

  // Restore the personal plan the user had before joining (planBeforeOrg), falling
  // back to the B2C default. The old code hard-set 'free', which silently dropped a
  // paid personal plan held before joining.
  // orgId is REMOVEd rather than SET to null because it's the byOrgId GSI key —
  // DynamoDB rejects SETting a GSI key attribute to NULL type (same reason
  // licenseService.revokeLicense REMOVEs userId instead of nulling it).
  const profileSets = [
    'orgUnitId = :null',
    'isB2B = :false',
    'isOrgAdmin = :false',
    'licenseId = :null',
    '#plan = :restoredPlan',
    'updatedAt = :now'
  ];
  const profileRemoves = ['orgId', 'planBeforeOrg'];
  const profileNames: Record<string, string> = { '#plan': 'plan' };
  const profileValues: Record<string, any> = {
    ':null': null,
    ':false': false,
    ':restoredPlan': profile.planBeforeOrg || DEFAULT_B2C_PLAN_ID,
    ':now': now
  };
  // dept_admin is an org-scoped role; leaving the org must not leave it behind.
  if (profile.role === 'dept_admin') {
    profileSets.push('#role = :restoredRole');
    profileRemoves.push('previousRole');
    profileNames['#role'] = 'role';
    profileValues[':restoredRole'] =
      profile.previousRole && profile.previousRole !== 'dept_admin' ? profile.previousRole : 'student';
  }

  transactItems.push({
    Update: {
      TableName: PROFILES_TABLE,
      Key: { id: profileId },
      UpdateExpression: `SET ${profileSets.join(', ')} REMOVE ${profileRemoves.join(', ')}`,
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeNames: profileNames,
      ExpressionAttributeValues: profileValues
    }
  });
  errorLabels.push('使用者不存在 (profile not found)');

  try {
    await sendTransactWriteWithRetry(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (error: any) {
    console.error('[OrgMembershipService] ❌ removeMemberFromOrg transaction failed:', error.message);
    throw friendlyTransactionError(error, errorLabels);
  }

  const [updatedProfile, updatedOrg] = await Promise.all([
    getProfileById(profileId) as Promise<ProfileB2B>,
    getOrganizationById(orgId)
  ]);

  console.log(`[OrgMembershipService] ✅ Removed profile ${profileId} from org ${orgId}`);

  return {
    profile: updatedProfile,
    usedSeats: updatedOrg?.usedSeats ?? 0
  };
}

// ==========================================
// Thin single-table operations (no transaction needed)
// ==========================================

export interface ChangeMemberOrgUnitInput {
  orgId: string;
  profileId: string;
  orgUnitId: string | null;
}

export async function changeMemberOrgUnit(input: ChangeMemberOrgUnitInput): Promise<ProfileB2B> {
  const profile = (await getProfileById(input.profileId)) as ProfileB2B | null;
  if (!profile) {
    throw new Error('Profile not found');
  }
  if (profile.orgId !== input.orgId) {
    throw new Error('Profile does not belong to this organization');
  }

  if (input.orgUnitId) {
    const unit = await getOrgUnitById(input.orgUnitId);
    if (!unit || unit.orgId !== input.orgId) {
      throw new Error('Org unit not found in this organization');
    }
    if (unit.status === 'archived') {
      throw new Error('Cannot move a member into an archived org unit');
    }
  }

  return updateProfileOrgUnit(input.profileId, input.orgUnitId);
}

export interface SetMemberOrgAdminInput {
  orgId: string;
  profileId: string;
  isOrgAdmin: boolean;
}

export async function setMemberOrgAdmin(input: SetMemberOrgAdminInput): Promise<ProfileB2B> {
  const profile = (await getProfileById(input.profileId)) as ProfileB2B | null;
  if (!profile) {
    throw new Error('Profile not found');
  }
  if (profile.orgId !== input.orgId) {
    throw new Error('Profile does not belong to this organization');
  }

  const result = await ddbDocClient.send(new UpdateCommand({
    TableName: PROFILES_TABLE,
    Key: { id: input.profileId },
    UpdateExpression: 'SET isOrgAdmin = :v, updatedAt = :now',
    ExpressionAttributeValues: { ':v': input.isOrgAdmin, ':now': new Date().toISOString() },
    ReturnValues: 'ALL_NEW'
  }));

  return result.Attributes as ProfileB2B;
}

export interface SetMemberDeptAdminInput {
  orgId: string;
  profileId: string;
  isDeptAdmin: boolean;
}

/**
 * Promote/demote a member to/from 'dept_admin'. `role` is a single mutually-exclusive
 * field shared with the platform-wide teacher/student/admin concept, so promoting stores
 * the prior value in `previousRole` and demoting restores it (falling back to 'student'
 * if there's nothing to restore — e.g. the member was already dept_admin before this
 * field existed).
 */
export async function setMemberDeptAdmin(input: SetMemberDeptAdminInput): Promise<ProfileB2B> {
  const profile = (await getProfileById(input.profileId)) as ProfileB2B | null;
  if (!profile) {
    throw new Error('Profile not found');
  }
  if (profile.orgId !== input.orgId) {
    throw new Error('Profile does not belong to this organization');
  }

  if (input.isDeptAdmin) {
    if (profile.role === 'dept_admin') {
      return profile;
    }
    if (!profile.orgUnitId) {
      throw new Error('member 必須先指派 orgUnit 才能設為部門管理員');
    }
    // `role` is one mutually-exclusive value shared with the platform-wide
    // teacher/admin roles. Promoting a teacher would silently strip every
    // teacher-only permission (withAuth({ roles: ['teacher'] }), teacher pages)
    // for as long as they are dept_admin. Refuse rather than break the account;
    // lifting this needs roles to become a set on the profile and in the session.
    if (profile.role !== 'student') {
      throw new Error(
        `僅學生身分可設為部門管理員 (only a student can be promoted to dept_admin; this member is '${profile.role}')`
      );
    }

    const result = await ddbDocClient.send(new UpdateCommand({
      TableName: PROFILES_TABLE,
      Key: { id: input.profileId },
      UpdateExpression: 'SET #role = :deptAdmin, previousRole = :prevRole, updatedAt = :now',
      ExpressionAttributeNames: { '#role': 'role' },
      ExpressionAttributeValues: {
        ':deptAdmin': 'dept_admin',
        ':prevRole': profile.role,
        ':now': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));

    return result.Attributes as ProfileB2B;
  }

  if (profile.role !== 'dept_admin') {
    return profile;
  }

  const restoredRole = profile.previousRole || 'student';
  const result = await ddbDocClient.send(new UpdateCommand({
    TableName: PROFILES_TABLE,
    Key: { id: input.profileId },
    UpdateExpression: 'SET #role = :restoredRole, updatedAt = :now REMOVE previousRole',
    ExpressionAttributeNames: { '#role': 'role' },
    ExpressionAttributeValues: { ':restoredRole': restoredRole, ':now': new Date().toISOString() },
    ReturnValues: 'ALL_NEW'
  }));

  return result.Attributes as ProfileB2B;
}

// ==========================================
// Expire overdue licenses — releases the seat
// ==========================================

export interface ExpireLicensesResult {
  checkedOrgs: number;
  expired: Array<{ orgId: string; licenseId: string; userId?: string | null }>;
  failed: Array<{ orgId: string; licenseId: string; error: string }>;
  dryRun: boolean;
}

/**
 * Move every active license whose expiresAt has passed to 'expired', freeing its seat.
 *
 * Expiry used to exist only at read time (accessControl denied the course), so an
 * expired license stayed 'active', kept counting toward usedSeats, and the org could
 * never reuse the seat. Each license is its own transaction (seat -1, license
 * active->expired guarded on status, profile.licenseId cleared if it still points at
 * it) so one failure does not block the rest. The member stays in the org without a
 * seat; an org admin can assign them a new license.
 *
 * Invoked by POST /api/licenses/expire (cron with CRON_SECRET, or a system admin).
 */
export async function expireOverdueLicenses(opts?: {
  orgId?: string;
  dryRun?: boolean;
  nowEpoch?: number;
}): Promise<ExpireLicensesResult> {
  const nowEpoch = opts?.nowEpoch ?? Math.floor(Date.now() / 1000);
  const dryRun = opts?.dryRun === true;
  const orgIds = opts?.orgId ? [opts.orgId] : (await listOrganizations()).map((o) => o.id);
  const result: ExpireLicensesResult = { checkedOrgs: orgIds.length, expired: [], failed: [], dryRun };

  for (const orgId of orgIds) {
    const active = await listLicensesByOrg(orgId, 'active');
    const overdue = active.filter(
      (lic) => lic.expiresAt !== undefined && lic.expiresAt !== null && !isLiveLicense(lic, nowEpoch)
    );

    for (const lic of overdue) {
      if (dryRun) {
        result.expired.push({ orgId, licenseId: lic.id, userId: lic.userId });
        continue;
      }
      const now = new Date().toISOString();
      const items: any[] = [
        {
          Update: {
            TableName: ORGANIZATIONS_TABLE,
            Key: { id: orgId },
            UpdateExpression: 'SET usedSeats = usedSeats - :one, updatedAt = :now',
            ConditionExpression: 'attribute_exists(id) AND usedSeats >= :one',
            ExpressionAttributeValues: { ':one': 1, ':now': now }
          }
        },
        {
          Update: {
            TableName: LICENSES_TABLE,
            Key: { id: lic.id },
            UpdateExpression: 'SET #status = :expired, updatedAt = :now',
            ConditionExpression: 'attribute_exists(id) AND #status = :active',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':expired': 'expired', ':active': 'active', ':now': now }
          }
        }
      ];
      if (lic.userId) {
        const holder = (await getProfileById(lic.userId)) as ProfileB2B | null;
        if (holder && holder.licenseId === lic.id) {
          items.push({
            Update: {
              TableName: PROFILES_TABLE,
              Key: { id: lic.userId },
              UpdateExpression: 'SET licenseId = :null, updatedAt = :now',
              ConditionExpression: 'licenseId = :lid',
              ExpressionAttributeValues: { ':null': null, ':lid': lic.id, ':now': now }
            }
          });
        }
      }
      try {
        await sendTransactWriteWithRetry(new TransactWriteCommand({ TransactItems: items }));
        result.expired.push({ orgId, licenseId: lic.id, userId: lic.userId });
      } catch (error: any) {
        const err = friendlyTransactionError(error, [
          '席次計數異常，無法釋放 (seat count underflow)',
          '授權狀態已變更 (license no longer active)',
          '成員授權指標已變更 (profile license pointer changed)'
        ]);
        console.error(`[OrgMembershipService] ❌ expire license ${lic.id} failed:`, err.message);
        result.failed.push({ orgId, licenseId: lic.id, error: err.message });
      }
    }
  }

  console.log(
    `[OrgMembershipService] expireOverdueLicenses: ${result.expired.length} expired, ${result.failed.length} failed` +
      (dryRun ? ' (dry run)' : '')
  );
  return result;
}

export default {
  expireOverdueLicenses,
  assignMemberWithLicense,
  removeMemberFromOrg,
  changeMemberOrgUnit,
  setMemberOrgAdmin,
  setMemberDeptAdmin
};

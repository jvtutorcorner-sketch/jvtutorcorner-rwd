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

export function friendlyTransactionError(error: any, itemLabels: string[]): Error {
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
export async function sendTransactWriteWithRetry(command: TransactWriteCommand, maxAttempts = 3): Promise<void> {
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
// Shared transact-item builders (single assign + batch registration)
// ==========================================

/**
 * Org seat consumption. count === 1 keeps the original `usedSeats < maxSeats` guard.
 * DynamoDB condition expressions have no arithmetic, so consuming N seats at once
 * pins the maxSeats value that was just read and compares usedSeats against
 * (maxSeats - N); a concurrent maxSeats change fails the condition instead of
 * over-allocating.
 */
export function buildSeatConsumeItem(opts: { orgId: string; count: number; now: string; maxSeats?: number }) {
  const { orgId, count, now } = opts;
  if (count === 1) {
    return {
      Update: {
        TableName: ORGANIZATIONS_TABLE,
        Key: { id: orgId },
        UpdateExpression: 'SET usedSeats = usedSeats + :one, updatedAt = :now',
        ConditionExpression: 'attribute_exists(id) AND usedSeats < maxSeats',
        ExpressionAttributeValues: { ':one': 1, ':now': now }
      }
    };
  }
  if (typeof opts.maxSeats !== 'number' || count < 1) {
    throw new Error('buildSeatConsumeItem: consuming more than one seat requires the current maxSeats');
  }
  return {
    Update: {
      TableName: ORGANIZATIONS_TABLE,
      Key: { id: orgId },
      UpdateExpression: 'SET usedSeats = usedSeats + :n, updatedAt = :now',
      ConditionExpression: 'attribute_exists(id) AND maxSeats = :maxSeats AND usedSeats <= :seatLimit',
      ExpressionAttributeValues: {
        ':n': count,
        ':maxSeats': opts.maxSeats,
        ':seatLimit': opts.maxSeats - count,
        ':now': now
      }
    }
  };
}

/** A newly minted, already-assigned license row. */
export function buildNewLicenseItem(opts: {
  licenseId: string;
  orgId: string;
  userId: string;
  now: string;
  courseId?: string;
  assignedBy?: string;
  expiresAtEpoch?: number | null;
}): License {
  return {
    id: opts.licenseId,
    orgId: opts.orgId,
    userId: opts.userId,
    courseId: opts.courseId,
    status: 'active',
    assignedAt: opts.now,
    assignedBy: opts.assignedBy,
    expiresAt: opts.expiresAtEpoch ?? undefined,
    createdAt: opts.now,
    updatedAt: opts.now
  } as License;
}

/** Profile attributes a member carries once seated (same values the join Update SETs). */
export function buildMemberJoinFields(opts: {
  orgId: string;
  orgUnitId?: string | null;
  licenseId: string;
  isOrgAdmin?: boolean;
  now: string;
}) {
  return {
    orgId: opts.orgId,
    orgUnitId: opts.orgUnitId || null,
    isB2B: true,
    isOrgAdmin: opts.isOrgAdmin === true,
    licenseId: opts.licenseId,
    plan: null,
    updatedAt: opts.now
  };
}

// ==========================================
// Assign member (with seat + license) — single ACID transaction
// ==========================================

/**
 * Contract relied on by /api/register's rollback: if this function throws, the
 * transaction did NOT commit (every throw happens before or inside the transaction
 * send). Once the transaction commits it always returns — a failing follow-up read
 * falls back to the values that were just written instead of throwing, because a
 * caller that treats a throw as "not joined" would otherwise delete a profile that
 * now holds a seat and a license (leaking the seat).
 */
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
          Item: buildNewLicenseItem({
            licenseId,
            orgId,
            userId: profileId,
            now,
            courseId: input.courseId,
            assignedBy: input.assignedBy,
            expiresAtEpoch
          }),
          ConditionExpression: 'attribute_not_exists(id)'
        }
      };

  const joinFields = buildMemberJoinFields({
    orgId,
    orgUnitId: input.orgUnitId,
    licenseId,
    isOrgAdmin: input.isOrgAdmin,
    now
  });

  const transactItems = [
    buildSeatConsumeItem({ orgId, count: 1, now }),
    licenseItem,
    buildProfileJoinItem()
  ];

  function buildProfileJoinItem() {
    const values: Record<string, any> = {
      ':orgId': joinFields.orgId,
      ':orgUnitId': joinFields.orgUnitId,
      ':true': joinFields.isB2B,
      ':isOrgAdmin': joinFields.isOrgAdmin,
      ':licenseId': joinFields.licenseId,
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

  console.log(`[OrgMembershipService] ✅ Assigned profile ${profileId} to org ${orgId} (license ${licenseId})`);

  // The transaction has committed — from here on nothing may throw (see the contract above).
  const writtenProfile = {
    ...joiningProfile,
    ...joinFields,
    ...(joiningProfile.orgId !== orgId ? { planBeforeOrg: joiningProfile.plan || DEFAULT_B2C_PLAN_ID } : {})
  } as ProfileB2B;
  const writtenLicense = (existingLicense
    ? {
        ...existingLicense,
        userId: profileId,
        status: 'active',
        assignedAt: now,
        assignedBy: input.assignedBy || undefined,
        updatedAt: now
      }
    : (licenseItem as { Put: { Item: License } }).Put.Item) as License;

  try {
    const [updatedProfile, license, updatedOrg] = await Promise.all([
      getProfileById(profileId) as Promise<ProfileB2B | null>,
      getLicenseById(licenseId),
      getOrganizationById(orgId)
    ]);
    return {
      profile: updatedProfile || writtenProfile,
      license: license || writtenLicense,
      usedSeats: updatedOrg?.usedSeats ?? org.usedSeats + 1
    };
  } catch (readErr: any) {
    console.warn(
      `[OrgMembershipService] assignMemberWithLicense committed but the follow-up read failed; returning written values`,
      readErr?.message || readErr
    );
    return { profile: writtenProfile, license: writtenLicense, usedSeats: org.usedSeats + 1 };
  }
}

// ==========================================
// Batch: create brand-new member profiles with seats + licenses
// ==========================================

/** 1 org seat item + (profile Put + license Put) per member must stay ≤ DynamoDB's 100 actions. */
export const MAX_NEW_MEMBERS_PER_TRANSACTION = 49;

export interface CreateNewMembersInput {
  orgId: string;
  orgUnitId?: string | null;
  /** Complete, not-yet-persisted profile records (server-generated ids). */
  profiles: Array<Record<string, unknown> & { id: string }>;
  assignedBy?: string;
  /** Members per transaction; clamped to MAX_NEW_MEMBERS_PER_TRANSACTION. */
  chunkSize?: number;
}

export interface CreatedMember {
  profileId: string;
  licenseId: string;
}

export type CreateNewMembersResult =
  | { ok: true; created: CreatedMember[] }
  | {
      ok: false;
      error: string;
      /** true when every committed chunk was compensated — the DB is back to its pre-batch state. */
      rolledBack: boolean;
      /** Members still present after a failed compensation (manual cleanup needed). Empty when rolledBack. */
      leftBehind: CreatedMember[];
    };

/**
 * Create N new profiles, N licenses and consume N seats with all-or-nothing semantics.
 *
 * Profiles are written by the transaction itself (Put + attribute_not_exists), so a batch
 * of ≤ MAX_NEW_MEMBERS_PER_TRANSACTION members is ONE DynamoDB transaction: it either
 * commits completely or not at all, with no compensation needed. Larger batches are split
 * into chunks, each its own transaction; when a later chunk fails, every committed chunk
 * is compensated (profile + license deleted, seats released), conditionally on the rows
 * still being the ones this batch wrote. If compensation itself fails, the members still
 * in the DB are returned in `leftBehind` and logged with the REGISTER_BATCH_PARTIAL marker.
 */
export async function createNewMembersWithLicenses(input: CreateNewMembersInput): Promise<CreateNewMembersResult> {
  const { orgId, profiles } = input;
  const orgUnitId = input.orgUnitId || null;
  if (profiles.length === 0) return { ok: true, created: [] };
  const chunkSize = Math.max(1, Math.min(input.chunkSize ?? MAX_NEW_MEMBERS_PER_TRANSACTION, MAX_NEW_MEMBERS_PER_TRANSACTION));

  const committedChunks: CreatedMember[][] = [];
  let failure: string | null = null;

  for (let start = 0; start < profiles.length; start += chunkSize) {
    const chunk = profiles.slice(start, start + chunkSize);
    try {
      // Fresh read per chunk: the seat condition pins maxSeats, so it must be current.
      const org = await getOrganizationById(orgId);
      if (!org) throw new Error('Organization not found');
      if (org.status !== 'active' && org.status !== 'trial') {
        throw new Error(`Organization is not active (status: ${org.status})`);
      }

      const now = new Date().toISOString();
      const members: CreatedMember[] = [];
      const transactItems: any[] = [buildSeatConsumeItem({ orgId, count: chunk.length, now, maxSeats: org.maxSeats })];
      const errorLabels = ['組織席次已滿 (organization has no available seats)'];
      for (const profile of chunk) {
        const licenseId = randomUUID();
        members.push({ profileId: profile.id, licenseId });
        transactItems.push({
          Put: {
            TableName: PROFILES_TABLE,
            Item: {
              ...profile,
              ...buildMemberJoinFields({ orgId, orgUnitId, licenseId, now }),
              planBeforeOrg: (typeof profile.plan === 'string' && profile.plan) || DEFAULT_B2C_PLAN_ID
            },
            ConditionExpression: 'attribute_not_exists(id)'
          }
        });
        errorLabels.push('帳號已存在 (profile id already exists)');
        transactItems.push({
          Put: {
            TableName: LICENSES_TABLE,
            Item: buildNewLicenseItem({ licenseId, orgId, userId: profile.id, now, assignedBy: input.assignedBy }),
            ConditionExpression: 'attribute_not_exists(id)'
          }
        });
        errorLabels.push('授權已存在 (license id already exists)');
      }

      try {
        await sendTransactWriteWithRetry(new TransactWriteCommand({ TransactItems: transactItems }));
      } catch (error: any) {
        // TransactionCanceledException = definitely not committed. Anything else (timeout,
        // network) leaves the outcome unknown: probe which rows actually landed so they
        // are compensated along with the committed chunks.
        if (error?.name !== 'TransactionCanceledException') {
          const landed = await probeCommittedMembers(members);
          if (landed.length > 0) committedChunks.push(landed);
        }
        throw friendlyTransactionError(error, errorLabels);
      }
      committedChunks.push(members);
    } catch (error: any) {
      failure = error?.message || 'Transaction failed';
      console.error(`[OrgMembershipService] ❌ createNewMembersWithLicenses chunk @${start} failed:`, failure);
      break;
    }
  }

  const created = committedChunks.flat();
  if (!failure) {
    console.log(`[OrgMembershipService] ✅ Created ${created.length} members in org ${orgId}`);
    return { ok: true, created };
  }
  if (created.length === 0) {
    return { ok: false, error: failure, rolledBack: true, leftBehind: [] };
  }

  const leftBehind: CreatedMember[] = [];
  for (const chunk of committedChunks.reverse()) {
    if (await compensateMembers(orgId, chunk)) continue;
    // Chunk-level compensation failed (e.g. one member was already changed) —
    // fall back to one transaction per member so everything revertible is reverted.
    for (const member of chunk) {
      if (!(await compensateMembers(orgId, [member]))) leftBehind.push(member);
    }
  }
  if (leftBehind.length > 0) {
    console.error(
      '[OrgMembershipService] REGISTER_BATCH_PARTIAL',
      JSON.stringify({ orgId, error: failure, leftBehind })
    );
  }
  return { ok: false, error: failure, rolledBack: leftBehind.length === 0, leftBehind };
}

/** Members of an unknown-outcome chunk whose profile row exists with the license this batch minted. */
async function probeCommittedMembers(members: CreatedMember[]): Promise<CreatedMember[]> {
  const landed: CreatedMember[] = [];
  for (const m of members) {
    try {
      const p = (await getProfileById(m.profileId)) as ProfileB2B | null;
      if (p && p.licenseId === m.licenseId) landed.push(m);
    } catch {
      // Can't tell — assume it landed; compensation's conditions make a wrong guess harmless.
      landed.push(m);
    }
  }
  return landed;
}

/** Undo members written by createNewMembersWithLicenses. Returns false if the transaction failed. */
async function compensateMembers(orgId: string, members: CreatedMember[]): Promise<boolean> {
  const now = new Date().toISOString();
  const items: any[] = [
    {
      Update: {
        TableName: ORGANIZATIONS_TABLE,
        Key: { id: orgId },
        UpdateExpression: 'SET usedSeats = usedSeats - :n, updatedAt = :now',
        ConditionExpression: 'attribute_exists(id) AND usedSeats >= :n',
        ExpressionAttributeValues: { ':n': members.length, ':now': now }
      }
    }
  ];
  for (const m of members) {
    items.push({
      Delete: {
        TableName: PROFILES_TABLE,
        Key: { id: m.profileId },
        // Only the exact row this batch wrote: still seated in this org by this license.
        ConditionExpression: 'orgId = :orgId AND licenseId = :licenseId',
        ExpressionAttributeValues: { ':orgId': orgId, ':licenseId': m.licenseId }
      }
    });
    items.push({
      Delete: {
        TableName: LICENSES_TABLE,
        Key: { id: m.licenseId },
        ConditionExpression: 'orgId = :orgId AND userId = :userId',
        ExpressionAttributeValues: { ':orgId': orgId, ':userId': m.profileId }
      }
    });
  }
  try {
    await sendTransactWriteWithRetry(new TransactWriteCommand({ TransactItems: items }));
    return true;
  } catch (error: any) {
    console.error(
      `[OrgMembershipService] compensation for ${members.length} member(s) failed:`,
      error?.message || error
    );
    return false;
  }
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

const orgMembershipService = {
  expireOverdueLicenses,
  assignMemberWithLicense,
  createNewMembersWithLicenses,
  removeMemberFromOrg,
  changeMemberOrgUnit,
  setMemberOrgAdmin,
  setMemberDeptAdmin
};

export default orgMembershipService;

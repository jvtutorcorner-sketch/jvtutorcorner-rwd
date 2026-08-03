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

import { ORGANIZATIONS_TABLE, getOrganizationById } from './organizationService';
import { getOrgUnitById } from './orgUnitService';
import { LICENSES_TABLE, getLicenseById } from './licenseService';
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
  }
  return new Error(error.message || 'Transaction failed');
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
  const expiresAtEpoch = input.expiresAt ? Math.floor(Date.parse(input.expiresAt) / 1000) : undefined;

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
            expiresAt: expiresAtEpoch,
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
    {
      Update: {
        TableName: PROFILES_TABLE,
        Key: { id: profileId },
        UpdateExpression:
          'SET orgId = :orgId, orgUnitId = :orgUnitId, isB2B = :true, isOrgAdmin = :isOrgAdmin, licenseId = :licenseId, plan = :null, updatedAt = :now',
        ConditionExpression: 'attribute_exists(id) AND (attribute_not_exists(orgId) OR orgId = :orgId OR orgId = :null)',
        ExpressionAttributeValues: {
          ':orgId': orgId,
          ':orgUnitId': input.orgUnitId || null,
          ':true': true,
          ':isOrgAdmin': input.isOrgAdmin === true,
          ':licenseId': licenseId,
          ':null': null,
          ':now': now
        }
      }
    }
  ];

  const errorLabels = [
    '組織席次已滿 (organization has no available seats)',
    '授權已被占用或不存在 (license already assigned or not found)',
    '使用者已屬於其他組織 (user already belongs to a different organization)'
  ];

  try {
    await ddbDocClient.send(new TransactWriteCommand({ TransactItems: transactItems as any }));
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

  let activeLicense: License | null = null;
  if (profile.licenseId) {
    const lic = await getLicenseById(profile.licenseId);
    if (lic && lic.status === 'active' && lic.orgId === orgId) {
      activeLicense = lic;
    }
  }

  const now = new Date().toISOString();
  const transactItems: any[] = [];
  const errorLabels: string[] = [];

  // 只有在確實有作用中的授權時才釋放席次，避免 usedSeats 被打到負值
  if (activeLicense) {
    transactItems.push({
      Update: {
        TableName: ORGANIZATIONS_TABLE,
        Key: { id: orgId },
        UpdateExpression: 'SET usedSeats = usedSeats - :one, updatedAt = :now',
        ConditionExpression: 'attribute_exists(id) AND usedSeats >= :one',
        ExpressionAttributeValues: { ':one': 1, ':now': now }
      }
    });
    errorLabels.push('席次計數異常，無法釋放 (seat count underflow)');

    transactItems.push({
      Update: {
        TableName: LICENSES_TABLE,
        Key: { id: activeLicense.id },
        UpdateExpression: 'SET #status = :revoked, updatedAt = :now REMOVE userId',
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':revoked': 'revoked', ':now': now }
      }
    });
    errorLabels.push('授權不存在 (license not found)');
  }

  transactItems.push({
    Update: {
      TableName: PROFILES_TABLE,
      Key: { id: profileId },
      UpdateExpression:
        'SET orgId = :null, orgUnitId = :null, isB2B = :false, isOrgAdmin = :false, licenseId = :null, updatedAt = :now',
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeValues: { ':null': null, ':false': false, ':now': now }
    }
  });
  errorLabels.push('使用者不存在 (profile not found)');

  try {
    await ddbDocClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
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

export default {
  assignMemberWithLicense,
  removeMemberFromOrg,
  changeMemberOrgUnit,
  setMemberOrgAdmin
};

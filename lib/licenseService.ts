/**
 * License Service (B2B seat records)
 *
 * Handles CRUD operations for the Licenses table with proper IAM role authentication.
 * Mirrors the client/table setup pattern used by lib/organizationService.ts.
 *
 * SECURITY PATTERN:
 * - Production (Amplify): Uses IAM role (no credentials in code)
 * - Local Dev: Only uses AWS_ACCESS_KEY_ID if explicitly set in environment
 *
 * SEAT ACCOUNTING: this service does NOT touch Organization.usedSeats — assigning/
 * revoking a seat's worth of capacity is a cross-table operation and lives in
 * lib/orgMembershipService.ts (TransactWriteCommand across organizations/licenses/
 * profiles). Use the functions here for straightforward license record CRUD only.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  DeleteCommand
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import type { License, CreateLicenseInput, UpdateLicenseInput } from './types/b2b';

// ==========================================
// DynamoDB Client Setup (Clean IAM Pattern)
// ==========================================

const REGION = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
export const LICENSES_TABLE = process.env.DYNAMODB_TABLE_LICENSES || 'jvtutorcorner-licenses';

function createDynamoClient(): DynamoDBDocumentClient {
  const clientConfig: any = { region: REGION };

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;

  if (accessKeyId && secretAccessKey) {
    console.log('[LicenseService] Using explicit AWS credentials (local dev mode)');
    clientConfig.credentials = { accessKeyId, secretAccessKey };
  } else {
    console.log('[LicenseService] Using IAM role (production mode)');
  }

  const client = new DynamoDBClient(clientConfig);
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true }
  });
}

const ddbDocClient = createDynamoClient();

// ==========================================
// CRUD Operations
// ==========================================

/**
 * Create a license record. If `userId` is provided the license is created already
 * assigned (status 'active') — but this does NOT increment Organization.usedSeats;
 * use orgMembershipService.assignMemberWithLicense for a seat-consuming assignment.
 */
export async function createLicense(input: CreateLicenseInput): Promise<License> {
  const now = new Date().toISOString();
  const id = randomUUID();

  const license: License = {
    id,
    orgId: input.orgId,
    userId: input.userId || null,
    courseId: input.courseId,
    status: input.userId ? 'active' : 'pending',
    assignedAt: input.userId ? now : undefined,
    assignedBy: input.userId ? input.assignedBy : undefined,
    expiresAt: input.expiresAt ? Date.parse(input.expiresAt) / 1000 : undefined,
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now
  };

  try {
    await ddbDocClient.send(new PutCommand({
      TableName: LICENSES_TABLE,
      Item: license,
      ConditionExpression: 'attribute_not_exists(id)'
    }));

    console.log(`[LicenseService] ✅ Created license: ${id} (org ${input.orgId})`);
    return license;
  } catch (error: any) {
    console.error('[LicenseService] ❌ Failed to create license:', error.message);
    throw new Error(`Failed to create license: ${error.message}`);
  }
}

export async function getLicenseById(id: string): Promise<License | null> {
  try {
    const result = await ddbDocClient.send(new GetCommand({
      TableName: LICENSES_TABLE,
      Key: { id }
    }));

    return (result.Item as License) || null;
  } catch (error: any) {
    console.error(`[LicenseService] ❌ Failed to get license ${id}:`, error.message);
    throw new Error(`Failed to get license: ${error.message}`);
  }
}

/**
 * List licenses for an org. `byOrgId` GSI's range key is `status`, so a status filter
 * is a KeyCondition, not a FilterExpression.
 */
export async function listLicensesByOrg(orgId: string, status?: License['status']): Promise<License[]> {
  try {
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: LICENSES_TABLE,
      IndexName: 'byOrgId',
      KeyConditionExpression: status ? 'orgId = :orgId AND #status = :status' : 'orgId = :orgId',
      ExpressionAttributeNames: status ? { '#status': 'status' } : undefined,
      ExpressionAttributeValues: status
        ? { ':orgId': orgId, ':status': status }
        : { ':orgId': orgId }
    }));

    return (result.Items as License[]) || [];
  } catch (error: any) {
    console.error(`[LicenseService] ❌ Failed to list licenses for org ${orgId}:`, error.message);
    throw new Error(`Failed to list licenses: ${error.message}`);
  }
}

export async function listLicensesByUser(userId: string): Promise<License[]> {
  try {
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: LICENSES_TABLE,
      IndexName: 'byUserId',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId }
    }));

    return (result.Items as License[]) || [];
  } catch (error: any) {
    console.error(`[LicenseService] ❌ Failed to list licenses for user ${userId}:`, error.message);
    throw new Error(`Failed to list licenses: ${error.message}`);
  }
}

/**
 * Count active licenses for an org — used for usedSeats drift reconciliation.
 */
export async function countActiveLicenses(orgId: string): Promise<number> {
  try {
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: LICENSES_TABLE,
      IndexName: 'byOrgId',
      KeyConditionExpression: 'orgId = :orgId AND #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':orgId': orgId, ':status': 'active' },
      Select: 'COUNT'
    }));

    return result.Count || 0;
  } catch (error: any) {
    console.error(`[LicenseService] ❌ Failed to count active licenses for org ${orgId}:`, error.message);
    throw new Error(`Failed to count active licenses: ${error.message}`);
  }
}

/**
 * Assign an already-existing (pending) license to a user directly, bypassing seat
 * accounting. Prefer orgMembershipService.assignMemberWithLicense for the normal
 * member-onboarding path — this is exposed for admin "re-assign an unassigned license"
 * flows where the caller has already reserved/verified capacity separately.
 */
export async function assignLicenseToUser(licenseId: string, userId: string, assignedBy?: string): Promise<License> {
  const now = new Date().toISOString();
  try {
    const result = await ddbDocClient.send(new UpdateCommand({
      TableName: LICENSES_TABLE,
      Key: { id: licenseId },
      UpdateExpression: 'SET userId = :userId, #status = :active, assignedAt = :now, assignedBy = :assignedBy, updatedAt = :now',
      ConditionExpression: 'attribute_exists(id) AND attribute_not_exists(userId)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':active': 'active',
        ':now': now,
        ':assignedBy': assignedBy || null
      },
      ReturnValues: 'ALL_NEW'
    }));

    console.log(`[LicenseService] ✅ Assigned license ${licenseId} to user ${userId}`);
    return result.Attributes as License;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new Error('License not found or already assigned');
    }
    console.error(`[LicenseService] ❌ Failed to assign license:`, error.message);
    throw new Error(`Failed to assign license: ${error.message}`);
  }
}

/**
 * Revoke a license. Uses REMOVE (not SET ... = null) on userId so the sparse
 * `byUserId` GSI actually drops the item once it's unassigned.
 */
export async function revokeLicense(id: string): Promise<License> {
  const now = new Date().toISOString();
  try {
    const result = await ddbDocClient.send(new UpdateCommand({
      TableName: LICENSES_TABLE,
      Key: { id },
      UpdateExpression: 'SET #status = :revoked, updatedAt = :now REMOVE userId',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':revoked': 'revoked', ':now': now },
      ReturnValues: 'ALL_NEW'
    }));

    console.log(`[LicenseService] ✅ Revoked license ${id}`);
    return result.Attributes as License;
  } catch (error: any) {
    console.error(`[LicenseService] ❌ Failed to revoke license ${id}:`, error.message);
    throw new Error(`Failed to revoke license: ${error.message}`);
  }
}

export async function updateLicense(id: string, updates: UpdateLicenseInput): Promise<License> {
  const now = new Date().toISOString();

  const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
  const expressionAttributeNames: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const expressionAttributeValues: Record<string, any> = { ':updatedAt': now };

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      updateExpressions.push(`#${key} = :${key}`);
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:${key}`] = value;
    }
  });

  try {
    const result = await ddbDocClient.send(new UpdateCommand({
      TableName: LICENSES_TABLE,
      Key: { id },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }));

    console.log(`[LicenseService] ✅ Updated license: ${id}`);
    return result.Attributes as License;
  } catch (error: any) {
    console.error(`[LicenseService] ❌ Failed to update license ${id}:`, error.message);
    throw new Error(`Failed to update license: ${error.message}`);
  }
}

export async function deleteLicense(id: string, hardDelete: boolean = false): Promise<void> {
  try {
    if (hardDelete) {
      await ddbDocClient.send(new DeleteCommand({
        TableName: LICENSES_TABLE,
        Key: { id }
      }));
      console.log(`[LicenseService] ✅ Hard deleted license: ${id}`);
    } else {
      await revokeLicense(id);
      console.log(`[LicenseService] ✅ Soft deleted (revoked) license: ${id}`);
    }
  } catch (error: any) {
    console.error(`[LicenseService] ❌ Failed to delete license ${id}:`, error.message);
    throw new Error(`Failed to delete license: ${error.message}`);
  }
}

// ==========================================
// Exports
// ==========================================

export default {
  createLicense,
  getLicenseById,
  listLicensesByOrg,
  listLicensesByUser,
  countActiveLicenses,
  assignLicenseToUser,
  revokeLicense,
  updateLicense,
  deleteLicense
};

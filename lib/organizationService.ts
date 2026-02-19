/**
 * Organization Service
 * 
 * Handles CRUD operations for Organizations table with proper IAM role authentication.
 * 
 * SECURITY PATTERN:
 * - Production (Amplify): Uses IAM role (no credentials in code)
 * - Local Dev: Only uses AWS_ACCESS_KEY_ID if explicitly set in environment
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  UpdateCommand,
  QueryCommand,
  ScanCommand,
  DeleteCommand 
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import type { Organization, CreateOrganizationInput } from './types/b2b';

// ==========================================
// DynamoDB Client Setup (Clean IAM Pattern)
// ==========================================

const REGION = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
const ORGANIZATIONS_TABLE = process.env.DYNAMODB_TABLE_ORGANIZATIONS || 'jvtutorcorner-organizations';

/**
 * Initialize DynamoDB Client with secure credential handling:
 * - If AWS_ACCESS_KEY_ID exists (local dev), use explicit credentials
 * - If not (production), use IAM role automatically
 */
function createDynamoClient(): DynamoDBDocumentClient {
  const clientConfig: any = { region: REGION };
  
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
  
  // Only set credentials if explicitly provided (local development)
  if (accessKeyId && secretAccessKey) {
    console.log('[OrganizationService] Using explicit AWS credentials (local dev mode)');
    clientConfig.credentials = { accessKeyId, secretAccessKey };
  } else {
    console.log('[OrganizationService] Using IAM role (production mode)');
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
 * Create a new organization
 */
export async function createOrganization(input: CreateOrganizationInput): Promise<Organization> {
  const now = new Date().toISOString();
  const id = randomUUID();
  
  const organization: Organization = {
    id,
    name: input.name,
    domain: input.domain,
    planTier: input.planTier,
    status: 'trial', // Default to trial
    maxSeats: input.maxSeats,
    usedSeats: 0,
    billingEmail: input.billingEmail,
    adminUserId: input.adminUserId,
    industry: input.industry,
    country: input.country,
    taxId: input.taxId,
    createdAt: now,
    updatedAt: now
  };
  
  try {
    await ddbDocClient.send(new PutCommand({
      TableName: ORGANIZATIONS_TABLE,
      Item: organization,
      ConditionExpression: 'attribute_not_exists(id)' // Prevent overwrites
    }));
    
    console.log(`[OrganizationService] ✅ Created organization: ${id} (${input.name})`);
    return organization;
  } catch (error: any) {
    console.error('[OrganizationService] ❌ Failed to create organization:', error.message);
    throw new Error(`Failed to create organization: ${error.message}`);
  }
}

/**
 * Get organization by ID
 */
export async function getOrganizationById(id: string): Promise<Organization | null> {
  try {
    const result = await ddbDocClient.send(new GetCommand({
      TableName: ORGANIZATIONS_TABLE,
      Key: { id }
    }));
    
    return (result.Item as Organization) || null;
  } catch (error: any) {
    console.error(`[OrganizationService] ❌ Failed to get organization ${id}:`, error.message);
    throw new Error(`Failed to get organization: ${error.message}`);
  }
}

/**
 * Get organization by billing email (uses GSI)
 */
export async function getOrganizationByEmail(billingEmail: string): Promise<Organization | null> {
  try {
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: ORGANIZATIONS_TABLE,
      IndexName: 'BillingEmailIndex',
      KeyConditionExpression: 'billingEmail = :email',
      ExpressionAttributeValues: {
        ':email': billingEmail
      },
      Limit: 1
    }));
    
    return (result.Items?.[0] as Organization) || null;
  } catch (error: any) {
    console.error(`[OrganizationService] ❌ Failed to query by email:`, error.message);
    throw new Error(`Failed to query organization by email: ${error.message}`);
  }
}

/**
 * List all organizations (with optional status filter)
 */
export async function listOrganizations(status?: Organization['status']): Promise<Organization[]> {
  try {
    if (status) {
      // Use StatusIndex GSI for filtered query
      const result = await ddbDocClient.send(new QueryCommand({
        TableName: ORGANIZATIONS_TABLE,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': status
        }
      }));
      
      return (result.Items as Organization[]) || [];
    } else {
      // Scan all organizations
      const result = await ddbDocClient.send(new ScanCommand({
        TableName: ORGANIZATIONS_TABLE
      }));
      
      return (result.Items as Organization[]) || [];
    }
  } catch (error: any) {
    console.error('[OrganizationService] ❌ Failed to list organizations:', error.message);
    throw new Error(`Failed to list organizations: ${error.message}`);
  }
}

/**
 * Update organization
 */
export async function updateOrganization(
  id: string, 
  updates: Partial<Omit<Organization, 'id' | 'createdAt'>>
): Promise<Organization> {
  const now = new Date().toISOString();
  
  // Build UpdateExpression dynamically
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};
  
  // Always update the updatedAt timestamp
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = now;
  
  // Add other fields
  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined && key !== 'id' && key !== 'createdAt') {
      updateExpressions.push(`#${key} = :${key}`);
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:${key}`] = value;
    }
  });
  
  try {
    const result = await ddbDocClient.send(new UpdateCommand({
      TableName: ORGANIZATIONS_TABLE,
      Key: { id },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }));
    
    console.log(`[OrganizationService] ✅ Updated organization: ${id}`);
    return result.Attributes as Organization;
  } catch (error: any) {
    console.error(`[OrganizationService] ❌ Failed to update organization ${id}:`, error.message);
    throw new Error(`Failed to update organization: ${error.message}`);
  }
}

/**
 * Increment used seats (atomic operation)
 */
export async function incrementUsedSeats(id: string, amount: number = 1): Promise<number> {
  try {
    const result = await ddbDocClient.send(new UpdateCommand({
      TableName: ORGANIZATIONS_TABLE,
      Key: { id },
      UpdateExpression: 'SET usedSeats = usedSeats + :amount, updatedAt = :now',
      ExpressionAttributeValues: {
        ':amount': amount,
        ':now': new Date().toISOString(),
        ':maxSeats': 0
      },
      ConditionExpression: 'usedSeats + :amount <= maxSeats',
      ReturnValues: 'ALL_NEW'
    }));
    
    const newUsedSeats = (result.Attributes as Organization).usedSeats;
    console.log(`[OrganizationService] ✅ Incremented seats for ${id}: ${newUsedSeats}`);
    return newUsedSeats;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new Error('Cannot exceed maximum seat count');
    }
    console.error(`[OrganizationService] ❌ Failed to increment seats:`, error.message);
    throw new Error(`Failed to increment seats: ${error.message}`);
  }
}

/**
 * Decrement used seats (atomic operation)
 */
export async function decrementUsedSeats(id: string, amount: number = 1): Promise<number> {
  try {
    const result = await ddbDocClient.send(new UpdateCommand({
      TableName: ORGANIZATIONS_TABLE,
      Key: { id },
      UpdateExpression: 'SET usedSeats = if_not_exists(usedSeats, :zero) - :amount, updatedAt = :now',
      ExpressionAttributeValues: {
        ':amount': amount,
        ':zero': 0,
        ':now': new Date().toISOString()
      },
      ConditionExpression: 'usedSeats >= :amount',
      ReturnValues: 'ALL_NEW'
    }));
    
    const newUsedSeats = (result.Attributes as Organization).usedSeats;
    console.log(`[OrganizationService] ✅ Decremented seats for ${id}: ${newUsedSeats}`);
    return newUsedSeats;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new Error('Cannot decrement below zero');
    }
    console.error(`[OrganizationService] ❌ Failed to decrement seats:`, error.message);
    throw new Error(`Failed to decrement seats: ${error.message}`);
  }
}

/**
 * Delete organization (soft delete by setting status to 'cancelled')
 */
export async function deleteOrganization(id: string, hardDelete: boolean = false): Promise<void> {
  try {
    if (hardDelete) {
      await ddbDocClient.send(new DeleteCommand({
        TableName: ORGANIZATIONS_TABLE,
        Key: { id }
      }));
      console.log(`[OrganizationService] ✅ Hard deleted organization: ${id}`);
    } else {
      // Soft delete
      await updateOrganization(id, { status: 'cancelled' });
      console.log(`[OrganizationService] ✅ Soft deleted organization: ${id}`);
    }
  } catch (error: any) {
    console.error(`[OrganizationService] ❌ Failed to delete organization ${id}:`, error.message);
    throw new Error(`Failed to delete organization: ${error.message}`);
  }
}

// ==========================================
// Exports
// ==========================================

export default {
  createOrganization,
  getOrganizationById,
  getOrganizationByEmail,
  listOrganizations,
  updateOrganization,
  incrementUsedSeats,
  decrementUsedSeats,
  deleteOrganization
};

import { ddbDocClient } from './dynamo';
import { ScanCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import resolveDataFile from './localData';
import fs from 'fs/promises';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || '';
const PROFILES_LAMBDA = process.env.PROFILES_LAMBDA_NAME || process.env.PROFILES_FUNCTION_NAME || '';
const PROFILES_API = process.env.PROFILES_API_URL || process.env.PROFILES_ENDPOINT || '';

const lambdaClient = PROFILES_LAMBDA ? new LambdaClient({ region: process.env.AWS_REGION || process.env.CI_AWS_REGION || process.env.AWS_DEFAULT_REGION || process.env.CI_AWS_DEFAULT_REGION || 'ap-northeast-1' }) : null;

async function readProfilesFile() {
  try {
    const DATA_FILE = await resolveDataFile('profiles.json');
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    return [];
  }
}

async function writeProfilesFile(profiles: any[]) {
  const DATA_FILE = await resolveDataFile('profiles.json');
  await fs.writeFile(DATA_FILE, JSON.stringify(profiles, null, 2), 'utf8');
}

async function invokeProfilesLambda(action: string, payload: any) {
  if (!lambdaClient || !PROFILES_LAMBDA) throw new Error('Profiles Lambda not configured');
  const cmd = new InvokeCommand({
    FunctionName: PROFILES_LAMBDA,
    Payload: Buffer.from(JSON.stringify({ action, payload })),
  });
  const res: any = await lambdaClient.send(cmd);
  if (!res.Payload) return null;
  const body = Buffer.from(res.Payload).toString('utf8');
  try {
    return JSON.parse(body);
  } catch (e) {
    return body;
  }
}

async function callProfilesHttp(action: string, payload: any) {
  if (!PROFILES_API) throw new Error('Profiles API URL not configured');
  // prefer a single invoke-style endpoint, fallback to action-specific paths
  const invokeUrl = `${PROFILES_API.replace(/\/$/, '')}/invoke`;
  const actionUrl = `${PROFILES_API.replace(/\/$/, '')}/${action}`;
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) };
  try {
    // try invoke-style
    let res = await fetch(invokeUrl, opts as any);
    if (!res.ok) {
      // try action-specific
      res = await fetch(actionUrl, opts as any);
    }
    if (!res.ok) throw new Error(`Profiles API responded ${res.status}`);
    const data = await res.json();
    return data;
  } catch (e) {
    console.warn('[profilesService] HTTP call failed', (e as any)?.message || e);
    throw e;
  }
}

export async function findProfileByEmail(email: string) {
  email = String(email).toLowerCase();
  // 1) HTTP API if configured
  if (PROFILES_API) {
    try {
      const r: any = await callProfilesHttp('findByEmail', { email });
      return r?.item || null;
    } catch (e) {
      // fallthrough
    }
  }

  // 2) Lambda invoke if configured
  if (PROFILES_LAMBDA) {
    try {
      const r = await invokeProfilesLambda('findByEmail', { email });
      return r?.item || null;
    } catch (e) {
      console.warn('[profilesService] lambda findByEmail failed', (e as any)?.message || e);
    }
  }

  // 3) Direct Dynamo query if configured
  if (PROFILES_TABLE) {
    try {
      const scanRes: any = await ddbDocClient.send(new ScanCommand({ TableName: PROFILES_TABLE, FilterExpression: 'email = :email', ExpressionAttributeValues: { ':email': email } }));
      if (scanRes?.Count > 0) return scanRes.Items[0];
      return null;
    } catch (e) {
      console.warn('[profilesService] dynamo scan failed', (e as any)?.message || e);
    }
  }

  const profiles = await readProfilesFile();
  return profiles.find((p: any) => p.email === email) || null;
}

export async function getProfileById(id: string) {
  if (PROFILES_API) {
    try {
      const r: any = await callProfilesHttp('getById', { id });
      return r?.item || null;
    } catch (e) {}
  }

  if (PROFILES_LAMBDA) {
    try {
      const r = await invokeProfilesLambda('getById', { id });
      return r?.item || null;
    } catch (e) {
      console.warn('[profilesService] lambda getById failed', (e as any)?.message || e);
    }
  }

  if (PROFILES_TABLE) {
    try {
      const res: any = await ddbDocClient.send(new GetCommand({ TableName: PROFILES_TABLE, Key: { id } }));
      return res?.Item || null;
    } catch (e) {
      console.warn('[profilesService] dynamo get failed', (e as any)?.message || e);
    }
  }

  const profiles = await readProfilesFile();
  return profiles.find((p: any) => p.id === id || p.roid_id === id) || null;
}

export async function putProfile(profile: any) {
  // 1) HTTP API
  if (PROFILES_API) {
    try {
      const r: any = await callProfilesHttp('put', { profile });
      if (r && (r.ok || r.success)) return profile;
    } catch (e) {
      console.warn('[profilesService] http put failed', (e as any)?.message || e);
    }
  }

  // 2) Lambda
  if (PROFILES_LAMBDA) {
    try {
      const r = await invokeProfilesLambda('put', { profile });
      return r?.ok ? profile : null;
    } catch (e) {
      console.warn('[profilesService] lambda put failed', (e as any)?.message || e);
    }
  }

  // 3) Direct Dynamo
  if (PROFILES_TABLE) {
    try {
      await ddbDocClient.send(new PutCommand({ TableName: PROFILES_TABLE, Item: profile }));
      return profile;
    } catch (e) {
      console.error('[profilesService] dynamo put failed', (e as any)?.message || e);
      throw e;
    }
  }

  // fallback to local file
  const profiles = await readProfilesFile();
  const idx = profiles.findIndex((p: any) => (p.id || p.roid_id) === (profile.id || profile.roid_id));
  if (idx >= 0) profiles[idx] = profile; else profiles.push(profile);
  await writeProfilesFile(profiles);
  return profile;
}

// ==========================================
// B2B/B2C Extended Functions
// ==========================================

import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { ProfileB2B } from './types/b2b';

/**
 * Query profiles by organization ID (uses byOrgId GSI)
 * Requires EmailIndex GSI on the Profiles table
 */
export async function findProfilesByOrgId(orgId: string): Promise<ProfileB2B[]> {
  if (!PROFILES_TABLE) {
    throw new Error('DYNAMODB_TABLE_PROFILES not configured');
  }
  
  try {
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: PROFILES_TABLE,
      IndexName: 'byOrgId',
      KeyConditionExpression: 'orgId = :orgId',
      ExpressionAttributeValues: {
        ':orgId': orgId
      }
    }));
    
    return (result.Items as ProfileB2B[]) || [];
  } catch (error: any) {
    console.error(`[profilesService] ❌ Failed to query profiles by orgId ${orgId}:`, error.message);
    throw new Error(`Failed to query profiles by orgId: ${error.message}`);
  }
}

/**
 * Assign a profile to an organization
 * Updates orgId, orgUnitId, isB2B, and licenseId fields
 */
export async function assignProfileToOrg(
  profileId: string,
  orgId: string,
  orgUnitId?: string,
  licenseId?: string,
  isOrgAdmin: boolean = false
): Promise<ProfileB2B> {
  if (!PROFILES_TABLE) {
    throw new Error('DYNAMODB_TABLE_PROFILES not configured');
  }
  
  try {
    const result = await ddbDocClient.send(new UpdateCommand({
      TableName: PROFILES_TABLE,
      Key: { id: profileId },
      UpdateExpression: 'SET orgId = :orgId, orgUnitId = :orgUnitId, isB2B = :isB2B, isOrgAdmin = :isOrgAdmin, licenseId = :licenseId, updatedAt = :now',
      ExpressionAttributeValues: {
        ':orgId': orgId,
        ':orgUnitId': orgUnitId || null,
        ':isB2B': true,
        ':isOrgAdmin': isOrgAdmin,
        ':licenseId': licenseId || null,
        ':now': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));
    
    console.log(`[profilesService] ✅ Assigned profile ${profileId} to org ${orgId}`);
    return result.Attributes as ProfileB2B;
  } catch (error: any) {
    console.error(`[profilesService] ❌ Failed to assign profile to org:`, error.message);
    throw new Error(`Failed to assign profile to org: ${error.message}`);
  }
}

/**
 * Remove a profile from an organization (convert back to B2C)
 */
export async function removeProfileFromOrg(profileId: string): Promise<ProfileB2B> {
  if (!PROFILES_TABLE) {
    throw new Error('DYNAMODB_TABLE_PROFILES not configured');
  }
  
  try {
    const result = await ddbDocClient.send(new UpdateCommand({
      TableName: PROFILES_TABLE,
      Key: { id: profileId },
      UpdateExpression: 'SET orgId = :null, orgUnitId = :null, isB2B = :false, isOrgAdmin = :false, licenseId = :null, updatedAt = :now',
      ExpressionAttributeValues: {
        ':null': null,
        ':false': false,
        ':now': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));
    
    console.log(`[profilesService] ✅ Removed profile ${profileId} from org`);
    return result.Attributes as ProfileB2B;
  } catch (error: any) {
    console.error(`[profilesService] ❌ Failed to remove profile from org:`, error.message);
    throw new Error(`Failed to remove profile from org: ${error.message}`);
  }
}

/**
 * Update profile's org unit (for moving within organizational hierarchy)
 */
export async function updateProfileOrgUnit(
  profileId: string,
  orgUnitId: string | null
): Promise<ProfileB2B> {
  if (!PROFILES_TABLE) {
    throw new Error('DYNAMODB_TABLE_PROFILES not configured');
  }
  
  try {
    const result = await ddbDocClient.send(new UpdateCommand({
      TableName: PROFILES_TABLE,
      Key: { id: profileId },
      UpdateExpression: 'SET orgUnitId = :orgUnitId, updatedAt = :now',
      ExpressionAttributeValues: {
        ':orgUnitId': orgUnitId,
        ':now': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));
    
    console.log(`[profilesService] ✅ Updated profile ${profileId} org unit to ${orgUnitId}`);
    return result.Attributes as ProfileB2B;
  } catch (error: any) {
    console.error(`[profilesService] ❌ Failed to update profile org unit:`, error.message);
    throw new Error(`Failed to update profile org unit: ${error.message}`);
  }
}

export default {
  // Original functions
  findProfileByEmail,
  getProfileById,
  putProfile,
  
  // B2B/B2C extended functions
  findProfilesByOrgId,
  assignProfileToOrg,
  removeProfileFromOrg,
  updateProfileOrgUnit,
};

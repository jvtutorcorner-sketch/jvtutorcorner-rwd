import { ddbDocClient } from './dynamo';
import { ScanCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import resolveDataFile from './localData';
import fs from 'fs/promises';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || '';
const PROFILES_LAMBDA = process.env.PROFILES_LAMBDA_NAME || process.env.PROFILES_FUNCTION_NAME || '';
const PROFILES_API = process.env.PROFILES_API_URL || process.env.PROFILES_ENDPOINT || '';

const lambdaClient = PROFILES_LAMBDA ? new LambdaClient({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-northeast-1' }) : null;

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

export default {
  findProfileByEmail,
  getProfileById,
  putProfile,
};

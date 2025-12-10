import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import resolveDataFile from '@/lib/localData';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

async function readProfiles(): Promise<any[]> {
  const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || '';
  const useDynamo = typeof PROFILES_TABLE === 'string' && PROFILES_TABLE.length > 0;
  if (useDynamo) {
    try {
      const res: any = await ddbDocClient.send(new ScanCommand({ TableName: PROFILES_TABLE }));
      return res.Items || [];
    } catch (e) {
      console.warn('[profile] Dynamo scan failed, falling back to file', (e as any)?.message || e);
    }
  }
  try {
    const DATA_FILE = await resolveDataFile('profiles.json');
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

async function writeProfiles(arr: any[]) {
  const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || '';
  const useDynamo = typeof PROFILES_TABLE === 'string' && PROFILES_TABLE.length > 0;
  if (useDynamo) {
    try {
      // overwrite all items by writing each item (demo convenience)
      for (const item of arr) {
        await ddbDocClient.send(new PutCommand({ TableName: PROFILES_TABLE, Item: item }));
      }
      return;
    } catch (e) {
      console.warn('[profile API] Dynamo write failed', (e as any)?.message || e);
    }
  }
  try {
    const DATA_FILE = await resolveDataFile('profiles.json');
    await fs.writeFile(DATA_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch (err) {
    console.warn('[profile API] failed to write profiles', (err as any)?.message || err);
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const id = url.searchParams.get('id');
    const profiles = await readProfiles();
    if (email) {
      const p = profiles.find((x) => String(x.email).toLowerCase() === String(email).toLowerCase());
      if (!p) return NextResponse.json({ ok: false, message: 'Profile not found' }, { status: 404 });
      return NextResponse.json({ ok: true, profile: p });
    }
    if (id) {
      const p = profiles.find((x) => x.roid_id === id || x.id === id);
      if (!p) return NextResponse.json({ ok: false, message: 'Profile not found' }, { status: 404 });
      return NextResponse.json({ ok: true, profile: p });
    }
    return NextResponse.json({ ok: true, profiles });
  } catch (err: any) {
    console.error('[profile GET] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to read profiles' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body || (!body.email && !body.id)) {
      return NextResponse.json({ ok: false, message: 'email or id required' }, { status: 400 });
    }

    const email = body.email ? String(body.email).toLowerCase() : undefined;
    const id = body.id;

    const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || '';
    const useDynamo = typeof PROFILES_TABLE === 'string' && PROFILES_TABLE.length > 0;
    let profile: any = null;
    let profiles = [] as any[];

    if (useDynamo) {
      try {
        if (email) {
          const scanRes: any = await ddbDocClient.send(new ScanCommand({ TableName: PROFILES_TABLE, FilterExpression: 'email = :email', ExpressionAttributeValues: { ':email': email } }));
          profile = scanRes?.Items?.[0] || null;
        } else if (id) {
          try {
            const getRes: any = await ddbDocClient.send(new GetCommand({ TableName: PROFILES_TABLE, Key: { id } }));
            profile = getRes?.Item || null;
            if (!profile) {
              // fallback: scan by roid_id
              const scanRes: any = await ddbDocClient.send(new ScanCommand({ TableName: PROFILES_TABLE, FilterExpression: 'roid_id = :rid', ExpressionAttributeValues: { ':rid': id } }));
              profile = scanRes?.Items?.[0] || null;
            }
          } catch (e) {
            console.warn('[profile GET] Dynamo get/scan failed', (e as any)?.message || e);
          }
        }
      } catch (e) {
        console.warn('[profile GET] Dynamo lookup failed', (e as any)?.message || e);
      }
    }

    if (!profile) {
      profiles = await readProfiles();
      const idx = profiles.findIndex((p) => {
        if (email) return String(p.email).toLowerCase() === email;
        return p.roid_id === id || p.id === id;
      });
      if (idx === -1) return NextResponse.json({ ok: false, message: 'Profile not found' }, { status: 404 });
      profile = profiles[idx];
    }
    // apply allowed updates (for demo, we allow adding/updating payment info and names)
    const updates: any = {};
    if (body.firstName !== undefined) updates.firstName = body.firstName;
    if (body.lastName !== undefined) updates.lastName = body.lastName;
    if (body.bio !== undefined) updates.bio = body.bio;
    if (body.backupEmail !== undefined) updates.backupEmail = body.backupEmail;
    if (body.birthdate !== undefined) updates.birthdate = body.birthdate;
    if (body.gender !== undefined) updates.gender = body.gender;
    if (body.country !== undefined) updates.country = body.country;
    if (body.timezone !== undefined) updates.timezone = body.timezone;
    if (body.card) updates.card = body.card; // caution: demo only

    // server-side validation for bio length
    if (updates.bio && String(updates.bio).length > 500) {
      return NextResponse.json({ ok: false, message: 'bio too long (max 500 chars)' }, { status: 400 });
    }

    const nowUtc = new Date().toISOString();
    const timezone = updates.timezone || profile.timezone || 'UTC';
    let local = nowUtc;
    try {
      const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const parts = fmt.formatToParts(new Date()).reduce((acc: any, part) => { acc[part.type] = (acc[part.type] || '') + part.value; return acc; }, {});
      local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    } catch {}

    const merged = { ...profile, ...updates, updatedAtUtc: nowUtc, updatedAtLocal: local };
    // persist
    if (useDynamo) {
      try {
        await ddbDocClient.send(new PutCommand({ TableName: PROFILES_TABLE, Item: merged }));
        return NextResponse.json({ ok: true, profile: merged });
      } catch (e) {
        console.error('[profile PATCH] Dynamo write failed', (e as any)?.message || e);
        return NextResponse.json({ ok: false, message: 'Failed to update profile' }, { status: 500 });
      }
    }

    const profilesAll = await readProfiles();
    const idx2 = profilesAll.findIndex((p) => p.roid_id === merged.roid_id || p.id === merged.id);
    if (idx2 !== -1) profilesAll[idx2] = merged; else profilesAll.push(merged);
    await writeProfiles(profilesAll);
    return NextResponse.json({ ok: true, profile: merged });
  } catch (err: any) {
    console.error('[profile PATCH] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to update profile' }, { status: 500 });
  }
}

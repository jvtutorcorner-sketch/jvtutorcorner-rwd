import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import resolveDataFile from '@/lib/localData';
import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

async function readProfiles() {
  try {
    const DATA_FILE = await resolveDataFile('profiles.json');
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

async function writeProfiles(profiles: any[]) {
  const DATA_FILE = await resolveDataFile('profiles.json');
  await fs.writeFile(DATA_FILE, JSON.stringify(profiles, null, 2), 'utf8');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.email || !body.password) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }

    const email = String(body.email).toLowerCase();
    if (body.bio && String(body.bio).length > 500) {
      return NextResponse.json({ message: 'bio too long (max 500 chars)' }, { status: 400 });
    }
    const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || '';
    const useDynamo = typeof PROFILES_TABLE === 'string' && PROFILES_TABLE.length > 0;

    if (useDynamo) {
      // check existing by email (scan fallback for demo)
      try {
        const scanRes: any = await ddbDocClient.send(new ScanCommand({ TableName: PROFILES_TABLE, FilterExpression: 'email = :email', ExpressionAttributeValues: { ':email': email } }));
        if (scanRes?.Count > 0) {
          return NextResponse.json({ message: 'Email already registered' }, { status: 409 });
        }
      } catch (e) {
        console.warn('[register] Dynamo scan failed, falling back to local check', (e as any)?.message || e);
      }
    }

    const profiles = await readProfiles();
    if (!useDynamo && profiles.find((p: any) => p.email === email)) {
      return NextResponse.json({ message: 'Email already registered' }, { status: 409 });
    }

    // Note: For simplicity, password is stored as-is. In production, hash passwords.
    // Ensure teachers do not store a plan (explicitly null)
    const plan = body.role === 'teacher' ? null : (body.plan ?? null);
    // normalize id -> roid_id
    const profile = { ...body, email, plan };
    if (profile.id && !profile.roid_id) {
      profile.roid_id = profile.id;
      delete profile.id;
    }
    // ensure id fields
    const id = profile.id || profile.roid_id || `u_${Date.now()}`;
    profile.id = id;
    profile.roid_id = profile.roid_id || id;

    if (useDynamo) {
      try {
        await ddbDocClient.send(new PutCommand({ TableName: PROFILES_TABLE, Item: profile }));
        return NextResponse.json({ ok: true, profile }, { status: 201 });
      } catch (e: any) {
        console.error('[register] DynamoDB write failed', e?.message || e);
        return NextResponse.json({ message: 'Failed to write to DB' }, { status: 500 });
      }
    }

    profiles.push(profile);
    await writeProfiles(profiles);
    return NextResponse.json({ ok: true, profile }, { status: 201 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ message: err?.message || 'Server error' }, { status: 500 });
  }
}

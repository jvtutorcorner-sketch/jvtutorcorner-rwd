import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import resolveDataFile from '@/lib/localData';
import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

async function readProfiles() {
  try {
    const DATA_FILE = await resolveDataFile('profiles.json');
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

async function writeProfiles(arr: any[]) {
  const DATA_FILE = await resolveDataFile('profiles.json');
  await fs.writeFile(DATA_FILE, JSON.stringify(arr, null, 2), 'utf8');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, plan } = body;
    if (!email) return NextResponse.json({ ok: false, error: 'email required' }, { status: 400 });
    const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || '';
    const useDynamo = typeof PROFILES_TABLE === 'string' && PROFILES_TABLE.length > 0;

    if (useDynamo) {
      try {
        const scanRes: any = await ddbDocClient.send(new ScanCommand({ TableName: PROFILES_TABLE, FilterExpression: 'email = :email', ExpressionAttributeValues: { ':email': email } }));
        if (scanRes?.Count > 0) return NextResponse.json({ ok: false, error: 'email exists' }, { status: 400 });
      } catch (e) {
        console.warn('[admin.create-user] Dynamo scan failed', (e as any)?.message || e);
      }
    }

    const profiles = await readProfiles();
    if (!useDynamo && profiles.find((p: any) => p.email === email)) return NextResponse.json({ ok: false, error: 'email exists' }, { status: 400 });

    const id = `u_${Date.now()}`;
    const record = { id, email, password: '123456', plan: plan || 'basic', nickname: email.split('@')[0], role: 'student' };

    if (useDynamo) {
      try {
        await ddbDocClient.send(new PutCommand({ TableName: PROFILES_TABLE, Item: record }));
        return NextResponse.json({ ok: true, profile: { id: record.id, email: record.email, plan: record.plan } });
      } catch (e: any) {
        console.error('[admin.create-user] Dynamo write failed', e?.message || e);
        return NextResponse.json({ ok: false, error: 'Dynamo write failed' }, { status: 500 });
      }
    }

    profiles.push(record);
    await writeProfiles(profiles);
    return NextResponse.json({ ok: true, profile: { id: record.id, email: record.email, plan: record.plan } });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message || 'error' }, { status: 500 });
  }
}

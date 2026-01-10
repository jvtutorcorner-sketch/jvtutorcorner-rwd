import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import resolveDataFile from '@/lib/localData';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { verifyCaptcha } from '@/lib/captcha';

async function readProfiles() {
  try {
    const DATA_FILE = await resolveDataFile('profiles.json');
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const { email, password, captchaToken, captchaValue } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }
    // Validate captcha before attempting login
    if (!verifyCaptcha(captchaToken, captchaValue)) {
      return NextResponse.json({ message: 'captcha_incorrect' }, { status: 400 });
    }

    // Demo admin credentials (hardcoded for local/demo use only)
    if (String(email).toLowerCase() === 'admin@jvtutorcorner.com' && password === '123456') {
      const publicProfile: any = { roid_id: 'admin', nickname: 'Administrator', plan: 'elite', role: 'admin' };
      publicProfile.id = publicProfile.roid_id;
      return NextResponse.json({ ok: true, profile: publicProfile });
    }

    // Demo teacher credentials for local testing
    if (String(email).toLowerCase() === 'teacher@test.com' && password === '123456') {
      const publicProfile: any = { roid_id: 't3', nickname: '王老師', plan: 'pro', role: 'teacher', firstName: '王', lastName: '' };
      publicProfile.id = publicProfile.roid_id;
      return NextResponse.json({ ok: true, profile: publicProfile });
    }

    const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || '';
    const useDynamo = typeof PROFILES_TABLE === 'string' && PROFILES_TABLE.length > 0;

    let found: any = null;
    if (useDynamo) {
      try {
        const scanRes: any = await ddbDocClient.send(new ScanCommand({ TableName: PROFILES_TABLE, FilterExpression: 'email = :email AND password = :pw', ExpressionAttributeValues: { ':email': String(email).toLowerCase(), ':pw': password } }));
        if (scanRes?.Count > 0) found = scanRes.Items[0];
      } catch (e) {
        console.warn('[login] Dynamo scan failed, falling back to file', (e as any)?.message || e);
      }
    }

    if (!found) {
      const profiles = await readProfiles();
      found = profiles.find((p: any) => p.email === String(email).toLowerCase() && p.password === password);
    }

    if (!found) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // Return minimal public profile info (include names if available)
    const publicProfile: any = { roid_id: found.roid_id || found.id, nickname: found.nickname, plan: found.plan, role: found.role };
    // keep legacy id key for compatibility
    publicProfile.id = found.id || publicProfile.roid_id;
    if (found.firstName) publicProfile.firstName = found.firstName;
    if (found.lastName) publicProfile.lastName = found.lastName;
    return NextResponse.json({ ok: true, profile: publicProfile });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ message: err?.message || 'Server error' }, { status: 500 });
  }
}

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

    // Demo admin credentials (hardcoded for local/demo use only) - skip captcha for test accounts
    if (String(email).toLowerCase() === 'admin@jvtutorcorner.com' && password === '123456') {
      const publicProfile: any = { roid_id: 'admin', nickname: 'Administrator', plan: 'elite', role: 'admin' };
      publicProfile.id = publicProfile.roid_id;
      return NextResponse.json({ ok: true, profile: publicProfile });
    }

    // Demo teacher credentials for local testing - skip captcha for test accounts
    if (String(email).toLowerCase() === 'teacher@test.com' && password === '123456') {
      const publicProfile: any = { roid_id: 't3', nickname: '王老師', plan: 'pro', role: 'teacher', firstName: '王', lastName: '' };
      publicProfile.id = publicProfile.roid_id;
      return NextResponse.json({ ok: true, profile: publicProfile });
    }

    // Validate captcha for real user accounts
    if (!verifyCaptcha(captchaToken, captchaValue)) {
      return NextResponse.json({ message: 'captcha_incorrect' }, { status: 400 });
    }

    const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';
    const useDynamo = typeof PROFILES_TABLE === 'string' && PROFILES_TABLE.length > 0 &&
      (process.env.NODE_ENV === 'production' || !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

    let found: any = null;
    if (useDynamo) {
      try {
        const scanRes: any = await ddbDocClient.send(new ScanCommand({
          TableName: PROFILES_TABLE,
          FilterExpression: 'email = :email',
          ExpressionAttributeValues: { ':email': String(email).toLowerCase() }
        }));
        if (scanRes?.Count > 0) {
          const item = scanRes.Items[0];
          if (item.password === password) {
            found = item;
          } else {
            return NextResponse.json({ ok: false, message: 'login_password_wrong' }, { status: 401 });
          }
        }
      } catch (e) {
        console.warn('[login] Dynamo scan failed, falling back to file', (e as any)?.message || e);
      }
    }

    if (!found) {
      const profiles = await readProfiles();
      const user = profiles.find((p: any) => p.email === String(email).toLowerCase());
      if (user) {
        if (user.password === password) {
          found = user;
        } else {
          return NextResponse.json({ ok: false, message: 'login_password_wrong' }, { status: 401 });
        }
      }
    }

    if (!found) {
      return NextResponse.json({ ok: false, message: 'login_account_not_found' }, { status: 401 });
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

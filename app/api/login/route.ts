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

    // 1. Check for bypass conditions (Environment-based test accounts + Secret)
    let skipCaptcha = false;
    const bypassSecret = process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET || process.env.LOGIN_BYPASS_SECRET || 'jv_secure_bypass_2024';
    const isBypassAttempt = bypassSecret && captchaValue === bypassSecret;

    if (isBypassAttempt) {
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@jvtutorcorner.com';
      const adminPass = process.env.ADMIN_PASSWORD || '123456';

      if (adminEmail && adminPass &&
          String(email).toLowerCase() === String(adminEmail).toLowerCase() && 
          password === adminPass) {
        skipCaptcha = true;
      }

      const testTeacherEmail = process.env.TEST_TEACHER_EMAIL || 'lin@test.com';
      const testTeacherPass = process.env.TEST_TEACHER_PASSWORD || '123456';
      const testStudentEmail = process.env.TEST_STUDENT_EMAIL || 'pro@test.com';
      const testStudentPass = process.env.TEST_STUDENT_PASSWORD || '123456';

      if (testTeacherEmail && testTeacherPass && 
          String(email).toLowerCase() === String(testTeacherEmail).toLowerCase() && 
          password === testTeacherPass) {
        skipCaptcha = true;
      }

      if (testStudentEmail && testStudentPass && 
          String(email).toLowerCase() === String(testStudentEmail).toLowerCase() && 
          password === testStudentPass) {
        skipCaptcha = true;
      }
    }

    // 2. Validate captcha if not a test account
    if (!skipCaptcha && !verifyCaptcha(captchaToken, captchaValue)) {
      console.log('[login] captcha fail', { skipCaptcha, token: !!captchaToken, val: captchaValue });
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
    if (found.email) publicProfile.email = found.email;
    if (found.firstName) publicProfile.firstName = found.firstName;
    if (found.lastName) publicProfile.lastName = found.lastName;
    return NextResponse.json({ ok: true, profile: publicProfile });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ message: err?.message || 'Server error' }, { status: 500 });
  }
}

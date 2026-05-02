import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import fs from 'fs/promises';
import path from 'path';
import resolveDataFile from '@/lib/localData';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { verifyCaptcha, getBypassSecret } from '@/lib/captcha';
import { createSession } from '@/lib/auth/sessionManager';

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
    const bypassSecret = getBypassSecret();
    
    // Check bypass via value OR via header
    const headerList = await headers();
    const e2eHeader = headerList.get('X-E2E-Secret');
    const isBypassAttempt = Boolean(bypassSecret) && (
      (captchaValue && bypassSecret && captchaValue.trim() === bypassSecret.trim()) || 
      (e2eHeader && bypassSecret && e2eHeader.trim() === bypassSecret.trim())
    );

    if (isBypassAttempt) {
      skipCaptcha = true;
      console.log('[login] captcha bypass triggered via secret');
    }

    // 2. Validate captcha if not a test account
    if (!skipCaptcha && !(await verifyCaptcha(captchaToken, captchaValue))) {
      console.log('[login] captcha fail', { skipCaptcha, token: !!captchaToken, hasCaptchaValue: Boolean(captchaValue) });
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

    // 建立 server-side session 並回傳 HttpOnly cookie
    let sessionToken: string | null = null;
    try {
      sessionToken = await createSession({
        userId: publicProfile.roid_id || publicProfile.id || found.email,
        email: found.email || email,
        role: found.role || 'user',
        plan: found.plan || 'viewer',
      });
    } catch (sessionErr) {
      // Session 建立失敗不中斷登入（graceful degradation）
      console.error('[login] Failed to create session:', sessionErr);
    }

    const res = NextResponse.json({ ok: true, profile: publicProfile });
    if (sessionToken) {
      const isProduction = process.env.NODE_ENV === 'production';
      res.headers.set(
        'Set-Cookie',
        `session=${encodeURIComponent(sessionToken)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400${isProduction ? '; Secure' : ''}`
      );
    }
    return res;
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ message: err?.message || 'Server error' }, { status: 500 });
  }
}

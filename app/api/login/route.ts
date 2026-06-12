import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { findProfileByEmail } from '@/lib/profilesService';
import { verifyCaptcha, getBypassSecret, isBypassAllowed } from '@/lib/captcha';
import { createSession } from '@/lib/auth/sessionManager';

export async function POST(req: Request) {
  try {
    const { email, password, captchaToken, captchaValue } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }

    // 1. Check for bypass conditions (Environment-based test accounts + Secret)
    let skipCaptcha = false;
    const bypassAllowed = await isBypassAllowed();
    const bypassSecret = bypassAllowed ? getBypassSecret() : undefined;
    
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

    let found: any = null;
    try {
      const profile = await findProfileByEmail(String(email).toLowerCase());
      if (profile) {
        if (profile.password === password) {
          found = profile;
        } else {
          return NextResponse.json({ ok: false, message: 'login_password_wrong' }, { status: 401 });
        }
      }
    } catch (e) {
      console.error('[login] Profile lookup failed:', (e as any)?.message || e);
      return NextResponse.json({ message: 'login_service_error' }, { status: 500 });
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
    const canonicalId = found.roid_id || found.id;
    if (!canonicalId) {
      console.error('[login] CRITICAL: profile has no roid_id or id', { email: found.email });
      return NextResponse.json({ ok: false, message: 'login_account_corrupted' }, { status: 500 });
    }

    let sessionToken: string | null = null;
    try {
      sessionToken = await createSession({
        userId: canonicalId,
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
      // SameSite=Lax (not Strict) is required to allow session cookies to be sent
      // when users are redirected back from external payment gateways (Stripe, PayPal, LINE Pay).
      // SameSite=Strict would block cookies on cross-site top-level navigations.
      res.headers.set(
        'Set-Cookie',
        `session=${encodeURIComponent(sessionToken)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400${isProduction ? '; Secure' : ''}`
      );
    }
    return res;
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ message: err?.message || 'Server error' }, { status: 500 });
  }
}

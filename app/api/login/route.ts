import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { findProfileByEmail, putProfile } from '@/lib/profilesService';
import { verifyCaptcha, getBypassSecret, isBypassAllowed } from '@/lib/captcha';
import { createSession } from '@/lib/auth/sessionManager';
import { verifyPassword, hashPassword, isHashed } from '@/lib/auth/password';
import {
  checkRateLimit,
  getRateLimitCount,
  getClientIp,
  rateLimitResponse,
  RATE_LIMIT_RULES,
} from '@/lib/rateLimit';
import { getAccountBlock } from '@/lib/auth/accountStatus';

/**
 * 是否要求 Email 驗證完成才能用密碼登入。
 * 預設關閉：舊帳號很多沒有 emailVerified 欄位，且部分環境 SMTP 未設定，貿然開啟會把使用者鎖在門外。
 * 正式環境確認驗證信能正常寄出後，設 REQUIRE_EMAIL_VERIFICATION=true 開啟。
 * 只擋「明確標記為未驗證」的帳號（註冊流程會寫 emailVerified:false），缺欄位的舊帳號不受影響。
 */
function requiresEmailVerification(): boolean {
  return process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
}

export async function POST(req: Request) {
  try {
    const { email, password, captchaToken, captchaValue } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }

    // 0. 限流：同一 IP 的登入嘗試總量（成功失敗都算），防止腳本大量撞庫。
    const clientIp = getClientIp(req);
    const ipLimit = await checkRateLimit(RATE_LIMIT_RULES.loginPerIp, clientIp);
    if (!ipLimit.allowed) {
      console.warn('[login] rate limited by ip', { ip: clientIp, count: ipLimit.count });
      return rateLimitResponse(ipLimit, 'login_too_many_attempts');
    }

    // 0b. 帳號層級鎖定：同一 Email 在時間窗內密碼錯誤太多次就暫時拒絕，不再驗密碼。
    //     只查不加，失敗時才累加（見下方）。故意在查帳號之前就擋，避免對不存在的帳號也回不同訊息。
    const normalizedEmail = String(email).toLowerCase();
    const failLock = await getRateLimitCount(RATE_LIMIT_RULES.loginFailPerEmail, normalizedEmail);
    if (!failLock.allowed) {
      console.warn('[login] account temporarily locked', { email: normalizedEmail, count: failLock.count });
      return rateLimitResponse(failLock, 'login_account_locked');
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
      const profile = await findProfileByEmail(normalizedEmail);
      if (profile) {
        if (verifyPassword(password, profile.password)) {
          // 密碼正確，再檢查帳號狀態（先驗密碼再回停權訊息，避免讓人用停權訊息探測帳號是否存在）
          const block = getAccountBlock(profile);
          if (block) {
            console.warn('[login] blocked account attempted login', { email: normalizedEmail, status: block.status });
            return NextResponse.json(
              {
                ok: false,
                message: block.status === 'banned' ? 'login_account_banned' : 'login_account_suspended',
                reason: block.reason || null,
                until: block.until || null,
              },
              { status: 403 }
            );
          }

          if (
            requiresEmailVerification() &&
            profile.emailVerified === false &&
            profile.authProvider !== 'google' &&
            !profile.lineUid
          ) {
            return NextResponse.json(
              { ok: false, message: 'login_email_not_verified', email: normalizedEmail },
              { status: 403 }
            );
          }

          found = profile;
          // Lazy migration: rehash legacy plaintext passwords on successful login
          // so at-rest exposure shrinks over time without a disruptive batch migration.
          if (!isHashed(profile.password)) {
            try {
              await putProfile({ ...profile, password: hashPassword(password) });
            } catch (e) {
              console.error('[login] Failed to rehash legacy password:', (e as any)?.message || e);
            }
          }
        } else {
          // 密碼錯誤：累加帳號失敗計數，達上限後這個帳號會被暫時鎖定（見上方 failLock）。
          const fail = await checkRateLimit(RATE_LIMIT_RULES.loginFailPerEmail, normalizedEmail);
          if (!fail.allowed) {
            console.warn('[login] account locked after repeated failures', { email: normalizedEmail, ip: clientIp });
            return rateLimitResponse(fail, 'login_account_locked');
          }
          return NextResponse.json(
            { ok: false, message: 'login_password_wrong', attemptsLeft: Math.max(0, fail.limit - fail.count) },
            { status: 401 }
          );
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
        role: found.role || 'student',
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

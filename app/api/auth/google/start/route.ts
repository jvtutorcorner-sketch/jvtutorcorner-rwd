// app/api/auth/google/start/route.ts
// 發起 Google OAuth 登入：產生 state（CSRF 防護）與 nonce（id_token 重放防護），
// 存進短效期 httpOnly cookie，導向 Google 的 authorization endpoint。
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { buildGoogleAuthUrl, isGoogleSSOConfigured } from '@/lib/auth/googleSSO';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isGoogleSSOConfigured()) {
    return NextResponse.redirect(new URL('/login?error=google_sso_not_configured', request.url));
  }

  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(24).toString('hex');
  const redirectUri = new URL('/api/auth/callback/google', request.url).toString();

  const authUrl = buildGoogleAuthUrl({ state, nonce, redirectUri });

  const res = NextResponse.redirect(authUrl);
  const isProduction = process.env.NODE_ENV === 'production';
  // 同一顆 cookie 帶 state+nonce，callback 驗證完就清掉；5 分鐘內沒完成整個往返視為過期。
  res.headers.set(
    'Set-Cookie',
    `g_oauth=${encodeURIComponent(`${state}.${nonce}`)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=300${isProduction ? '; Secure' : ''}`
  );
  return res;
}

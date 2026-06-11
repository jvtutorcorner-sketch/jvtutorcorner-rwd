import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getLineLoginConfig } from '@/lib/auth/lineLoginConfig';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const returnTo = searchParams.get('returnTo') || '/';

  let config;
  try {
    config = getLineLoginConfig();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.channelId,
    redirect_uri: config.redirectUri,
    state,
    scope: 'openid profile',
  });

  const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;

  const res = NextResponse.redirect(lineAuthUrl);
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOpts = `HttpOnly; Path=/; SameSite=Lax; Max-Age=600${isProduction ? '; Secure' : ''}`;
  res.headers.append('Set-Cookie', `line_oauth_state=${state}; ${cookieOpts}`);
  res.headers.append('Set-Cookie', `line_oauth_return_to=${encodeURIComponent(returnTo)}; ${cookieOpts}`);
  return res;
}

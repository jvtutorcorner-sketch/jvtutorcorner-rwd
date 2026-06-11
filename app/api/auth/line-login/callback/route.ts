import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getLineLoginConfig } from '@/lib/auth/lineLoginConfig';
import { findProfileByLineUid, putProfile } from '@/lib/profilesService';
import { createSession } from '@/lib/auth/sessionManager';

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=line_denied`, req.url));
  }

  const cookieHeader = req.headers.get('cookie');
  const savedState = parseCookie(cookieHeader, 'line_oauth_state');
  const returnTo = parseCookie(cookieHeader, 'line_oauth_return_to') || '/';

  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL(`/login?error=line_state_mismatch`, req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL(`/login?error=line_no_code`, req.url));
  }

  let config;
  try {
    config = getLineLoginConfig();
  } catch (e: any) {
    return NextResponse.redirect(new URL(`/login?error=line_not_configured`, req.url));
  }

  // Exchange code for access token
  let accessToken: string;
  try {
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.channelId,
        client_secret: config.channelSecret,
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('[line-login] token exchange failed', tokenRes.status, body);
      return NextResponse.redirect(new URL(`/login?error=line_token_failed`, req.url));
    }
    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;
  } catch (e) {
    console.error('[line-login] token exchange error', e);
    return NextResponse.redirect(new URL(`/login?error=line_token_error`, req.url));
  }

  // Fetch LINE profile
  let lineProfile: { userId: string; displayName: string; pictureUrl?: string };
  try {
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileRes.ok) {
      return NextResponse.redirect(new URL(`/login?error=line_profile_failed`, req.url));
    }
    lineProfile = await profileRes.json();
  } catch (e) {
    console.error('[line-login] profile fetch error', e);
    return NextResponse.redirect(new URL(`/login?error=line_profile_error`, req.url));
  }

  const { userId: lineUid, displayName, pictureUrl } = lineProfile;

  // Find or create platform profile
  let profile = await findProfileByLineUid(lineUid);
  if (!profile) {
    const newId = crypto.randomUUID();
    profile = {
      id: newId,
      roid_id: newId,
      lineUid,
      nickname: displayName,
      firstName: displayName,
      lastName: '',
      pictureUrl: pictureUrl || '',
      email: `line_${lineUid}@line.local`,
      role: 'user',
      plan: 'free',
      emailVerified: false,
      createdAt: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
    };
    await putProfile(profile);
  } else if (pictureUrl && profile.pictureUrl !== pictureUrl) {
    // Keep pictureUrl fresh
    profile = { ...profile, pictureUrl, updatedAtUtc: new Date().toISOString() };
    await putProfile(profile);
  }

  // Create session (same system as email login)
  let sessionToken: string | null = null;
  try {
    sessionToken = await createSession({
      userId: profile.roid_id || profile.id,
      email: profile.email,
      role: profile.role || 'user',
      plan: profile.plan || 'free',
    });
  } catch (e) {
    console.error('[line-login] session creation failed', e);
    return NextResponse.redirect(new URL(`/login?error=line_session_failed`, req.url));
  }

  const redirectUrl = new URL(returnTo, req.url);
  redirectUrl.searchParams.set('lineVerified', '1');

  const res = NextResponse.redirect(redirectUrl);
  const isProduction = process.env.NODE_ENV === 'production';
  const sessionCookie = `session=${encodeURIComponent(sessionToken)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400${isProduction ? '; Secure' : ''}`;
  const clearState = `line_oauth_state=; HttpOnly; Path=/; Max-Age=0`;
  const clearReturn = `line_oauth_return_to=; HttpOnly; Path=/; Max-Age=0`;
  res.headers.append('Set-Cookie', sessionCookie);
  res.headers.append('Set-Cookie', clearState);
  res.headers.append('Set-Cookie', clearReturn);
  return res;
}

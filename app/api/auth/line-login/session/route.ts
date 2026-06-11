import { NextResponse } from 'next/server';
import { extractTokenFromRequest, getSession } from '@/lib/auth/sessionManager';
import { getProfileById } from '@/lib/profilesService';

export async function GET(req: Request) {
  const token = extractTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ authenticated: false, profile: null });
  }

  const session = await getSession(token);
  if (!session) {
    return NextResponse.json({ authenticated: false, profile: null });
  }

  // Only return LINE-based sessions (email ends with @line.local) or any valid session
  const profile = await getProfileById(session.userId);
  const isLineUser = profile?.lineUid || session.email?.endsWith('@line.local');

  return NextResponse.json({
    authenticated: true,
    isLineUser: Boolean(isLineUser),
    profile: profile
      ? {
          id: profile.id,
          nickname: profile.nickname || profile.firstName,
          displayName: profile.nickname || profile.firstName,
          pictureUrl: profile.pictureUrl || null,
          lineUid: profile.lineUid || null,
          role: profile.role,
          plan: profile.plan,
          email: profile.email,
        }
      : null,
  });
}

export async function DELETE(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
  return res;
}

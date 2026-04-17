// app/api/auth/me/route.ts
// 取得目前登入使用者資訊（用於前端確認 session 狀態）

import { NextResponse } from 'next/server';
import { extractTokenFromRequest, getSession } from '@/lib/auth/sessionManager';

export async function GET(req: Request) {
  const token = extractTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }

  const session = await getSession(token);
  if (!session) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    authenticated: true,
    user: {
      userId: session.userId,
      email: session.email,
      role: session.role,
      plan: session.plan,
    },
  });
}

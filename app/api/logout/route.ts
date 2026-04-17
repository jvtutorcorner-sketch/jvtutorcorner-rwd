// app/api/logout/route.ts
// 登出 API：清除 DynamoDB session 並刪除 cookie

import { NextResponse } from 'next/server';
import { extractTokenFromRequest, deleteSession } from '@/lib/auth/sessionManager';

export async function POST(req: Request) {
  const token = extractTokenFromRequest(req);
  if (token) {
    await deleteSession(token);
  }

  const res = NextResponse.json({ ok: true, message: 'Logged out' });
  // 清除 session cookie
  res.headers.set(
    'Set-Cookie',
    'session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0'
  );
  return res;
}

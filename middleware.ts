import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // 禁用快取
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');

  // 移除 HSTS 限制（允許 HTTP）
  response.headers.delete('Strict-Transport-Security');

  return response;
}

export const config = {
  matcher: '/:path*',
};

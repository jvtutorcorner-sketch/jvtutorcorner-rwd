import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 需要登入才看得到、且內容因人而異的路徑前綴。
 * 這些頁面（與所有 API）不可被 CDN 或瀏覽器快取，否則會把 A 使用者的畫面送給 B。
 */
const PRIVATE_PATH_PREFIXES = [
  '/api',
  '/admin',
  '/settings',
  '/apps',
  '/add-app',
  '/workflows',
  '/dashboard',
  '/orders',
  '/enrollments',
  '/profile',
  '/calendar',
  '/classroom',
  '/redeem',
  '/plans',
  '/my-courses',
  '/courses_manage',
  '/student_courses',
  '/teacher_courses',
  '/teacher',
  '/teacher-escrow',
  '/carousel',
  '/refunds',
  '/learning-content',
  '/cyberbiz-affiliate-report',
  '/checkDevices',
];

function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Server Component（例如 app/admin/layout.tsx 的權限判斷）沒有辦法直接取得
  // 目前的 pathname，只能靠 middleware 從 request header 傳進去。
  // 注意：必須用 `NextResponse.next({ request: { headers } })` 覆寫「請求」的 header，
  // 在 response 上 set 是傳不到 Server Component 的。
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // 只有私有頁面與 API 停用快取。
  //
  // 先前這裡對「所有」請求（matcher 是 `/:path*`，連 /_next/static/* 都算）設了
  // no-store，等於整站繞過 CDN：每次換頁都要回源重抓 content-hash 過的靜態資源。
  // 現在靜態資源由 matcher 排除，公開頁面則交給 Next.js 自己決定快取策略。
  if (isPrivatePath(pathname)) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  return response;
}

export const config = {
  // 排除靜態資源：它們的檔名帶 content hash，本來就該被長期快取，
  // 而且對它們跑 middleware 只是徒增 edge 呼叫成本。
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf|map)$).*)',
  ],
};

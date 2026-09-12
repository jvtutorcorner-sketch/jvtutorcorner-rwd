import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/sessionManager';
import { canAccessPage } from '@/lib/auth/pagePermissions';

/**
 * Admin 區域共用 layout（server component）。
 *
 * 進入任何 /admin/* 頁面前：
 *   1. 驗證 session cookie 有效性（HMAC 簽名 + DynamoDB 查表）
 *   2. 限制可進入 admin 區域的角色：admin / dept_admin / system
 *   3. 依 page permission 矩陣檢查 path 層級可見性
 *      - dept_admin 僅可見所屬部門相關子路徑（見 DEFAULT_PAGE_PERMISSIONS）
 *      - 真正的資料存取隔離由 API 層 lib/auth/orgAccess.ts 的 requireOrgUnitAccess /
 *        requireMemberScopeAccess 強制
 *
 * 未登入 → redirect /login。
 * 已登入但無權限 → redirect /dashboard?forbidden=1。
 */

const ALLOWED_ADMIN_ROLES = new Set(['admin', 'dept_admin', 'system']);

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;

  if (!token) {
    redirect('/login?reason=admin_no_session');
  }

  const session = await getSession(token);
  if (!session) {
    redirect('/login?reason=admin_invalid_session');
  }

  if (!ALLOWED_ADMIN_ROLES.has(session.role)) {
    redirect('/dashboard?forbidden=1');
  }

  // 取得當前 pathname（由 middleware 注入 x-pathname）
  const headerStore = await headers();
  const pathname = headerStore.get('x-pathname') || '/admin';

  const access = await canAccessPage(session.role, pathname);
  if (!access.allowed) {
    redirect('/dashboard?forbidden=1');
  }

  return <>{children}</>;
}
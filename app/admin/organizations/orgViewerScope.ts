// app/admin/organizations/orgViewerScope.ts
// Server-only：判斷「目前 session 的使用者」對某個組織詳細頁 (/admin/organizations/<orgId>) 的檢視範圍。
//
// Session 本身不帶 orgId/isOrgAdmin（見 lib/auth/orgAccess.ts），企業的組織管理員通常 role 仍是
// 'student'，所以 admin layout 光看 session.role 會把他們擋在外面。這裡另外查 profile，
// 與 API 層 requireOrgAccess / requireOrgUnitAccess 的判斷保持一致：
//   - 'system'    ：role admin / system，全權
//   - 'org_admin' ：profile.isOrgAdmin === true 且 profile.orgId === orgId
//   - 'dept_admin'：profile.role === 'dept_admin' 且 profile.orgId === orgId（API 只給部門子樹範圍）
//   - null        ：其餘一律無權限
//
// 用 React cache() 包起來，讓同一個 request 內 layout 與 page 各自呼叫時只查一次 profile。

import { cache } from 'react';
import { getProfileById } from '@/lib/profilesService';
import type { Session } from '@/lib/auth/sessionManager';
import type { ProfileB2B } from '@/lib/types/b2b';

export type OrgViewerScope = 'system' | 'org_admin' | 'dept_admin';

/** /admin/organizations/<orgId>（含子路徑）→ orgId；其他路徑（含列表頁本身）→ null。 */
export function extractOrgIdFromAdminPath(pathname: string): string | null {
  const m = pathname.match(/^\/admin\/organizations\/([^/?#]+)(?:\/|$)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

const loadProfile = cache(async (userId: string): Promise<Partial<ProfileB2B> | null> => {
  try {
    return ((await getProfileById(userId)) as Partial<ProfileB2B> | null) ?? null;
  } catch (err) {
    console.warn('[orgViewerScope] profile lookup failed', err instanceof Error ? err.message : err);
    return null;
  }
});

export async function resolveOrgViewerScope(
  session: Pick<Session, 'userId' | 'role'>,
  orgId: string
): Promise<OrgViewerScope | null> {
  if (!orgId) return null;
  if (session.role === 'admin' || session.role === 'system') return 'system';

  const profile = await loadProfile(session.userId);
  if (!profile || profile.orgId !== orgId) return null;
  if (profile.isOrgAdmin === true) return 'org_admin';
  if (profile.role === 'dept_admin') return 'dept_admin';
  return null;
}

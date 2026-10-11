import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/sessionManager';

/**
 * 內容管理頁（不在 /admin 底下）的伺服器端守衛：未登入或不是管理員就不渲染頁面。
 * 資料的讀寫另外由 /api/ai-zone/items 的 withAdmin 保護，這裡只是不讓頁面外殼被看到。
 */
export default async function AiZoneManageLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get('session')?.value;
  if (!token) redirect('/login?reason=ai_zone_manage_no_session');

  const session = await getSession(token);
  if (!session) redirect('/login?reason=ai_zone_manage_invalid_session');
  if (session.role !== 'admin' && session.role !== 'system') redirect('/dashboard?forbidden=1');

  return <>{children}</>;
}

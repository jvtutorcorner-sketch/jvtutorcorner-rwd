// lib/auth/pageGuard.ts
// Server component 用的頁面守衛。
//
// 專案原本只有 app/admin/layout.tsx 一道真正的頁面防線，其餘敏感頁面都是在
// client 的 useEffect 裡讀 localStorage 判斷角色 —— 使用者可以自行改寫，
// 而且守衛跑在 effect 裡，頁面已經渲染、API 也已經送出才跳轉。
//
// 這個 helper 讓各區塊用一個 layout.tsx 就能在「伺服器端、渲染之前」擋下來。

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, type Session } from './sessionManager';

export type PageGuardOptions = {
  /** 允許進入的角色。省略代表只要登入即可。 */
  roles?: string[];
  /** 記在 redirect query 上，方便從登入頁看出是哪個守衛擋的。 */
  reason?: string;
};

/**
 * 驗證 session cookie，必要時檢查角色；不通過就 redirect（不會回傳）。
 */
export async function requirePageSession(options: PageGuardOptions = {}): Promise<Session> {
  const { roles, reason } = options;

  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;

  if (!token) {
    redirect(`/login?reason=${encodeURIComponent(reason ? `${reason}_no_session` : 'no_session')}`);
  }

  const session = await getSession(token);
  if (!session) {
    redirect(`/login?reason=${encodeURIComponent(reason ? `${reason}_invalid_session` : 'invalid_session')}`);
  }

  if (roles && roles.length > 0 && !roles.includes(session.role)) {
    redirect('/dashboard?forbidden=1');
  }

  return session;
}

/** 只有管理員（含 system）能進入。 */
export async function requireAdminPage(reason?: string): Promise<Session> {
  return requirePageSession({ roles: ['admin', 'system'], reason });
}

/** 老師或管理員可進入。 */
export async function requireTeacherPage(reason?: string): Promise<Session> {
  return requirePageSession({ roles: ['teacher', 'admin', 'system'], reason });
}

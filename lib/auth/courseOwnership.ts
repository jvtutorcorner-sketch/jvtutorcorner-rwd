// lib/auth/courseOwnership.ts
// 課程建立/修改/刪除的擁有權判斷。courses table 用 `teacherId` 欄位標記擁有者，但這個值
// 實務上常常就是老師 profile 的 id/roid_id（見 app/api/orders/route.ts 的 teacherId 解析邏輯），
// 所以「這個 session 是不是這堂課的老師」要拿 profile.teacherId、profile.roid_id、profile.id
// 三個都比一次，缺一個都可能誤判成不是本人。
import { getProfileById } from '@/lib/profilesService';
import type { AuthedRequest } from './apiGuard';

/** 這個 session 對應的老師身分可能用來標記課程擁有權的所有識別碼。 */
export async function resolveOwnTeacherIds(session: AuthedRequest['session']): Promise<Set<string>> {
  const ids = new Set<string>([session.userId]);
  try {
    const profile = await getProfileById(session.userId);
    if (profile?.teacherId) ids.add(String(profile.teacherId));
    if (profile?.roid_id) ids.add(String(profile.roid_id));
    if (profile?.id) ids.add(String(profile.id));
  } catch {
    // profile 查詢失敗就只用 session.userId 比對，不中斷請求
  }
  return ids;
}

/** admin 全權；teacher 只能動自己 teacherId 對得上的課程；其他角色一律不行。 */
export async function canManageCourse(
  session: AuthedRequest['session'],
  course: { teacherId?: string | null } | null | undefined
): Promise<boolean> {
  if (session.role === 'admin' || session.role === 'system') return true;
  if (session.role !== 'teacher') return false;
  if (!course?.teacherId) return false;
  const ownIds = await resolveOwnTeacherIds(session);
  return ownIds.has(String(course.teacherId));
}

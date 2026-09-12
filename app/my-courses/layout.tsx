import { requireTeacherPage } from '@/lib/auth/pageGuard';

/**
 * 伺服器端存取守衛。先前這個區塊只有 client 端讀 localStorage 的檢查（可偽造），
 * 或完全沒有檢查，頁面會先渲染並送出 API 請求才跳轉。
 */
export default async function MyCoursesLayout({ children }: { children: React.ReactNode }) {
  await requireTeacherPage('my_courses');
  return <>{children}</>;
}

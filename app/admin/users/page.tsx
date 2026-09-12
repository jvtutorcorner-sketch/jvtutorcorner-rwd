import AdminUserManager from '@/components/AdminUserManager';

export const metadata = {
  title: 'Admin - 使用者帳號管理',
};

export default function Page() {
  return (
    <main style={{ padding: 24 }}>
      <h1>👤 使用者帳號管理</h1>
      <p>
        查詢所有註冊帳號並進行停權／封鎖／恢復。停權或封鎖會立即刪除該使用者所有登入 session，
        已登入的裝置下一個請求就會被登出；所有異動都寫入稽核紀錄。
      </p>
      <AdminUserManager />
    </main>
  );
}

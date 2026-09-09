import AuditLogViewer from '@/components/AuditLogViewer';

export const metadata = {
  title: 'Admin - Audit Logs',
};

export default function Page() {
  return (
    <main style={{ padding: 24 }}>
      <h1>🧾 稽核紀錄查詢</h1>
      <p>查詢組織／授權／訂單／角色設定等高風險異動的稽核紀錄。僅系統管理員可存取——這張表沒有 orgId 欄位，無法安全地限定成「只看自己組織」。</p>
      <AuditLogViewer />
    </main>
  );
}

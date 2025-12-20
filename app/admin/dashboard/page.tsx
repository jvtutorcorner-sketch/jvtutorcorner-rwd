import Link from 'next/link';
import { TEACHERS } from '@/data/teachers';
import { STUDENTS } from '@/data/students';

export const metadata = {
  title: 'Admin Dashboard',
};

export default function AdminDashboard() {
  return (
    <main style={{ padding: 24 }}>
      <h1>管理後台</h1>
      <p>快速瀏覽：老師、學生與訂單紀錄（示範）。</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 16 }}>
        <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
          <h3>輪播圖管理</h3>
          <p>上傳和管理首頁輪播圖片</p>
          <Link href="/admin/carousel">前往輪播圖管理</Link>
        </div>

        <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
          <h3>老師</h3>
          <p>目前資料：{TEACHERS.length} 位老師</p>
          <Link href="/teachers">查看老師列表</Link>
        </div>

        <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
          <h3>學生</h3>
          <p>目前資料：{STUDENTS.length} 位學生</p>
          <Link href="/students">查看學生列表</Link>
        </div>

        <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
          <h3>訂單</h3>
          <p>管理訂單紀錄與匯出（示範）</p>
          <Link href="/admin/orders">前往訂單管理</Link>
          <br />
          <Link href="/admin/settings">設定（師生顯示、預設方案）</Link>
        </div>
      </div>
    </main>
  );
}

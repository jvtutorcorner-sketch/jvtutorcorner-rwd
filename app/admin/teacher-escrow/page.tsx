import TeacherEscrowManager from '@/components/TeacherEscrowManager';

export const metadata = {
  title: 'Admin - Teacher Escrow',
};

export default function Page() {
  return (
    <main style={{ padding: 24 }}>
      <h1>老師點數暫存管理</h1>
      <p>查看老師通過課程完成而收到的點數暫存（Escrow）記錄。</p>
      <TeacherEscrowManager />
    </main>
  );
}

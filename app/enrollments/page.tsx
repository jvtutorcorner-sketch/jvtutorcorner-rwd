import EnrollmentManager from '@/components/EnrollmentManager';
import SimulationButtons from '@/components/SimulationButtons';

export const metadata = {
  title: '我的報名與訂單',
};

export default function Page() {
  return (
    <main style={{ padding: 24 }}>
      <h1>我的報名與訂單</h1>
      <p>此頁顯示四階段金流流程的 demo 操作介面（建立訂單 → 付款確認 → 課程生效 → 退款/取消）。</p>
      <SimulationButtons />
      <EnrollmentManager />
    </main>
  );
}

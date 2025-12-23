import EnrollmentManager from '@/components/EnrollmentManager';
import SimulationButtons from '@/components/SimulationButtons';

export const metadata = {
  title: '我的報名與訂單',
};

export default function Page() {
  return (
    <main style={{ padding: 24 }}>
      <h1>我的報名已合併到「訂單紀錄」</h1>
      <p>報名與相關示範操作已移到 <a href="/student_courses">訂單紀錄</a> 頁面，請至該頁查看或使用示範按鈕。</p>
    </main>
  );
}

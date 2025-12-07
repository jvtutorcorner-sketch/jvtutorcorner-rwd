import Link from 'next/link';

export const metadata = {
  title: '關於我們 - Tutor Corner',
  description: '關於 Tutor Corner 與我們的教學使命。',
};

export default function AboutPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>關於我們</h1>
      <p>
        歡迎來到 Tutor Corner。 我們的使命是提供高品質的一對一與小班教學，
        結合即時白板、錄影回放與專業師資，幫助學生達成學習目標。
      </p>

      <section style={{ marginTop: 24 }}>
        <h2>我們的特色</h2>
        <ul>
          <li>嚴選師資，完整的審核與課程設計支援</li>
          <li>即時白板與錄影回放，方便複習</li>
          <li>靈活的課程時段與跨國語系支援</li>
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>聯絡我們</h2>
        <p>若有任何問題，請透過電子郵件聯絡：support@tutorcorner.example</p>
      </section>

      <div style={{ marginTop: 24 }}>
        <Link href="/">← 回到首頁</Link>
      </div>
    </main>
  );
}

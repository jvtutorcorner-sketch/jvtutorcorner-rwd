import Link from 'next/link';
import fs from 'fs/promises';
import resolveDataFile from '@/lib/localData';

export const metadata = {
  title: '關於我們 - Tutor Corner',
  description: '關於 Tutor Corner 與我們的教學使命。',
};

async function readAboutContent() {
  try {
    const SETTINGS_FILE = await resolveDataFile('admin_settings.json');
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(raw || '{}');
    const about = settings?.pageContents?.['/about'] || null;
    return about;
  } catch (e) {
    return null;
  }
}

export default async function AboutPage() {
  const about = await readAboutContent();

  // defaults
  const intro = '歡迎來到 Tutor Corner。 我們的使命是提供高品質的一對一與小班教學，\n結合即時白板、錄影回放與專業師資，幫助學生達成學習目標。';
  const defaultFeatures = ['嚴選師資，完整的審核與課程設計支援', '即時白板與錄影回放，方便複習', '靈活的課程時段與跨國語系支援'];
  const defaultContact = '若有任何問題，請透過電子郵件聯絡：support@tutorcorner.example';

  const introText = about?.intro || intro;
  const featuresRaw = about?.features || null; // may be string (HTML or newline) or array
  const contactRaw = about?.contact || defaultContact;

  // helper to render features
  const renderFeatures = () => {
    if (!featuresRaw) {
      return (
        <ul>
          {defaultFeatures.map((f) => (<li key={f}>{f}</li>))}
        </ul>
      );
    }
    if (Array.isArray(featuresRaw)) {
      return (
        <ul>
          {featuresRaw.map((f: string) => (<li key={f}>{f}</li>))}
        </ul>
      );
    }
    // string: if contains HTML tags, render as HTML, else split lines
    const s = String(featuresRaw || '');
    if (s.includes('<')) {
      return <div dangerouslySetInnerHTML={{ __html: s }} />;
    }
    return (
      <ul>
        {s.split(/\r?\n/).filter(Boolean).map((line) => (<li key={line}>{line}</li>))}
      </ul>
    );
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>關於我們</h1>
      <p style={{ whiteSpace: 'pre-line' }}>{introText}</p>

      <section style={{ marginTop: 24 }}>
        <h2>我們的特色</h2>
        {renderFeatures()}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>聯絡我們</h2>
        <p style={{ whiteSpace: 'pre-line' }}>{contactRaw}</p>
      </section>

      <div style={{ marginTop: 24 }}>
        <Link href="/">← 回到首頁</Link>
      </div>
    </main>
  );
}

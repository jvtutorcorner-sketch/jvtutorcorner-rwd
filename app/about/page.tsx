// app/about/page.tsx
'use client';

import Link from 'next/link';
import { useT } from '@/components/IntlProvider';

export default function AboutPage() {
  const t = useT();

  // defaults
  const intro = t('about_intro');
  const defaultFeatures = [t('about_feature1'), t('about_feature2'), t('about_feature3')];
  const defaultContact = t('about_contact');

  const introText = intro;
  const featuresRaw = null; // use defaults
  const contactRaw = defaultContact;

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
      <h1>{t('about_title')}</h1>
      <p style={{ whiteSpace: 'pre-line' }}>{introText}</p>

      <section style={{ marginTop: 24 }}>
        <h2>{t('about_features_title')}</h2>
        {renderFeatures()}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>{t('about_contact_title')}</h2>
        <p style={{ whiteSpace: 'pre-line' }}>{contactRaw}</p>
      </section>

      <div style={{ marginTop: 24 }}>
        <Link href="/">{t('back_to_home')}</Link>
      </div>
    </main>
  );
}

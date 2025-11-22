// app/page.tsx
'use client';

import zhTW from '@/locales/zh-TW/common.json';
import en from '@/locales/en/common.json';
import { Carousel } from '@/components/Carousel';
import { useEffect, useState } from 'react';

type Locale = 'zh-TW' | 'en';
type Messages = typeof zhTW;

const dictionaries: Record<Locale, Messages> = {
  'zh-TW': zhTW,
  en,
};

function useI18n() {
  const [locale, setLocale] = useState<Locale>('zh-TW');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('locale') as Locale | null;
      if (stored && dictionaries[stored]) {
        setLocale(stored);
      }
    }
  }, []);

  const t = (key: keyof Messages) => dictionaries[locale][key] ?? key;

  return { t, locale, setLocale };
}

export default function HomePage() {
  const { t } = useI18n();

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-text">
          <h1>{t('hero_title')}</h1>
          <p>{t('hero_subtitle')}</p>
          <div className="hero-cta">
            <button>{t('cta_find_teacher')}</button>
            <button className="secondary">{t('cta_find_course')}</button>
          </div>
        </div>
        <div className="hero-carousel">
          <Carousel
            slides={[
              t('carousel_slide1'),
              t('carousel_slide2'),
              t('carousel_slide3'),
            ]}
          />
        </div>
      </section>
    </div>
  );
}


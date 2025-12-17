// app/page.tsx
'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import zhTW from '@/locales/zh-TW/common.json';
import en from '@/locales/en/common.json';
import { Carousel } from '@/components/Carousel';
import { TEACHERS } from '@/data/teachers';
import { COURSES } from '@/data/courses';
import { TeacherCard } from '@/components/TeacherCard';
import { CourseCard } from '@/components/CourseCard';
import Tabs from '@/components/Tabs';

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

type SearchTarget = 'teachers' | 'courses';

export default function HomePage() {
  const { t } = useI18n();
  const router = useRouter();

  const recommendedTeachers = TEACHERS.slice(0, 3);
  const hotCourses = COURSES.slice(0, 3);

  return (
    <div className="home">
      {/* Header renders the main menu; removed Homepage MenuBar to avoid duplication */}
      {/* Hero + Carousel */}
      <section className="hero">
        <div className="hero-text">
          <h1>{t('hero_title')}</h1>
          <p>{t('hero_subtitle')}</p>
        </div>
        <div className="hero-carousel">
          <Carousel
            slides={[
              '一對一視訊家教',
              '小班制團體課程',
              '即時白板 + 錄影回放',
            ]}
          />
        </div>
      </section>

      <section className="section">
        <Tabs
          items={[
            {
              key: 'teachers',
              title: '推薦老師',
              content: (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h2 className="section-title">推薦老師</h2>
                    <Link href="/teachers" className="section-link">看全部老師 →</Link>
                  </div>
                  <div className="card-grid">
                    {recommendedTeachers.map((teacher) => (
                      <TeacherCard key={teacher.id} teacher={teacher} />
                    ))}
                  </div>
                </>
              )
            },
            {
              key: 'courses',
              title: '熱門課程',
              content: (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h2 className="section-title">熱門課程</h2>
                    <Link href="/courses" className="section-link">看全部課程 →</Link>
                  </div>
                  <div className="card-grid">
                    {hotCourses.map((course) => (
                      <CourseCard key={course.id} course={course} />
                    ))}
                  </div>
                </>
              )
            },
            {
              key: 'features',
              title: '平台特色',
              content: (
                <>
                  <h2 className="section-title">平台特色</h2>
                  <div className="feature-grid">
                    <div className="feature-card">
                      <h3>線上白板與錄影</h3>
                      <p>內建小畫家式白板與課後錄影回放，方便複習重點。</p>
                    </div>
                    <div className="feature-card">
                      <h3>多國語系介面</h3>
                      <p>支援繁中 / 英文介面，未來可擴充更多語言，方便跨國教學。</p>
                    </div>
                    <div className="feature-card">
                      <h3>跨國金流收款</h3>
                      <p>規劃整合 Stripe + 在地金流，支援國內外學生安全付款。</p>
                    </div>
                  </div>
                </>
              )
            }
          ]}
        />
      </section>
    </div>
  );
}

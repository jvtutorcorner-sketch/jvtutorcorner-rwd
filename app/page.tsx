// app/page.tsx
'use client';

import { useEffect, useState, FormEvent } from 'react';
import zhTW from '@/locales/zh-TW/common.json';
import en from '@/locales/en/common.json';
import { Carousel } from '@/components/Carousel';
import { TEACHERS } from '@/data/teachers';
import { COURSES } from '@/data/courses';
import { TeacherCard } from '@/components/TeacherCard';
import { CourseCard } from '@/components/CourseCard';

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

  // 搜尋條件 state（先純粹 log，用不到後端）
  const [subject, setSubject] = useState('');
  const [language, setLanguage] = useState('');
  const [region, setRegion] = useState('');
  const [mode, setMode] = useState<'online' | 'onsite' | ''>('');

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    console.log('搜尋條件', { subject, language, region, mode });
    alert('目前是示範版，搜尋結果先用 /teachers /courses 頁面查看 🙂');
  };

  const recommendedTeachers = TEACHERS.slice(0, 3);
  const hotCourses = COURSES.slice(0, 3);

  return (
    <div className="home">
      {/* Hero + Carousel */}
      <section className="hero">
        <div className="hero-text">
          <h1>{t('hero_title')}</h1>
          <p>{t('hero_subtitle')}</p>
          <div className="hero-cta">
            <button onClick={() => alert('之後可導向 /teachers')}>
              {t('cta_find_teacher')}
            </button>
            <button
              className="secondary"
              onClick={() => alert('之後可導向 /courses')}
            >
              {t('cta_find_course')}
            </button>
          </div>
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

      {/* 搜尋區塊 */}
      <section className="section search-section">
        <h2 className="section-title">找老師 / 找課程</h2>
        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-row">
            <div className="field">
              <label>科目</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option value="">不限</option>
                <option value="英文">英文</option>
                <option value="數學">數學</option>
                <option value="日文">日文</option>
              </select>
            </div>
            <div className="field">
              <label>授課語言</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="">不限</option>
                <option value="中文">中文</option>
                <option value="英文">英文</option>
                <option value="日文">日文</option>
              </select>
            </div>
          </div>
          <div className="search-row">
            <div className="field">
              <label>地區</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="">線上 / 不限</option>
                <option value="台北">台北</option>
                <option value="新北">新北</option>
                <option value="其他">其他</option>
              </select>
            </div>
            <div className="field">
              <label>授課方式</label>
              <select
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as 'online' | 'onsite' | '')
                }
              >
                <option value="">不限</option>
                <option value="online">線上</option>
                <option value="onsite">實體</option>
              </select>
            </div>
          </div>
          <button type="submit" className="search-button">
            搜尋
          </button>
        </form>
      </section>

      {/* 推薦老師 */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">推薦老師</h2>
          <a href="/teachers" className="section-link">
            看全部老師 →
          </a>
        </div>
        <div className="card-grid">
          {recommendedTeachers.map((teacher) => (
            <TeacherCard key={teacher.id} teacher={teacher} />
          ))}
        </div>
      </section>

      {/* 熱門課程 */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">熱門課程</h2>
          <a href="/courses" className="section-link">
            看全部課程 →
          </a>
        </div>
        <div className="card-grid">
          {hotCourses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      </section>

      {/* 平台特色 */}
      <section className="section">
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
      </section>
    </div>
  );
}


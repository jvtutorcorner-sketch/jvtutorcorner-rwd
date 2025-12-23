// app/page.tsx
 'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Carousel } from '@/components/Carousel';
import { TEACHERS } from '@/data/teachers';
import { COURSES } from '@/data/courses';
import { TeacherCard } from '@/components/TeacherCard';
import { CourseCard } from '@/components/CourseCard';
import Tabs from '@/components/Tabs';
import { getStoredUser, type StoredUser } from '@/lib/mockAuth';

import { useT } from '@/components/IntlProvider';
type SearchTarget = 'teachers' | 'courses';

export default function HomePage() {
  const t = useT();
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [carouselImages, setCarouselImages] = useState<string[]>([
    '一對一視訊家教',
    '小班制團體課程',
    '即時白板 + 錄影回放',
  ]);

  useEffect(() => {
    const u = getStoredUser();
    setUser(u);

    // 獲取輪播圖
    fetch('/api/carousel')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const urls = data.map((img: any) => img.url);
          setCarouselImages(urls);
        } else {
          // If API returns empty, keep the default text slides
          console.log('Carousel API returned no images, using defaults');
        }
      })
      .catch(err => {
        console.error('Error loading carousel:', err);
      });
  }, []);

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
            slides={carouselImages}
            isImage={carouselImages[0]?.startsWith('data:') || carouselImages[0]?.startsWith('http')}
          />
        </div>
      </section>

      <section className="section">
        <Tabs
          items={[
            {
              key: 'teachers',
              title: t('recommended_teachers'),
              content: (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h2 className="section-title">{t('recommended_teachers')}</h2>
                    <Link href="/teachers" className="section-link">{t('see_all_teachers')} →</Link>
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
              title: t('popular_courses'),
              content: (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h2 className="section-title">{t('popular_courses')}</h2>
                    <Link href="/courses" className="section-link">{t('see_all_courses')} →</Link>
                  </div>
                  <div className="card-grid">
                    {hotCourses.map((course) => (
                      <CourseCard key={course.id} course={course} />
                    ))}
                  </div>
                </>
              )
            },
            ...(user?.role === 'admin' ? [{
              key: 'features',
              title: t('platform_features'),
              content: (
                <>
                  <h2 className="section-title">{t('platform_features')}</h2>
                  <div className="feature-grid">
                    <div className="feature-card">
                      <h3>{t('feature_whiteboard')}</h3>
                      <p>{t('feature_whiteboard_desc')}</p>
                    </div>
                    <div className="feature-card">
                      <h3>{t('feature_multilingual')}</h3>
                      <p>{t('feature_multilingual_desc')}</p>
                    </div>
                    <div className="feature-card">
                      <h3>{t('feature_payment')}</h3>
                      <p>{t('feature_payment_desc')}</p>
                    </div>
                  </div>
                </>
              )
            }] : [])
          ]}
        />
      </section>
    </div>
  );
}

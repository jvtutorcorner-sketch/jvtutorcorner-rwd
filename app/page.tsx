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
    t('carousel_slide1'),
    t('carousel_slide2'),
    t('carousel_slide3'),
  ]);

  useEffect(() => {
    const u = getStoredUser();
    setUser(u);

    // 獲取輪播圖
    console.log('[HomePage] Fetching carousel images from /api/carousel');
    fetch('/api/carousel')
      .then(res => {
        console.log('[HomePage] Carousel API response status:', res.status, res.statusText);
        return res.json();
      })
      .then(data => {
        console.log('[HomePage] Carousel API response data:', data);
        console.log('[HomePage] Data is array:', Array.isArray(data));
        console.log('[HomePage] Data length:', data?.length);
        
        if (Array.isArray(data) && data.length > 0) {
          console.log('[HomePage] First item:', data[0]);
          const urls = data.map((img: any) => img.url);
          console.log('[HomePage] Extracted URLs:', urls);
          setCarouselImages(urls);
          console.log('[HomePage] Successfully set carousel images');
        } else {
          // If API returns empty, keep the default text slides
          console.log('[HomePage] Carousel API returned no images, using defaults');
        }
      })
      .catch(err => {
        console.error('[HomePage] Error loading carousel:', err);
        console.error('[HomePage] Error details:', {
          name: err.name,
          message: err.message,
          stack: err.stack
        });
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
            isImage={
              carouselImages[0]?.startsWith('data:') ||
              carouselImages[0]?.startsWith('http') ||
              carouselImages[0]?.startsWith('/')
            }
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
            }
          ]}
        />
      </section>
    </div>
  );
}

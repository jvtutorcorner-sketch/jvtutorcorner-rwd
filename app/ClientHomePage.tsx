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
import { useT } from '@/components/IntlProvider'; // Client-side hook

export default function ClientHomePage({ initialCarouselImages }: { initialCarouselImages: string[] }) {
  const t = useT();
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  
  // Use initial images if provided, otherwise fallback to defaults (after hydration)
  const [carouselImages, setCarouselImages] = useState<string[]>(
    initialCarouselImages.length > 0 
      ? initialCarouselImages 
      : [] // Will likely be updated by useEffect or default if empty
  );

  useEffect(() => {
    const u = getStoredUser();
    setUser(u);

    // If no initial images were passed (e.g. DB error), fallback to text slides
    if (initialCarouselImages.length === 0) {
      setCarouselImages([
        t('carousel_slide1'),
        t('carousel_slide2'),
        t('carousel_slide3'),
      ]);
    }
  }, [initialCarouselImages, t]);

  const recommendedTeachers = TEACHERS.slice(0, 3);
  const hotCourses = COURSES.slice(0, 3);

  return (
    <div className="home">
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

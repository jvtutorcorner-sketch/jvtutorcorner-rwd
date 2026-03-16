'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Carousel } from '@/components/Carousel';
import { TEACHERS } from '@/data/teachers';
import { COURSES } from '@/data/courses';
import type { Course } from '@/data/courses';
import { TeacherCard } from '@/components/TeacherCard';
import { CourseCard } from '@/components/CourseCard';
import Tabs from '@/components/Tabs';
import { getStoredUser, type StoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider'; // Client-side hook
import OnboardingQuestionnaire from '@/components/OnboardingQuestionnaire';

const GUEST_STORAGE_KEY = 'jv_survey_seeds';
const GUEST_ANSWERS_KEY = 'jv_survey_answers';
const IDLE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

export default function ClientHomePage({
  initialCarouselImages
}: {
  initialCarouselImages: string[];
}) {
  const t = useT();
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [showGuestQuestionnaire, setShowGuestQuestionnaire] = useState(false);
  const [recommendations, setRecommendations] = useState<Course[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use initial images if provided, otherwise fallback to defaults (after hydration)
  const [carouselImages, setCarouselImages] = useState<string[]>(
    initialCarouselImages.length > 0
      ? initialCarouselImages
      : [] // Will likely be updated by useEffect or default if empty
  );

  // ── Load user, fetch recommendations, setup idle detection ──────────────────
  useEffect(() => {
    const u = getStoredUser();
    setUser(u);

    if (initialCarouselImages.length === 0) {
      setCarouselImages([
        t('carousel_slide1'),
        t('carousel_slide2'),
        t('carousel_slide3'),
      ]);
    }

    // Fetch personalised recommendations
    fetchRecommendations(u?.id);

    // ── Guest idle detection (3 min) ──────────────────────────────────────────
    if (!u) {
      // Check if guest already completed a survey
      try {
        const existingSeeds = localStorage.getItem(GUEST_STORAGE_KEY);
        if (existingSeeds) return; // already surveyed, skip idle trigger
      } catch { /* ignore */ }

      const resetIdleTimer = () => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
          setShowGuestQuestionnaire(true);
        }, IDLE_THRESHOLD_MS);
      };

      const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
      events.forEach((e) => window.addEventListener(e, resetIdleTimer, { passive: true }));
      resetIdleTimer(); // start immediately

      const handleTestTrigger = () => setShowGuestQuestionnaire(true);
      window.addEventListener('__test_trigger_idle_questionnaire', handleTestTrigger);

      return () => {
        events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
        window.removeEventListener('__test_trigger_idle_questionnaire', handleTestTrigger);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      };
    }
  }, [initialCarouselImages, t, router]);

  async function fetchRecommendations(userId?: string) {
    setRecsLoading(true);
    try {
      let url = '/api/recommendations';
      const body: Record<string, unknown> = {};

      if (userId) {
        url += `?userId=${encodeURIComponent(userId)}`;
      } else {
        // Pass guest seeds from localStorage if available
        try {
          const raw = localStorage.getItem(GUEST_STORAGE_KEY);
          if (raw) body.guestSeeds = JSON.parse(raw);
        } catch { /* ignore */ }
      }

      const res = userId
        ? await fetch(url)
        : await fetch('/api/recommendations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

      if (res.ok) {
        const data = await res.json();
        setRecommendations(data.recommendations ?? []);
      }
    } catch (err) {
      // Non-fatal – fallback to static courses
      console.warn('[HomePage] recommendations fetch failed:', err);
    } finally {
      setRecsLoading(false);
    }
  }

  const recommendedTeachers = TEACHERS.slice(0, 3);
  const hotCourses = COURSES.slice(0, 3);
  // Use personalised recs if available, fall back to static courses
  const displayRecs: Course[] = recommendations.length > 0 ? (recommendations as unknown as Course[]) : COURSES.slice(0, 3);

  return (
    <div className="home">
      {/* Guest idle questionnaire – bottom drawer */}
      {showGuestQuestionnaire && (
        <OnboardingQuestionnaire
          mode="lite"
          onComplete={(_answers, _affinity) => {
            setShowGuestQuestionnaire(false);
            // Refresh recommendations with newly saved seeds
            fetchRecommendations(undefined);
          }}
          onSkip={() => setShowGuestQuestionnaire(false)}
        />
      )}
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
        {/* ── Personalised Recommendation Strip ─────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 className="section-title">
              {user ? `${user.firstName || user.email?.split('@')[0] || '你'} 的專屬推薦` : '為你精選的課程'}
            </h2>
            {!user && (
              <Link
                href="/login/register"
                style={{ fontSize: 13, color: '#6366f1', textDecoration: 'underline' }}
              >
                建立帳號獲得更精準推薦 →
              </Link>
            )}
          </div>
          {recsLoading ? (
            <div style={{ color: '#9ca3af', fontSize: 14, padding: '12px 0' }}>
              正在計算您的專屬推薦…
            </div>
          ) : (
            <div className="card-grid">
              {displayRecs.slice(0, 3).map((course) => (
                <CourseCard key={course.id} course={course as Course} />
              ))}
            </div>
          )}
        </div>

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

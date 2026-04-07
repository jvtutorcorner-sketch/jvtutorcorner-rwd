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
import HowItWorks from '@/components/HowItWorks';
import MedicineIdentificationFlow from '@/components/MedicineIdentificationFlow';

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
  const [showUserQuestionnaire, setShowUserQuestionnaire] = useState(false);
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

    // Check if user just registered to show onboarding questionnaire
    if (u && localStorage.getItem('jv_just_registered') === 'true') {
      localStorage.removeItem('jv_just_registered');
      setShowUserQuestionnaire(true);
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
      {/* User questionnaire - modal like */}
      {showUserQuestionnaire && user && (
        <OnboardingQuestionnaire
          mode="full"
          userId={user.id || user.roid_id}
          onComplete={(_answers, _affinity) => {
            setShowUserQuestionnaire(false);
            fetchRecommendations(user.id || user.roid_id);
          }}
          onSkip={() => setShowUserQuestionnaire(false)}
        />
      )}

      {/* Premium Hero Section with Deep Background */}
      <section className="home-hero-premium">
        <div className="hero-premium-container">
          <div className="hero-premium-content">
            <div className="hero-premium-text">
              <h1 className="hero-premium-title">
                {user 
                  ? `歡迎回來！${user.firstName || user.email?.split('@')[0] || '學習者'}` 
                  : '發現您的下一堂課程'}
              </h1>
              <p className="hero-premium-subtitle">
                {user
                  ? '繼續您的學習之旅，探索精選課程和優秀教師'
                  : '與全世界最好的教師一起學習。我們提供個性化的課程推薦和高質量的教育內容。'}
              </p>
              <div className="hero-premium-cta">
                {user ? (
                  <>
                    <Link href="/courses" className="btn-primary">
                      瀏覽課程
                    </Link>
                    <button 
                      className="btn-secondary"
                      onClick={() => setShowUserQuestionnaire(true)}
                    >
                      更新偏好
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login/register" className="btn-primary">
                      開始學習
                    </Link>
                    <Link href="/courses" className="btn-secondary">
                      瀏覽課程
                    </Link>
                  </>
                )}
              </div>
            </div>
            <div className="hero-premium-carousel">
              <Carousel
                slides={carouselImages}
                isImage={
                  carouselImages[0]?.startsWith('data:') ||
                  carouselImages[0]?.startsWith('http') ||
                  carouselImages[0]?.startsWith('/')
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Section */}
      <section className="home-main-content">
        {/* ── Personalised Recommendation Strip ─────────────────────────── */}
        <div className="recommendation-section" id="tour-recommendation">
          <div className="section-header-enhanced">
            <div>
              <h2 className="section-title-large">
                {user ? `${user.firstName || user.email?.split('@')[0] || '您'} 的專屬推薦` : '為您精選的課程'}
              </h2>
              <p className="section-subtitle">根據您的學習風格精心挑選</p>
            </div>
            {!user ? (
              <Link
                href="/login/register"
                className="section-link-cta"
              >
                建立帳號獲得更精準推薦 →
              </Link>
            ) : (
               <button
                 className="section-link-cta"
                 onClick={() => setShowUserQuestionnaire(true)}
                 id="tour-questionnaire-btn"
               >
                 填寫 / 更新學習偏好 →
               </button>
            )}
          </div>
          {recsLoading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>正在計算您的專屬推薦…</p>
            </div>
          ) : (
            <div className="card-grid">
              {displayRecs.slice(0, 3).map((course) => (
                <CourseCard key={course.id} course={course as Course} />
              ))}
            </div>
          )}
        </div>

        {/* Featured Sections */}
        <div className="featured-sections" id="tour-tabs">
          <Tabs
            items={[
            {
              key: 'teachers',
              title: t('recommended_teachers'),
              content: (
                <div className="tab-content">
                  <div className="section-header-enhanced">
                    <div>
                      <h2 className="section-title-large">{t('recommended_teachers')}</h2>
                      <p className="section-subtitle">發現優秀的教育工作者</p>
                    </div>
                    <Link href="/teachers" className="section-link-cta">{t('see_all_teachers')} →</Link>
                  </div>
                  <div className="card-grid">
                    {recommendedTeachers.map((teacher) => (
                      <TeacherCard key={teacher.id} teacher={teacher} />
                    ))}
                  </div>
                </div>
              )
            },
            {
              key: 'courses',
              title: t('popular_courses'),
              content: (
                <div className="tab-content">
                  <div className="section-header-enhanced">
                    <div>
                      <h2 className="section-title-large">{t('popular_courses')}</h2>
                      <p className="section-subtitle">最受歡迎的課程</p>
                    </div>
                    <Link href="/courses" className="section-link-cta">{t('see_all_courses')} →</Link>
                  </div>
                  <div className="card-grid">
                    {hotCourses.map((course) => (
                      <CourseCard key={course.id} course={course} />
                    ))}
                  </div>
                </div>
              )
            }
          ]}
        />
        </div>

        {/* About Platform Section */}
        <section className="about-platform-section">
          <div className="about-platform-content">
            <div className="about-platform-text">
              <h2 className="section-title-large">關於我們的平台</h2>
              <p>
                我們致力於提供全球最優質的在線教育體驗。透過連接學生和教師，
                我們創造了一個充滿機遇和成長的社區。
              </p>
              <p>
                無論您是初學者還是專業人士，我們都有適合您的課程。
                探索 <strong>1000+</strong> 門課程，從編程到藝術，應有盡有。
              </p>
              <div className="about-stats">
                <div className="stat-item">
                  <span className="stat-number">50K+</span>
                  <span className="stat-label">活躍學生</span>
                </div>
                <div className="stat-item">
                  <span className="stat-number">500+</span>
                  <span className="stat-label">優秀教師</span>
                </div>
                <div className="stat-item">
                  <span className="stat-number">1000+</span>
                  <span className="stat-label">精選課程</span>
                </div>
              </div>
            </div>
            <div className="about-platform-cta">
              <Link href="/about" className="btn-primary-large">
                了解更多
              </Link>
            </div>
          </div>
        </section>

        {/* Contact / Newsletter Section */}
        <section className="contact-section">
          <div className="contact-container">
            <div className="contact-header">
              <h2 className="section-title-large">保持聯繫</h2>
              <p>訂閱我們的通訊，獲取最新課程和優惠</p>
            </div>
            <form className="contact-form" onSubmit={(e) => {
              e.preventDefault();
              alert('感謝您的訂閱！');
            }}>
              <div className="form-group">
                <input 
                  type="email" 
                  placeholder="請輸入您的電子郵件" 
                  required 
                  className="form-input"
                />
              </div>
              <button type="submit" className="btn-primary">
                訂閱
              </button>
            </form>
          </div>
        </section>
      </section>

      {/* How It Works - Hidden per user request */}
      {/* <HowItWorks /> */}

      {/* Medicine Identification Flow - Hidden per user request */}
      {/* <MedicineIdentificationFlow /> */}
    </div>
  );
}

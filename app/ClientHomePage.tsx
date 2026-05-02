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
import { useT, useIntl } from '@/components/IntlProvider'; // Client-side hook
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
  const { ready } = useIntl();
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

  // 等待翻译准备好，避免闪烁
  if (!ready) {
    return <div className="home" style={{ minHeight: '100vh' }} />;
  }

  return (
    <div className="home">
      {/* Guest idle questionnaire – bottom drawer */}
      {showGuestQuestionnaire && (
        <OnboardingQuestionnaire
          mode="lite"
          onComplete={(_answers, _affinity) => {
            setShowGuestQuestionnaire(false);
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

      {/* Hero Section */}
      <section className="home-hero-premium">
        <div className="hero-premium-container container">
          <div className="hero-premium-content">
            <div className="hero-premium-text">
              <h1 className="hero-premium-title">
                {user 
                  ? `${t('hero_premium_title_user')}！${user.firstName || user.email?.split('@')[0] || '學習者'}` 
                  : t('hero_premium_title_guest')}
              </h1>
              <p className="hero-premium-subtitle">
                {user
                  ? t('hero_premium_subtitle_user')
                  : t('hero_premium_subtitle_guest')}
              </p>
              <div className="hero-premium-cta">
                {user ? (
                  <>
                    <Link href="/courses" className="btn-primary">
                      瀏覽所有課程
                    </Link>
                    <button 
                      className="btn-secondary"
                      onClick={() => setShowUserQuestionnaire(true)}
                    >
                      更新學習偏好
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login/register" className="btn-primary">
                      免費開始使用
                    </Link>
                    <Link href="/courses" className="btn-secondary">
                      探索熱門課程
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

      {/* Categories Section - Hidden per user request */}
      {/*
      <section className="section-white">
        <div className="container">
          <div className="section-header-enhanced text-center" style={{ marginBottom: 40, textAlign: 'center' }}>
            <h2 className="section-title-large" style={{ fontSize: '2.5rem' }}>探索熱門領域</h2>
            <p className="section-subtitle">找到最適合您的課程類別</p>
          </div>
          <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {[
              { name: '語言學習', icon: '🌍', color: '#e0f2fe' },
              { name: '升學考試', icon: '📝', color: '#fef3c7' },
              { name: '程式開發', icon: '💻', color: '#dcfce7' },
              { name: '藝術設計', icon: '🎨', color: '#fce7f3' },
              { name: '音樂造詣', icon: '🎵', color: '#f3e8ff' },
              { name: '職場技能', icon: '💼', color: '#ffedd5' },
            ].map((cat) => (
              <div key={cat.name} className="category-card" style={{ 
                background: cat.color, 
                padding: '30px', 
                borderRadius: '16px', 
                textAlign: 'center',
                transition: 'transform 0.3s ease',
                cursor: 'pointer'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>{cat.icon}</div>
                <div style={{ fontWeight: '700', fontSize: '1.1rem' }}>{cat.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      */}

      {/* Recommendations Section */}
      <section className="section-personalized" id="tour-recommendation">
        <div className="container">
          <div className="section-header-enhanced">
            <div>
              <h2 className="section-title-large">
                {user ? `${user.firstName || user.email?.split('@')[0] || '您'} 的專屬推薦` : '為您精選的課程'}
              </h2>
              <p className="section-subtitle">基於您的興趣和學習進度</p>
            </div>
            {!user ? (
              <Link href="/login/register" className="section-link-cta">
                建立帳號，獲得個性化推薦 →
              </Link>
            ) : (
               <button className="section-link-cta" onClick={() => setShowUserQuestionnaire(true)} id="tour-questionnaire-btn">
                 更新您的學習偏好 →
               </button>
            )}
          </div>
          {recsLoading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>正在為您挑選最佳課程…</p>
            </div>
          ) : (
            <div className="card-grid">
              {displayRecs.slice(0, 3).map((course) => (
                <CourseCard key={course.id} course={course as Course} className="card-personalized" />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Featured Teachers */}
      <section className="section-teachers">
        <div className="container">
          <div className="section-header-enhanced">
            <div>
              <h2 className="section-title-large">熱門教師</h2>
              <p className="section-subtitle">來自各領域的頂尖教育專家</p>
            </div>
            <Link href="/teachers" className="section-link-cta">查看所有教師 →</Link>
          </div>
          <div className="card-grid">
            {recommendedTeachers.map((teacher) => (
              <TeacherCard key={teacher.id} teacher={teacher} />
            ))}
          </div>
        </div>
      </section>

      {/* Statistics Section - Hidden per user request */}
      {/*
      <section className="section-dark">
        <div className="container">
          <div className="about-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '40px', textAlign: 'center' }}>
            <div className="stat-item">
              <span className="stat-number" style={{ fontSize: '3rem', fontWeight: '800', color: '#3b82f6', display: 'block' }}>50K+</span>
              <span className="stat-label" style={{ fontSize: '1.2rem', color: '#94a3b8' }}>活躍學員</span>
            </div>
            <div className="stat-item">
              <span className="stat-number" style={{ fontSize: '3rem', fontWeight: '800', color: '#3b82f6', display: 'block' }}>500+</span>
              <span className="stat-label" style={{ fontSize: '1.2rem', color: '#94a3b8' }}>專業導師</span>
            </div>
            <div className="stat-item">
              <span className="stat-number" style={{ fontSize: '3rem', fontWeight: '800', color: '#3b82f6', display: 'block' }}>1000+</span>
              <span className="stat-label" style={{ fontSize: '1.2rem', color: '#94a3b8' }}>精選課程</span>
            </div>
            <div className="stat-item">
              <span className="stat-number" style={{ fontSize: '3rem', fontWeight: '800', color: '#3b82f6', display: 'block' }}>98%</span>
              <span className="stat-label" style={{ fontSize: '1.2rem', color: '#94a3b8' }}>學員滿意度</span>
            </div>
          </div>
        </div>
      </section>
      */}

      {/* How it Works */}
      <section className="section-white">
        <div className="container">
          <div className="section-header-enhanced text-center" style={{ textAlign: 'center', marginBottom: '60px' }}>
            <h2 className="section-title-large">{t('how_it_works_title')}</h2>
            <p className="section-subtitle">{t('how_it_works_subtitle')}</p>
          </div>
          <div className="how-it-works-grid">
            {[
              { step: '01', titleKey: 'how_it_works_step1_title', descKey: 'how_it_works_step1_desc', icon: '🔍' },
              { step: '02', titleKey: 'how_it_works_step2_title', descKey: 'how_it_works_step2_desc', icon: '📅' },
              { step: '03', titleKey: 'how_it_works_step3_title', descKey: 'how_it_works_step3_desc', icon: '🎓' },
            ].map((step) => (
              <div key={step.step} className="how-it-works-card" style={{ padding: '40px', textAlign: 'center' }}>
                <div className="how-it-works-number" style={{ marginBottom: '20px' }}>{step.step}</div>
                <h3 style={{ fontSize: '1.5rem', marginBottom: '15px' }}>{t(step.titleKey)}</h3>
                <p style={{ color: '#4b5563' }}>{t(step.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="section-accent">
        <div className="container">
          <div className="contact-container text-center" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: '2.5rem', color: 'white', marginBottom: '16px' }}>訂閱最新消息</h2>
            <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '32px' }}>第一時間獲得專屬優惠和新課程通知</p>
            <form className="contact-form" style={{ display: 'flex', gap: '12px' }} onSubmit={(e) => {
              e.preventDefault();
              alert('感謝您的訂閱！');
            }}>
              <input 
                type="email" 
                placeholder="輸入您的電子郵件地址" 
                required 
                className="form-input"
                style={{ flex: 1, padding: '14px 20px', borderRadius: '10px' }}
              />
              <button type="submit" className="btn-primary" style={{ background: 'white', color: '#4f46e5', boxShadow: 'none' }}>
                立即訂閱
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}

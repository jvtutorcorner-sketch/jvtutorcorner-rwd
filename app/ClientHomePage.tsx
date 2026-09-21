'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { TeacherCard } from '@/components/TeacherCard';
import { CourseCard } from '@/components/CourseCard';
import { getStoredUser, type StoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';
import { subjectKey } from '@/lib/subjectI18n';
import OnboardingQuestionnaire from '@/components/OnboardingQuestionnaire';
import ClassroomMock from '@/components/home/ClassroomMock';
import Reveal from '@/components/home/Reveal';
import { Carousel } from '@/components/Carousel';

const GUEST_STORAGE_KEY = 'jv_survey_seeds';
const IDLE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
const ONBOARDING_ENABLED = process.env.NEXT_PUBLIC_ENABLE_ONBOARDING_QUESTIONNAIRE === 'true';

/** DynamoDB / bundled 課程與老師都是純物件，這裡以寬鬆型別接收 server 傳來的資料。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CourseLike = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TeacherLike = Record<string, any>;

interface ClientHomePageProps {
  courses: CourseLike[];
  teachers: TeacherLike[];
  categories: Array<{ subject: string; count: number }>;
  coursesHeading: 'popular' | 'latest';
  /** 後台 /carousel 上傳的 Hero 輪播圖網址；空陣列時 Hero 改用純 CSS 的 ClassroomMock。 */
  initialCarouselImages?: string[];
  /** 後台 /admin/settings 控制的開關；關閉時不渲染個人化推薦區塊、也不打 /api/recommendations。 */
  showRecommendations?: boolean;
}

export default function ClientHomePage({
  courses,
  teachers,
  categories,
  coursesHeading,
  initialCarouselImages = [],
  showRecommendations = true,
}: ClientHomePageProps) {
  const t = useT();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [showGuestQuestionnaire, setShowGuestQuestionnaire] = useState(false);
  const [showUserQuestionnaire, setShowUserQuestionnaire] = useState(false);
  const [recommendations, setRecommendations] = useState<CourseLike[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [carouselImages, setCarouselImages] = useState<string[]>(initialCarouselImages);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 首頁是 ISR（且 Amplify 上的背景重生並不可靠），SSR 拿到的輪播圖可能是舊快照。
  // 掛載後再跟 /api/carousel（force-dynamic）對一次，後台改動才會即時反映。
  // SSR 那份仍當初始值，所以沒有變動時不會有閃爍。
  useEffect(() => {
    let cancelled = false;
    fetch('/api/carousel')
      .then((res) => (res.ok ? res.json() : null))
      .then((items) => {
        if (cancelled || !Array.isArray(items)) return;
        const urls = [...items]
          .sort((a, b) => (a?.order || 0) - (b?.order || 0))
          .map((it) => it?.url)
          .filter((url): url is string => typeof url === 'string' && url.length > 0);
        setCarouselImages(urls);
      })
      .catch(() => {
        /* 抓不到就沿用 SSR 的清單 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load user, fetch recommendations, setup idle detection ──────────────────
  useEffect(() => {
    const u = getStoredUser();
    setUser(u);

    // Show onboarding questionnaire right after registration
    if (ONBOARDING_ENABLED && u && localStorage.getItem('jv_just_registered') === 'true') {
      localStorage.removeItem('jv_just_registered');
      setShowUserQuestionnaire(true);
    }

    if (showRecommendations) fetchRecommendations(u?.id);

    // ── Guest idle detection (3 min) ──────────────────────────────────────────
    if (ONBOARDING_ENABLED && !u) {
      try {
        const existingSeeds = localStorage.getItem(GUEST_STORAGE_KEY);
        if (existingSeeds) return; // already surveyed, skip idle trigger
      } catch { /* ignore */ }

      const resetIdleTimer = () => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => setShowGuestQuestionnaire(true), IDLE_THRESHOLD_MS);
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
  }, []);

  async function fetchRecommendations(userId?: string) {
    setRecsLoading(true);
    try {
      const body: Record<string, unknown> = {};
      if (!userId) {
        try {
          const raw = localStorage.getItem(GUEST_STORAGE_KEY);
          if (raw) body.guestSeeds = JSON.parse(raw);
        } catch { /* ignore */ }
      }

      const res = userId
        ? await fetch(`/api/recommendations?userId=${encodeURIComponent(userId)}`)
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
      console.warn('[HomePage] recommendations fetch failed:', err);
    } finally {
      setRecsLoading(false);
    }
  }

  const userName = user?.firstName || user?.email?.split('@')[0] || t('guest_learner_fallback');
  // 個人化推薦：有 API 結果用它，否則退回真實課程前三筆
  const displayRecs: CourseLike[] =
    recommendations.length > 0 ? recommendations : courses.slice(0, 3);

  const FEATURES = [
    { icon: '🎓', titleKey: 'feature_pro_teachers_title', descKey: 'feature_pro_teachers_desc' },
    { icon: '💬', titleKey: 'feature_realtime_title', descKey: 'feature_realtime_desc' },
    { icon: '📚', titleKey: 'feature_diverse_title', descKey: 'feature_diverse_desc' },
    { icon: '🕐', titleKey: 'feature_anytime_title', descKey: 'feature_anytime_desc' },
  ];

  const EXPERIENCE_POINTS = [
    { icon: '🎥', titleKey: 'exp_video_title', descKey: 'exp_video_desc' },
    { icon: '🖌️', titleKey: 'exp_whiteboard_title', descKey: 'exp_whiteboard_desc' },
    { icon: '📄', titleKey: 'exp_materials_title', descKey: 'exp_materials_desc' },
    { icon: '⚡', titleKey: 'exp_live_title', descKey: 'exp_live_desc' },
  ];

  const HOW_IT_WORKS = [
    { step: '01', titleKey: 'how_it_works_step1_title', descKey: 'how_it_works_step1_desc' },
    { step: '02', titleKey: 'how_it_works_step2_title', descKey: 'how_it_works_step2_desc' },
    { step: '03', titleKey: 'how_it_works_step3_title', descKey: 'how_it_works_step3_desc' },
  ];

  return (
    <div className="home">
      {/* Guest idle questionnaire – bottom drawer */}
      {showGuestQuestionnaire && (
        <OnboardingQuestionnaire
          mode="lite"
          onComplete={() => {
            setShowGuestQuestionnaire(false);
            if (showRecommendations) fetchRecommendations(undefined);
          }}
          onSkip={() => setShowGuestQuestionnaire(false)}
        />
      )}
      {/* User questionnaire */}
      {showUserQuestionnaire && user && (
        <OnboardingQuestionnaire
          mode="full"
          userId={user.id || user.roid_id}
          onComplete={() => {
            setShowUserQuestionnaire(false);
            if (showRecommendations) fetchRecommendations(user.id || user.roid_id);
          }}
          onSkip={() => setShowUserQuestionnaire(false)}
        />
      )}

      {/* ── 1. Hero ─────────────────────────────────────────────── */}
      <section className="home-hero-premium">
        <div className="hero-premium-container">
          <div className="hero-premium-content">
            <div className="hero-premium-text">
              <h1 className="hero-premium-title">
                {user ? t('hero_title_user').replace('{name}', userName) : t('hero_title_guest')}
              </h1>
              <p className="hero-premium-subtitle">
                {user ? t('hero_subtitle_user') : t('hero_subtitle_guest')}
              </p>
              <div className="hero-premium-cta">
                {user ? (
                  <>
                    <Link href="/courses" className="btn-primary">{t('hero_cta_explore')}</Link>
                    <button className="btn-secondary" onClick={() => setShowUserQuestionnaire(true)}>
                      {t('update_learning_preferences')}
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/courses" className="btn-primary">{t('hero_cta_explore')}</Link>
                    <Link href="/login/register?role=teacher" className="btn-secondary">
                      {t('hero_cta_become_teacher')}
                    </Link>
                  </>
                )}
              </div>
              <ul className="hero-highlights" aria-hidden="true">
                <li>{t('hero_highlight_1')}</li>
                <li>{t('hero_highlight_2')}</li>
                <li>{t('hero_highlight_3')}</li>
              </ul>
            </div>
            {carouselImages.length > 0 ? (
              <div className="hero-premium-carousel">
                <Carousel slides={carouselImages} isImage />
              </div>
            ) : (
              <div className="hero-premium-visual">
                <ClassroomMock liveLabel={t('classroom_live_label')} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── 2. Search ───────────────────────────────────────────── */}
      <section className="section-white home-search-section">
        <div className="section-container">
          <Reveal className="home-search-inner">
            <h2 className="section-title-large">{t('home_search_title')}</h2>
            <form className="home-search-form" action="/courses" method="get" role="search">
              <input
                type="search"
                name="q"
                className="home-search-input"
                placeholder={t('home_search_placeholder')}
                aria-label={t('home_search_placeholder')}
              />
              <button type="submit" className="btn-primary home-search-btn">{t('home_search_button')}</button>
            </form>
            {categories.length > 0 && (
              <div className="home-categories">
                <span className="home-categories-label">{t('home_categories_label')}</span>
                <div className="home-categories-chips">
                  {categories.map((cat) => (
                    <Link
                      key={cat.subject}
                      href={`/courses?subject=${encodeURIComponent(cat.subject)}`}
                      className="home-category-chip"
                    >
                      {t(subjectKey(cat.subject))}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {/* ── 3. Hot / latest courses ─────────────────────────────── */}
      <section className="section-personalized">
        <div className="section-container">
          <div className="section-header-enhanced">
            <div>
              <h2 className="section-title-large">
                {coursesHeading === 'popular' ? t('home_hot_courses_title') : t('home_latest_courses_title')}
              </h2>
              <p className="section-subtitle">{t('home_hot_courses_subtitle')}</p>
            </div>
            <Link href="/courses" className="section-link-cta">{t('view_all_courses_arrow')}</Link>
          </div>
          {courses.length > 0 ? (
            <div className="card-grid card-grid--scroll">
              {courses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          ) : (
            <p className="home-empty">{t('home_courses_empty')}</p>
          )}
        </div>
      </section>

      {/* ── 4. Personalised recommendations (keep #tour-recommendation); admin-controlled via /admin/settings ─── */}
      {showRecommendations && (
        <section className="section-light" id="tour-recommendation">
          <div className="section-container">
            <div className="section-header-enhanced">
              <div>
                <h2 className="section-title-large">
                  {user
                    ? `${userName}${t('personalized_recommendations_user_suffix')}`
                    : t('personalized_recommendations_guest')}
                </h2>
                <p className="section-subtitle">{t('recommendations_subtitle')}</p>
              </div>
              {!user ? (
                <Link href="/login/register" className="section-link-cta">
                  {t('create_account_for_recommendations')}
                </Link>
              ) : (
                <button className="section-link-cta" onClick={() => setShowUserQuestionnaire(true)} id="tour-questionnaire-btn">
                  {t('update_learning_preferences_arrow')}
                </button>
              )}
            </div>
            {recsLoading ? (
              <div className="loading-state">
                <div className="loading-spinner"></div>
                <p>{t('loading_recommendations')}</p>
              </div>
            ) : displayRecs.length > 0 ? (
              <div className="card-grid card-grid--scroll">
                {displayRecs.slice(0, 3).map((course) => (
                  <CourseCard key={course.id} course={course} className="card-personalized" />
                ))}
              </div>
            ) : (
              <p className="home-empty">{t('home_courses_empty')}</p>
            )}
          </div>
        </section>
      )}

      {/* ── 5. Featured teachers ────────────────────────────────── */}
      {teachers.length > 0 && (
        <section className="section-teachers">
          <div className="section-container">
            <div className="section-header-enhanced">
              <div>
                <h2 className="section-title-large">{t('popular_teachers')}</h2>
                <p className="section-subtitle">{t('popular_teachers_subtitle')}</p>
              </div>
              <Link href="/teachers" className="section-link-cta">{t('view_all_teachers_arrow')}</Link>
            </div>
            <div className="card-grid card-grid--scroll">
              {teachers.map((teacher) => (
                <TeacherCard key={teacher.id || teacher.roid_id} teacher={teacher} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 6. Platform features ────────────────────────────────── */}
      <section className="section-white">
        <div className="section-container">
          <div className="section-header-enhanced text-center home-section-center">
            <h2 className="section-title-large">{t('home_features_title')}</h2>
          </div>
          <div className="home-features-grid">
            {FEATURES.map((f, i) => (
              <Reveal as="div" key={f.titleKey} delay={i * 80} className="home-feature-card">
                <div className="home-feature-icon" aria-hidden="true">{f.icon}</div>
                <h3 className="home-feature-title">{t(f.titleKey)}</h3>
                <p className="home-feature-desc">{t(f.descKey)}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. Teaching experience ──────────────────────────────── */}
      <section className="section-dark home-experience">
        <div className="section-container">
          <div className="home-experience-grid">
            <Reveal className="home-experience-visual">
              <ClassroomMock size="lg" liveLabel={t('classroom_live_label')} />
            </Reveal>
            <div className="home-experience-text">
              <h2 className="section-title-large">{t('home_experience_title')}</h2>
              <p className="section-subtitle">{t('home_experience_subtitle')}</p>
              <ul className="home-experience-list">
                {EXPERIENCE_POINTS.map((p) => (
                  <li key={p.titleKey}>
                    <span className="home-experience-icon" aria-hidden="true">{p.icon}</span>
                    <div>
                      <h3 className="home-experience-item-title">{t(p.titleKey)}</h3>
                      <p className="home-experience-item-desc">{t(p.descKey)}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link href="/courses" className="btn-primary">{t('hero_cta_explore')}</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. How it works (keep .how-it-works-grid × 3) ───────── */}
      <section className="section-white" id="how-it-works">
        <div className="section-container">
          <div className="section-header-enhanced text-center home-section-center">
            <h2 className="section-title-large">{t('how_it_works_title')}</h2>
            <p className="section-subtitle">{t('how_it_works_subtitle')}</p>
          </div>
          <div className="how-it-works-grid">
            {HOW_IT_WORKS.map((step, i) => (
              <Reveal as="div" key={step.step} delay={i * 80} className="how-it-works-card">
                <div className="how-it-works-number">{step.step}</div>
                <h3>{t(step.titleKey)}</h3>
                <p>{t(step.descKey)}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 9. Become a teacher ─────────────────────────────────── */}
      <section className="section-accent home-become-teacher">
        <div className="section-container home-band-inner">
          <div>
            <h2 className="home-band-title">{t('become_teacher_title')}</h2>
            <p className="home-band-subtitle">{t('become_teacher_subtitle')}</p>
          </div>
          <Link href="/login/register?role=teacher" className="btn-primary home-band-btn">
            {t('become_teacher_button')}
          </Link>
        </div>
      </section>

      {/* ── 10. Final CTA ───────────────────────────────────────── */}
      <section className="section-personalized home-final-cta">
        <div className="section-container home-final-inner">
          <h2 className="section-title-large">{t('final_cta_title')}</h2>
          <p className="section-subtitle">{t('final_cta_subtitle')}</p>
          <Link href="/courses" className="btn-primary">{t('hero_cta_explore')}</Link>
        </div>
      </section>
    </div>
  );
}

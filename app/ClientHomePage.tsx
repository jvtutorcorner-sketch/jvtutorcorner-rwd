'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { TeacherCard } from '@/components/TeacherCard';
import { CourseCard } from '@/components/CourseCard';
import { getStoredUser, type StoredUser } from '@/lib/mockAuth';
import { trackRecImpression } from '@/lib/trackingUtils';
import { useT } from '@/components/IntlProvider';
import { subjectKey } from '@/lib/subjectI18n';
import OnboardingQuestionnaire from '@/components/OnboardingQuestionnaire';
import ClassroomMock from '@/components/home/ClassroomMock';
import Reveal from '@/components/home/Reveal';
import DailyPhrases from '@/components/home/DailyPhrases';
import type { DailyPhrasePublic } from '@/lib/dailyPhraseService';
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
  /** 「AI 每日一句」短片；後台開關關閉或沒有已發布影片時是空陣列，區塊整段不渲染。 */
  dailyPhrases?: DailyPhrasePublic[];
}

export default function ClientHomePage({
  courses,
  teachers,
  categories,
  coursesHeading,
  initialCarouselImages = [],
  showRecommendations = true,
  dailyPhrases = [],
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
  // 個人化推薦只顯示「熱門/最新課程」區沒出現過的課程，避免同一頁出現兩次同樣的卡片。
  // 去重後沒有任何一筆就整段不渲染（載入中仍留 spinner，避免版面跳動）。
  const shownCourseIds = new Set(courses.map((c) => c.id));
  const displayRecs: CourseLike[] = recommendations
    .filter((rec) => !shownCourseIds.has(rec.id))
    .slice(0, 3);
  const showRecsSection = showRecommendations && (recsLoading || displayRecs.length > 0);

  // 推薦卡片曝光(CTR 分母)。只記登入者,與點擊追蹤的母體一致;同一組卡片只送一次(StrictMode 會重跑 effect)。
  const recIdsKey = displayRecs.map((c) => String(c.id)).join(',');
  const lastImpressionRef = useRef<string>('');
  useEffect(() => {
    if (!user || !showRecsSection || recsLoading || !recIdsKey) return;
    if (lastImpressionRef.current === recIdsKey) return;
    lastImpressionRef.current = recIdsKey;
    void trackRecImpression(recIdsKey.split(','));
  }, [user, showRecsSection, recsLoading, recIdsKey]);
  // Hero 沒有輪播圖時會改畫 ClassroomMock，教學體驗區就不要再畫第二張。
  const showExperienceVisual = carouselImages.length > 0;

  // 原本獨立的「為什麼選擇我們」區與這裡重複講視訊/白板，已合併成單一清單。
  const EXPERIENCE_POINTS = [
    { icon: '🎥', titleKey: 'exp_video_title', descKey: 'exp_video_desc' },
    { icon: '🖌️', titleKey: 'exp_whiteboard_title', descKey: 'exp_whiteboard_desc' },
    { icon: '📄', titleKey: 'exp_materials_title', descKey: 'exp_materials_desc' },
    { icon: '🎓', titleKey: 'exp_teachers_title', descKey: 'exp_teachers_desc' },
    { icon: '🕐', titleKey: 'exp_anytime_title', descKey: 'exp_anytime_desc' },
  ];

  const FAQ_ITEMS = [1, 2, 3, 4, 5].map((n) => ({ q: `faq_q${n}`, a: `faq_a${n}` }));
  const TEACHER_AI_PHASES = [
    { n: '01', title: 'feat_phase_before_title', desc: 'feat_phase_before_desc' },
    { n: '02', title: 'feat_phase_during_title', desc: 'feat_phase_during_desc' },
    { n: '03', title: 'feat_phase_after_title', desc: 'feat_phase_after_desc' },
  ];
  const featuredDaily = dailyPhrases[0];
  const moreDaily = dailyPhrases.slice(1);

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
      <section className="section-light">
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
                <CourseCard key={course.id} course={course} trackSource="homepage" />
              ))}
            </div>
          ) : (
            <p className="home-empty">{t('home_courses_empty')}</p>
          )}
        </div>
      </section>

      {/* ── 3b. 中段 CTA 橫幅 ───────────────────────────────────── */}
      <section className="home-cta-band">
        <div className="section-container home-cta-band-inner">
          <div>
            <h2 className="home-cta-band-title">{t('home_cta_band_title')}</h2>
            <p className="home-cta-band-subtitle">{t('home_cta_band_subtitle')}</p>
          </div>
          <Link href="/teachers" className="btn-primary">{t('home_cta_band_button')}</Link>
        </div>
      </section>

      {/* ── 4. Personalised recommendations (keep #tour-recommendation); admin-controlled via /admin/settings ─── */}
      {showRecsSection && (
        <section className="section-personalized" id="tour-recommendation">
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
            ) : (
              <div className="card-grid">
                {displayRecs.map((course) => (
                  <CourseCard key={course.id} course={course} className="card-personalized" trackSource="recommendation" />
                ))}
              </div>
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

      {/* ── 5b. 圖文交錯功能區塊：AI 每日一句（後台開關控制）＋ 老師的 AI 教學工具 ── */}
      <section className="section-white home-features">
        <div className="section-container">
          {featuredDaily && (
            <div className="home-feature" id="daily-phrases">
              <Reveal className="home-feature-media">
                <DailyPhrases items={[featuredDaily]} />
              </Reveal>
              <div className="home-feature-text">
                <span className="home-feature-eyebrow">{t('daily_ai_badge')}</span>
                <h2 className="section-title-large">{t('daily_title')}</h2>
                <p className="section-subtitle">{t('daily_subtitle')}</p>
                <p className="home-feature-cta-text">{t('daily_cta_text')}</p>
                <div className="home-feature-actions">
                  <Link href="/courses" className="btn-primary">{t('daily_cta_button')}</Link>
                  <Link href="/daily" className="section-link-cta">{t('daily_view_all_arrow')}</Link>
                </div>
              </div>
              {moreDaily.length > 0 && (
                <div className="home-feature-more">
                  <h3 className="home-feature-more-title">{t('daily_feature_more')}</h3>
                  <DailyPhrases items={moreDaily} />
                </div>
              )}
            </div>
          )}

          <div className="home-feature home-feature--reverse">
            <Reveal className="home-feature-media">
              <ol className="home-phases">
                {TEACHER_AI_PHASES.map((p) => (
                  <li key={p.n} className="home-phase">
                    <span className="home-phase-n" aria-hidden="true">{p.n}</span>
                    <div>
                      <h3 className="home-phase-title">{t(p.title)}</h3>
                      <p className="home-phase-desc">{t(p.desc)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>
            <div className="home-feature-text">
              <h2 className="section-title-large">{t('feat_teacher_ai_title')}</h2>
              <p className="section-subtitle">{t('feat_teacher_ai_desc')}</p>
              <div className="home-feature-actions">
                <Link href="/login/register?role=teacher" className="btn-primary">{t('feat_teacher_ai_cta')}</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Teaching experience（已吸收原「為什麼選擇我們」區） ── */}
      <section className="section-dark home-experience">
        <div className="section-container">
          <div className={`home-experience-grid${showExperienceVisual ? '' : ' home-experience-grid--solo'}`}>
            {showExperienceVisual && (
              <Reveal className="home-experience-visual">
                <ClassroomMock size="lg" liveLabel={t('classroom_live_label')} />
              </Reveal>
            )}
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
              <Link href="/courses" className="btn-primary">{t('home_experience_cta')}</Link>
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

      {/* ── 7b. FAQ ─────────────────────────────────────────────── */}
      <section className="section-light home-faq" id="faq">
        <div className="section-container">
          <div className="section-header-enhanced text-center home-section-center">
            <h2 className="section-title-large">{t('faq_title')}</h2>
            <p className="section-subtitle">{t('faq_subtitle')}</p>
          </div>
          <div className="home-faq-list">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="home-faq-item">
                <summary>{t(item.q)}</summary>
                <p>{t(item.a)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8. 結尾 CTA（原「成為老師」band 與 final CTA 合併） ── */}
      <section className="section-accent home-become-teacher">
        <div className="section-container home-band-inner">
          <div>
            <h2 className="home-band-title">{t('final_cta_title')}</h2>
            <p className="home-band-subtitle">{t('final_cta_subtitle')}</p>
          </div>
          <div className="home-band-actions">
            <Link href="/courses" className="btn-primary home-band-btn">
              {t('final_cta_primary')}
            </Link>
            <Link href="/login/register?role=teacher" className="btn-secondary home-band-btn--ghost">
              {t('become_teacher_button')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

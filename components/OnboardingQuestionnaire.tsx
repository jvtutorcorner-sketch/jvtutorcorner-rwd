'use client';

/**
 * OnboardingQuestionnaire
 *
 * mode="full"  → 4 questions, shown inline after registration or in settings
 * mode="lite"  → 2 questions (Q1 + Q3), shown as bottom drawer for guests idle ≥ 3 min
 *
 * On completion:
 *  - Authenticated users → POST /api/survey/seeds (persisted to DynamoDB)
 *  - Guests              → POST /api/survey/seeds (returns seeds) → saved to localStorage
 *                          as jv_survey_seeds for later merge on registration
 */

import { useState } from 'react';
import type { SurveyAnswer } from '@/lib/surveyTagMap';

interface Props {
  mode?: 'full' | 'lite';
  userId?: string;
  onComplete?: (answers: SurveyAnswer, newFeatureAffinity: boolean) => void;
  onSkip?: () => void;
}

const GUEST_STORAGE_KEY = 'jv_survey_seeds';
const GUEST_ANSWERS_KEY = 'jv_survey_answers';

// ─── Question data ────────────────────────────────────────────────────────────

const Q1_OPTIONS = [
  { key: 'A', emoji: '💬', text: '想開口說英文，但每次卡在第一句' },
  { key: 'B', emoji: '🚀', text: '準備轉職或升職，需要補足實戰技能' },
  { key: 'C', emoji: '📜', text: '想攻下一張重要證照（多益、日檢、會計…）' },
  { key: 'D', emoji: '🌱', text: '剛好有個新興趣，想試試看但不知從何開始' },
];

const Q2_OPTIONS = [
  { key: 'A', text: '每天見縫插針，15–30 分鐘就好' },
  { key: 'B', text: '一週規律排 2–3 次，每次約 1 小時' },
  { key: 'C', text: '週末集中火力，希望密集衝刺' },
  { key: 'D', text: '時間很不固定，想上就上' },
];

const Q3_OPTIONS = [
  { key: 'A', text: '一對一家教式，老師完全配合我的節奏', isProbe: false },
  { key: 'B', text: '有進度表的結構化課程，照著走就好', isProbe: false },
  { key: 'C', text: '讓 AI 幫我找弱點、自動生成練習題 ✨', isProbe: true },
  { key: 'D', text: '小班直播課，可以和其他學員即時互動 🔴', isProbe: true },
];

const Q4_OPTIONS = [
  { key: 'A', text: '完全零基礎，什麼都還沒碰過' },
  { key: 'B', text: '有一點底子，但沒有系統性學過' },
  { key: 'C', text: '有基礎，想精進或突破瓶頸' },
  { key: 'D', text: '已經有一定程度，要找專業課程或考試對策' },
];

// ─── Styles (inline – no extra CSS file needed) ───────────────────────────────

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    zIndex: 1200,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  drawer: {
    width: '100%',
    maxWidth: 560,
    background: '#fff',
    borderRadius: '16px 16px 0 0',
    padding: '28px 24px 32px',
    boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
    animation: 'slideUp 0.3s ease',
  },
  inlineCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '28px 24px',
    maxWidth: 560,
    margin: '0 auto',
  },
  header: {
    marginBottom: 20,
  },
  tagline: {
    fontSize: 20,
    fontWeight: 700,
    color: '#111827',
    margin: '0 0 6px',
  },
  subline: {
    fontSize: 14,
    color: '#6b7280',
    margin: 0,
  },
  question: {
    fontSize: 15,
    fontWeight: 600,
    color: '#374151',
    margin: '20px 0 10px',
  },
  questionSub: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 10,
    marginTop: -6,
  },
  optionGrid: {
    display: 'grid' as const,
    gap: 8,
  },
  optionBtn: (selected: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderRadius: 8,
    border: `1.5px solid ${selected ? '#6366f1' : '#e5e7eb'}`,
    background: selected ? '#eef2ff' : '#fff',
    cursor: 'pointer',
    fontSize: 14,
    color: selected ? '#4338ca' : '#374151',
    fontWeight: selected ? 600 : 400,
    textAlign: 'left' as const,
    transition: 'all 0.15s',
  }),
  probe: {
    fontSize: 11,
    color: '#a78bfa',
    marginLeft: 'auto',
  },
  progress: {
    display: 'flex',
    gap: 4,
    marginBottom: 20,
  },
  progressDot: (active: boolean, done: boolean) => ({
    flex: 1,
    height: 4,
    borderRadius: 2,
    background: done ? '#6366f1' : active ? '#a5b4fc' : '#e5e7eb',
    transition: 'background 0.2s',
  }),
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    gap: 10,
  },
  btnPrimary: {
    padding: '10px 24px',
    borderRadius: 8,
    background: '#6366f1',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    border: 'none',
    cursor: 'pointer',
    flex: 1,
  },
  btnSkip: {
    padding: '10px 16px',
    borderRadius: 8,
    background: 'none',
    color: '#9ca3af',
    fontWeight: 500,
    fontSize: 13,
    border: 'none',
    cursor: 'pointer',
  },
  successMsg: {
    textAlign: 'center' as const,
    padding: '24px 0 8px',
    color: '#4338ca',
    fontWeight: 700,
    fontSize: 16,
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingQuestionnaire({ mode = 'full', userId, onComplete, onSkip }: Props) {
  const totalSteps = mode === 'lite' ? 2 : 4;
  const [step, setStep] = useState(0); // 0-indexed
  const [answers, setAnswers] = useState<SurveyAnswer>({});
  const [q3Selection, setQ3Selection] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const isDrawer = mode === 'lite';

  function selectQ1(key: string) {
    setAnswers((a) => ({ ...a, q1: key }));
  }
  function selectQ2(key: string) {
    setAnswers((a) => ({ ...a, q2: key }));
  }
  function toggleQ3(key: string) {
    setQ3Selection((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 2) return [prev[1], key]; // max 2, drop oldest
      return [...prev, key];
    });
  }
  function selectQ4(key: string) {
    setAnswers((a) => ({ ...a, q4: key }));
  }

  const currentStepKey = mode === 'lite' ? (step === 0 ? 'q1' : 'q3') : ['q1', 'q2', 'q3', 'q4'][step];

  const canAdvance = (() => {
    if (currentStepKey === 'q1') return !!answers.q1;
    if (currentStepKey === 'q2') return !!answers.q2;
    if (currentStepKey === 'q3') return q3Selection.length > 0;
    if (currentStepKey === 'q4') return !!answers.q4;
    return false;
  })();

  async function handleNext() {
    if (!canAdvance) return;
    if (currentStepKey === 'q3') {
      setAnswers((a) => ({ ...a, q3: q3Selection }));
    }

    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
      return;
    }

    // Final step – submit
    const finalAnswers: SurveyAnswer = { ...answers, q3: q3Selection };
    setSubmitting(true);
    try {
      const res = await fetch('/api/survey/seeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, answers: finalAnswers }),
      });
      const data = await res.json();

      if (!userId && data.seeds) {
        // Guest: persist seeds and answers to localStorage
        try {
          localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(data.seeds));
          localStorage.setItem(GUEST_ANSWERS_KEY, JSON.stringify(finalAnswers));
        } catch {
          // localStorage may be unavailable (private mode)
        }
      }

      setDone(true);
      // Provide a small delay so the success message is visible to users and tests
      setTimeout(() => {
        onComplete?.(finalAnswers, data.newFeatureAffinity ?? false);
      }, 1000);
    } catch (err) {
      console.error('[OnboardingQuestionnaire] submit error:', err);
      setDone(true);
      setTimeout(() => {
        onComplete?.(finalAnswers, false);
      }, 1000);
    } finally {
      setSubmitting(false);
    }
  }

  const containerStyle = isDrawer ? styles.drawer : styles.inlineCard;
  const wrapper = isDrawer ? (
    <div style={styles.overlay}>
      <div style={containerStyle}>{renderBody()}</div>
    </div>
  ) : (
    <div style={containerStyle}>{renderBody()}</div>
  );

  return wrapper;

  function renderBody() {
    if (done) {
      return (
        <div style={styles.successMsg}>
          🎉 設定完成！正在為你整理專屬推薦課程…
        </div>
      );
    }

    return (
      <>
        {/* Progress bar */}
        <div style={styles.progress}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} style={styles.progressDot(i === step, i < step)} />
          ))}
        </div>

        <div style={styles.header}>
          {step === 0 && (
            <>
              <p style={styles.tagline}>讓我們幫你找到最適合你的課程 ✦</p>
              <p style={styles.subline}>只需 {mode === 'lite' ? '15 秒' : '30 秒'}，首頁就是你的專屬課程清單。</p>
            </>
          )}
        </div>

        {currentStepKey === 'q1' && (
          <>
            <p style={styles.question}>你目前最想突破的，是哪個困境？</p>
            <p style={styles.questionSub}>選最符合現在心情的那一個</p>
            <div style={styles.optionGrid}>
              {Q1_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  style={styles.optionBtn(answers.q1 === opt.key)}
                  onClick={() => selectQ1(opt.key)}
                  type="button"
                >
                  <span>{opt.emoji}</span>
                  <span>{opt.text}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {currentStepKey === 'q2' && (
          <>
            <p style={styles.question}>你通常怎麼安排學習時間？</p>
            <p style={styles.questionSub}>這幫我們推薦適合長度的課程</p>
            <div style={styles.optionGrid}>
              {Q2_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  style={styles.optionBtn(answers.q2 === opt.key)}
                  onClick={() => selectQ2(opt.key)}
                  type="button"
                >
                  {opt.text}
                </button>
              ))}
            </div>
          </>
        )}

        {currentStepKey === 'q3' && (
          <>
            <p style={styles.question}>你最想要哪種上課體驗？</p>
            <p style={styles.questionSub}>可以選 1–2 個，沒試過的也可以勾</p>
            <div style={styles.optionGrid}>
              {Q3_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  style={styles.optionBtn(q3Selection.includes(opt.key))}
                  onClick={() => toggleQ3(opt.key)}
                  type="button"
                >
                  <span style={{ flex: 1 }}>{opt.text}</span>
                  {opt.isProbe && <span style={styles.probe}>NEW</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {currentStepKey === 'q4' && (
          <>
            <p style={styles.question}>你現在的程度大概是？</p>
            <p style={styles.questionSub}>只影響推薦難度，不限制選課</p>
            <div style={styles.optionGrid}>
              {Q4_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  style={styles.optionBtn(answers.q4 === opt.key)}
                  onClick={() => selectQ4(opt.key)}
                  type="button"
                >
                  {opt.text}
                </button>
              ))}
            </div>
          </>
        )}

        <div style={styles.actions}>
          {onSkip && (
            <button style={styles.btnSkip} onClick={onSkip} type="button">
              {isDrawer ? '稍後再說' : '跳過'}
            </button>
          )}
          {!userId && isDrawer && mode === 'lite' && step === totalSteps - 1 && (
            <a
              href="/login/register"
              style={{ ...styles.btnSkip, color: '#6366f1', textDecoration: 'underline' }}
            >
              建立帳號保存偏好
            </a>
          )}
          <button
            style={{
              ...styles.btnPrimary,
              opacity: canAdvance && !submitting ? 1 : 0.5,
              cursor: canAdvance && !submitting ? 'pointer' : 'not-allowed',
            }}
            onClick={handleNext}
            disabled={!canAdvance || submitting}
            type="button"
          >
            {submitting ? '儲存中…' : step < totalSteps - 1 ? '下一題 →' : '查看推薦課程'}
          </button>
        </div>
      </>
    );
  }
}

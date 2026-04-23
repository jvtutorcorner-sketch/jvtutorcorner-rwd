'use client';

import { useState } from 'react';
import styles from './MedicineQuestionnaire.module.css';

interface MedicinePlanAnswer {
  q1?: string;
  q2?: string;
  q3?: string[];
  q4?: string;
}

interface Props {
  onComplete?: (answers: MedicinePlanAnswer) => void;
  onSkip?: () => void;
}

// ─── Question data ────────────────────────────────────────────────────────────

const Q1_OPTIONS = [
  { key: 'A', emoji: '🌡️', text: '發燒、頭痛、全身痠痛' },
  { key: 'B', emoji: '🤧', text: '鼻塞、流鼻水、打噴嚏' },
  { key: 'C', emoji: '🗣️', text: '咳嗽、喉嚨痛、多痰' },
  { key: 'D', emoji: '🤢', text: '胃痛、消化不良、腹瀉' },
];

const Q2_OPTIONS = [
  { key: 'A', text: '剛開始 (1-2 天)' },
  { key: 'B', text: '有一段時間了 (3-5 天)' },
  { key: 'C', text: '持續一週以上' },
  { key: 'D', text: '反覆發作，斷斷續續' },
];

const Q3_OPTIONS = [
  { key: 'A', text: '不曾有藥物過敏史', isSafe: true },
  { key: 'B', text: '對特定藥物過敏 (如 Penicillin)', isSafe: false },
  { key: 'C', text: '嚴重過敏體質', isSafe: false },
  { key: 'D', text: '不確定/未曾服用過此類藥物', isSafe: true },
];

const Q4_OPTIONS = [
  { key: 'A', text: '目前未服用其他藥物' },
  { key: 'B', text: '正在服用慢性病藥物' },
  { key: 'C', text: '正在服用營養補充品' },
  { key: 'D', text: '近期有服用其他感冒藥' },
];

export default function MedicineQuestionnaire({ onComplete, onSkip }: Props) {
  const totalSteps = 4;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<MedicinePlanAnswer>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function selectQ1(key: string) {
    setAnswers((a) => ({ ...a, q1: key }));
  }
  function selectQ2(key: string) {
    setAnswers((a) => ({ ...a, q2: key }));
  }
  function selectQ3(key: string) {
    setAnswers((a) => ({ ...a, q3: [key] }));
  }
  function selectQ4(key: string) {
    setAnswers((a) => ({ ...a, q4: key }));
  }

  const currentStepKey = ['q1', 'q2', 'q3', 'q4'][step];

  const canAdvance = (() => {
    if (currentStepKey === 'q1') return !!answers.q1;
    if (currentStepKey === 'q2') return !!answers.q2;
    if (currentStepKey === 'q3') return !!answers.q3 && answers.q3.length > 0;
    if (currentStepKey === 'q4') return !!answers.q4;
    return false;
  })();

  async function handleNext() {
    if (!canAdvance) return;

    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
      return;
    }

    setSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      setSubmitting(false);
      setDone(true);
      setTimeout(() => {
        onComplete?.(answers);
      }, 1500);
    }, 1000);
  }

  return (
    <div className={styles.inlineCard}>
      {done ? (
        <div className={styles.successMsg}>
          ✅ 感謝您的回覆，我們已收到您的資訊。<br/>
          正在為您分析用藥建議...
        </div>
      ) : (
        <>
          <div className={styles.progress}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div 
                key={i} 
                className={`${styles.progressDot} ${i === step ? styles.progressDotActive : ''} ${i < step ? styles.progressDotDone : ''}`} 
              />
            ))}
          </div>

          <div className={styles.header}>
            <p className={styles.tagline}>藥品使用諮詢問卷 💊</p>
            <p className={styles.subline}>為了您的用藥安全，請協助填寫以下資訊。</p>
          </div>

          {currentStepKey === 'q1' && (
            <>
              <p className={styles.question}>您目前最主要的身體不適症狀是？</p>
              <div className={styles.optionGrid}>
                {Q1_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    className={`${styles.optionBtn} ${answers.q1 === opt.key ? styles.optionBtnSelected : ''}`}
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
              <p className={styles.question}>該症狀已經持續多久了？</p>
              <div className={styles.optionGrid}>
                {Q2_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    className={`${styles.optionBtn} ${answers.q2 === opt.key ? styles.optionBtnSelected : ''}`}
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
              <p className={styles.question}>您過去是否有過藥物過敏史？</p>
              <div className={styles.optionGrid}>
                {Q3_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    className={`${styles.optionBtn} ${answers.q3?.includes(opt.key) ? styles.optionBtnSelected : ''}`}
                    onClick={() => selectQ3(opt.key)}
                    type="button"
                  >
                    {opt.text}
                  </button>
                ))}
              </div>
              {answers.q3?.includes('B') || answers.q3?.includes('C') ? (
                <div className={styles.warning}>
                  ⚠️ 注意：若有嚴重過敏史，建議諮詢專科醫師。
                </div>
              ) : null}
            </>
          )}

          {currentStepKey === 'q4' && (
            <>
              <p className={styles.question}>您目前是否正在服用其他藥物或營養品？</p>
              <div className={styles.optionGrid}>
                {Q4_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    className={`${styles.optionBtn} ${answers.q4 === opt.key ? styles.optionBtnSelected : ''}`}
                    onClick={() => selectQ4(opt.key)}
                    type="button"
                  >
                    {opt.text}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className={styles.actions}>
            {onSkip && (
              <button className={styles.btnSkip} onClick={onSkip} type="button">
                跳過
              </button>
            )}
            <button
              className={styles.btnPrimary}
              onClick={handleNext}
              disabled={!canAdvance || submitting}
              type="button"
            >
              {submitting ? '儲存中…' : step < totalSteps - 1 ? '下一題 →' : '提交問卷'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}


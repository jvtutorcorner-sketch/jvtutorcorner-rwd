'use client';
// app/lessons/[sessionId]/assessments/page.tsx
//
// Lesson-scoped AI Assessment (Phase 4). Teacher: AI-generate questions → review
// → dispatch, and view submissions. Student: answer dispatched assessments and
// get an AI grade. Mirrors the timeline page's conventions (useParams, no-store
// fetch, inline styles, isHost gating). Grading/generation are server-gated by
// plan; a 403 shows a plan message.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Question {
  qid: string;
  type: 'mcq' | 'short';
  prompt: string;
  options?: string[];
  answerIndex?: number;
  rubric?: string;
  points: number;
}
interface Grade {
  qid: string;
  score: number;
  max: number;
  feedback?: string;
  correct?: boolean;
}
interface Submission {
  studentId?: string;
  score: number;
  maxScore: number;
  status: string;
  grades: Grade[];
}
interface Assessment {
  assessmentId: string;
  title: string;
  status: string;
  questions: Question[];
  submission?: Submission | null;
}

const box: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16, background: '#fff' };
const btn = (bg: string): React.CSSProperties => ({ padding: '8px 14px', borderRadius: 8, border: 'none', background: bg, color: '#fff', cursor: 'pointer' });
const input: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', fontSize: 14 };

export default function AssessmentsPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId as string;
  const [loading, setLoading] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/lessons/${encodeURIComponent(sessionId)}/assessments`, { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setIsHost(!!j.isHost);
        setAssessments(j.assessments || []);
      } else setError(j?.error || '載入失敗');
    } catch {
      setError('連線失敗');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) void load();
  }, [sessionId, load]);

  const wrap: React.CSSProperties = { maxWidth: 820, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' };
  if (loading) return <div style={wrap}>載入中…</div>;

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#5b21b6', marginBottom: 16 }}>課堂測驗 / 作業</h1>
      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      {isHost ? (
        <TeacherView sessionId={sessionId} assessments={assessments} onChange={load} />
      ) : (
        <StudentView sessionId={sessionId} assessments={assessments} onChange={load} />
      )}
    </div>
  );
}

// ── Teacher ─────────────────────────────────────────────────────────────────

function TeacherView({ sessionId, assessments, onChange }: { sessionId: string; assessments: Assessment[]; onChange: () => void }) {
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('中等');
  const [draft, setDraft] = useState<Question[] | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const generate = async () => {
    if (!topic.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/ai/assessment/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, topic, count, difficulty }),
      });
      const j = await res.json().catch(() => null);
      if (res.status === 403) setNotice(j?.requiredPlan ? `AI 出題需 ${j.requiredPlan} 方案` : 'AI 出題未開放');
      else if (res.ok && j?.ok) {
        setDraft(j.questions);
        setTitle(topic);
      } else setNotice(j?.error || '出題失敗');
    } catch {
      setNotice('連線失敗');
    } finally {
      setBusy(false);
    }
  };

  const dispatch = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/lessons/${encodeURIComponent(sessionId)}/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, questions: draft }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setDraft(null);
        setTopic('');
        onChange();
      } else setNotice(j?.error || '派發失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={box}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>AI 出題</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ ...input, flex: 1, minWidth: 200 }} placeholder="主題,例如:一元二次方程式" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <input style={{ ...input, width: 70 }} type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          <select style={input} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option>簡單</option>
            <option>中等</option>
            <option>困難</option>
          </select>
          <button type="button" style={btn('#7c3aed')} disabled={busy || !topic.trim()} onClick={generate}>
            {busy ? '產生中…' : '產生題目'}
          </button>
        </div>
        {notice && <p style={{ color: '#b91c1c', marginTop: 8 }}>{notice}</p>}
        {draft && (
          <div style={{ marginTop: 14 }}>
            <input style={{ ...input, width: '100%', marginBottom: 10 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="測驗標題" />
            {draft.map((q, i) => (
              <div key={q.qid} style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8, marginTop: 8, fontSize: 14 }}>
                <div style={{ fontWeight: 600 }}>
                  {i + 1}. {q.prompt} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({q.type === 'mcq' ? '選擇' : '簡答'} · {q.points} 分)</span>
                </div>
                {q.type === 'mcq' && q.options && (
                  <ul style={{ margin: '4px 0 0 18px' }}>
                    {q.options.map((o, oi) => (
                      <li key={oi} style={{ color: oi === q.answerIndex ? '#059669' : '#374151' }}>
                        {o} {oi === q.answerIndex ? '✓' : ''}
                      </li>
                    ))}
                  </ul>
                )}
                {q.type === 'short' && q.rubric && <div style={{ color: '#6b7280', marginLeft: 4 }}>評分要點:{q.rubric}</div>}
              </div>
            ))}
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="button" style={btn('#0d9488')} disabled={busy} onClick={dispatch}>派發給學生</button>
              <button type="button" style={{ ...btn('#9ca3af') }} disabled={busy} onClick={() => setDraft(null)}>捨棄</button>
            </div>
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '8px 0' }}>已派發({assessments.length})</h2>
      {assessments.length === 0 && <p style={{ color: '#9ca3af' }}>還沒有派發任何測驗。</p>}
      {assessments.map((a) => (
        <TeacherAssessmentRow key={a.assessmentId} sessionId={sessionId} assessment={a} />
      ))}
    </>
  );
}

function TeacherAssessmentRow({ sessionId, assessment }: { sessionId: string; assessment: Assessment }) {
  const [open, setOpen] = useState(false);
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const view = async () => {
    setOpen(!open);
    if (!open && subs === null) {
      const res = await fetch(`/api/lessons/${encodeURIComponent(sessionId)}/assessments/${encodeURIComponent(assessment.assessmentId)}`, { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) setSubs(j.submissions || []);
    }
  };
  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>{assessment.title} <span style={{ color: '#9ca3af', fontWeight: 400 }}>· {assessment.questions.length} 題</span></div>
        <button type="button" style={{ ...btn('#7c3aed'), padding: '4px 10px' }} onClick={view}>{open ? '收合' : '查看作答'}</button>
      </div>
      {open && (
        <div style={{ marginTop: 10, fontSize: 14 }}>
          {subs === null ? '載入中…' : subs.length === 0 ? <span style={{ color: '#9ca3af' }}>尚無學生作答。</span> : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {subs.map((s, i) => (
                <li key={i} style={{ borderTop: '1px solid #f0f0f0', padding: '6px 0' }}>學生 {s.studentId?.slice(0, 8) || i + 1}:{s.score}/{s.maxScore}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Student ─────────────────────────────────────────────────────────────────

function StudentView({ sessionId, assessments, onChange }: { sessionId: string; assessments: Assessment[]; onChange: () => void }) {
  if (assessments.length === 0) return <p style={{ color: '#9ca3af' }}>老師還沒有派發測驗。</p>;
  return (
    <>
      {assessments.map((a) => (
        <StudentAssessmentCard key={a.assessmentId} sessionId={sessionId} assessment={a} onSubmitted={onChange} />
      ))}
    </>
  );
}

function StudentAssessmentCard({ sessionId, assessment, onSubmitted }: { sessionId: string; assessment: Assessment; onSubmitted: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Submission | null>(assessment.submission ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/lessons/${encodeURIComponent(sessionId)}/assessments/${encodeURIComponent(assessment.assessmentId)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setResult({ score: j.score, maxScore: j.maxScore, status: j.status, grades: j.grades });
        onSubmitted();
      } else setNotice(j?.error || '送出失敗');
    } catch {
      setNotice('連線失敗');
    } finally {
      setBusy(false);
    }
  };

  const gradeFor = (qid: string) => result?.grades?.find((g) => g.qid === qid);

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 600 }}>{assessment.title}</div>
        {result && <div style={{ color: '#5b21b6', fontWeight: 700 }}>{result.score}/{result.maxScore}</div>}
      </div>
      {assessment.questions.map((q, i) => (
        <div key={q.qid} style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8, marginTop: 8, fontSize: 14 }}>
          <div style={{ fontWeight: 600 }}>{i + 1}. {q.prompt} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({q.points} 分)</span></div>
          {q.type === 'mcq' && q.options && (
            <div style={{ marginTop: 4 }}>
              {q.options.map((o, oi) => (
                <label key={oi} style={{ display: 'block', color: '#374151' }}>
                  <input type="radio" name={q.qid} disabled={!!result} checked={answers[q.qid] === oi} onChange={() => setAnswers((p) => ({ ...p, [q.qid]: oi }))} /> {o}
                </label>
              ))}
            </div>
          )}
          {q.type === 'short' && (
            <textarea rows={2} disabled={!!result} style={{ ...input, width: '100%', marginTop: 4 }} value={(answers[q.qid] as string) || ''} onChange={(e) => setAnswers((p) => ({ ...p, [q.qid]: e.target.value }))} />
          )}
          {result && gradeFor(q.qid) && (
            <div style={{ marginTop: 4, fontSize: 13, color: gradeFor(q.qid)!.score === q.points ? '#059669' : '#b45309' }}>
              得分 {gradeFor(q.qid)!.score}/{q.points}{gradeFor(q.qid)!.feedback ? ` · ${gradeFor(q.qid)!.feedback}` : ''}
            </div>
          )}
        </div>
      ))}
      {notice && <p style={{ color: '#b91c1c', marginTop: 8 }}>{notice}</p>}
      {!result && (
        <button type="button" style={{ ...btn('#7c3aed'), marginTop: 12 }} disabled={busy} onClick={submit}>{busy ? '批改中…' : '送出作答'}</button>
      )}
    </div>
  );
}

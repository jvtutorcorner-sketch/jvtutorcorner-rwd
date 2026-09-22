'use client';
// components/classroom/StudentTutorPanel.tsx
//
// Student AI Tutor (Phase 3a): a collapsible panel that asks /api/ai/tutor for a
// hint. The hint ladder is server-controlled (1→4); "再給我一點提示" advances one
// level. Entitlement-gated server-side — a 403 shows a plan message.

import { useState } from 'react';

interface Turn {
  role: 'student' | 'tutor';
  text: string;
  hintLevel?: number;
}

export default function StudentTutorPanel({ sessionId }: { sessionId: string | null }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [hintLevel, setHintLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!sessionId) return null;

  const ask = async (advance: boolean) => {
    const q = advance ? turns.filter((t) => t.role === 'student').slice(-1)[0]?.text ?? question : question.trim();
    if (!q) return;
    setBusy(true);
    setNotice(null);
    if (!advance) setTurns((prev) => [...prev, { role: 'student', text: q }]);
    try {
      const res = await fetch('/api/ai/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, question: q, prevHintLevel: advance ? hintLevel : 0 }),
      });
      const j = await res.json().catch(() => null);
      if (res.status === 403) {
        setNotice(j?.requiredPlan ? `此功能需 ${j.requiredPlan} 方案` : '此功能未開放');
      } else if (res.ok && j?.ok) {
        setHintLevel(j.hintLevel);
        setTurns((prev) => [...prev, { role: 'tutor', text: j.answer || '(無回覆)', hintLevel: j.hintLevel }]);
      } else {
        setNotice(j?.error || '暫時無法回覆,請稍後再試');
      }
    } catch {
      setNotice('連線失敗,請稍後再試');
    } finally {
      setBusy(false);
      if (!advance) setQuestion('');
    }
  };

  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 50, width: open ? 320 : 'auto' }}>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            padding: '10px 14px',
            borderRadius: 999,
            border: 'none',
            background: '#7c3aed',
            color: '#fff',
            fontWeight: 600,
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            cursor: 'pointer',
          }}
        >
          🤖 問 AI 助教
        </button>
      )}
      {open && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '60vh',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <strong style={{ fontSize: 14, color: '#5b21b6' }}>AI 助教</strong>
            <button type="button" onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }}>
              ✕
            </button>
          </div>

          <div style={{ padding: 12, overflowY: 'auto', flex: 1, fontSize: 13, lineHeight: 1.5 }}>
            {turns.length === 0 && <p style={{ color: '#9ca3af' }}>把卡住的地方打出來,我會一步一步引導你(不會直接給答案)。</p>}
            {turns.map((t, i) => (
              <div key={i} style={{ margin: '6px 0', textAlign: t.role === 'student' ? 'right' : 'left' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '6px 10px',
                    borderRadius: 10,
                    background: t.role === 'student' ? '#ede9fe' : '#f3f4f6',
                    color: '#111',
                    maxWidth: '85%',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {t.role === 'tutor' && t.hintLevel ? <b style={{ color: '#6d28d9' }}>提示 {t.hintLevel}/4:</b> : null}{' '}
                  {t.text}
                </span>
              </div>
            ))}
            {notice && <p style={{ color: '#b91c1c', marginTop: 6 }}>{notice}</p>}
          </div>

          <div style={{ padding: 10, borderTop: '1px solid #f0f0f0' }}>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="輸入你的問題…"
              rows={2}
              style={{ width: '100%', resize: 'none', borderRadius: 8, border: '1px solid #ddd', padding: 8, fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => ask(false)}
                disabled={busy || !question.trim()}
                style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: busy ? 'default' : 'pointer' }}
              >
                {busy ? '思考中…' : '問助教'}
              </button>
              {hintLevel > 0 && hintLevel < 4 && (
                <button
                  type="button"
                  onClick={() => ask(true)}
                  disabled={busy}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #7c3aed', background: '#fff', color: '#6d28d9', cursor: busy ? 'default' : 'pointer' }}
                >
                  再提示一點
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

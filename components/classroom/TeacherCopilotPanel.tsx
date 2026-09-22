'use client';
// components/classroom/TeacherCopilotPanel.tsx
//
// Teacher Copilot (Phase 3b, non-gated): shows the recent teaching markers and an
// on-demand "建議講法" button that asks /copilot/suggest. Collapsible, host-only
// (rendered only for the host in ClientClassroom). Gated server-side by plan — a
// 403 shows a plan message.

import { useCallback, useEffect, useRef, useState } from 'react';

const TYPE_LABEL: Record<string, string> = {
  important_concept: '💡 重要概念',
  start_new_topic: '📑 新主題',
  start_exercise: '✏️ 練習',
  student_question: '🙋 學生提問',
  start_quiz: '📝 測驗',
  end_segment: '⏹ 結束本段',
};

interface Ev {
  eventId: string;
  offsetSec: number;
  type: string;
  note?: string;
  source: string;
}

function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function TeacherCopilotPanel({ sessionId }: { sessionId: string | null }) {
  const [open, setOpen] = useState(false);
  const [markers, setMarkers] = useState<Ev[]>([]);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);

  const poll = useCallback(async () => {
    if (!sessionId) return;
    try {
      const qs = cursorRef.current ? `?since=${encodeURIComponent(cursorRef.current)}` : '';
      const res = await fetch(`/api/lessons/${encodeURIComponent(sessionId)}/events${qs}`, { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok && Array.isArray(j.events)) {
        if (j.cursor) cursorRef.current = j.cursor;
        const newMarkers = (j.events as Ev[]).filter((e) => e.source === 'marker' && TYPE_LABEL[e.type]);
        if (newMarkers.length) setMarkers((prev) => [...prev.slice(-19), ...newMarkers]);
      }
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !open) return;
    void poll();
    const t = setInterval(() => void poll(), 15_000);
    return () => clearInterval(t);
  }, [sessionId, open, poll]);

  if (!sessionId) return null;

  const suggest = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/lessons/${encodeURIComponent(sessionId)}/copilot/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await res.json().catch(() => null);
      if (res.status === 403) setNotice(j?.requiredPlan ? `Copilot 需 ${j.requiredPlan} 方案` : 'Copilot 未開放');
      else if (res.ok && j?.ok) setSuggestion(j.suggestion || '(無建議)');
      else setNotice(j?.error || '暫時無法產生建議');
    } catch {
      setNotice('連線失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 50, width: open ? 300 : 'auto' }}>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: '#0d9488', color: '#fff', fontWeight: 600, boxShadow: '0 2px 10px rgba(0,0,0,0.2)', cursor: 'pointer' }}
        >
          🧭 教學 Copilot
        </button>
      )}
      {open && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 6px 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', maxHeight: '60vh' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
            <strong style={{ fontSize: 14, color: '#0f766e' }}>教學 Copilot</strong>
            <button type="button" onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
          <div style={{ padding: 12, overflowY: 'auto', flex: 1, fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ color: '#6b7280', marginBottom: 6 }}>最近標記</div>
            {markers.length === 0 ? (
              <p style={{ color: '#9ca3af' }}>還沒有標記。</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {markers.slice(-6).map((m) => (
                  <li key={m.eventId} style={{ fontSize: 12, color: '#374151' }}>
                    {mmss(m.offsetSec)} {TYPE_LABEL[m.type]}{m.note ? `:${m.note}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {suggestion && (
              <div style={{ marginTop: 10, padding: 8, borderRadius: 8, background: '#f0fdfa', color: '#134e4a', whiteSpace: 'pre-wrap' }}>
                💡 {suggestion}
              </div>
            )}
            {notice && <p style={{ color: '#b91c1c', marginTop: 6 }}>{notice}</p>}
          </div>
          <div style={{ padding: 10, borderTop: '1px solid #f0f0f0' }}>
            <button
              type="button"
              onClick={suggest}
              disabled={busy}
              style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', background: '#0d9488', color: '#fff', cursor: busy ? 'default' : 'pointer' }}
            >
              {busy ? '思考中…' : '建議下一步'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

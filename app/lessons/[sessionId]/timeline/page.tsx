'use client';
// app/lessons/[sessionId]/timeline/page.tsx
//
// Lesson Timeline (Phase 3a). Chapters == segments derived from markers / system
// events / time fallback (no audio yet). A student sees their lesson; the host
// can rename a segment's topic inline (PATCH .../segments/[seq]).

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface SegEvent {
  eventId: string;
  source: string;
  type: string;
  offsetSec: number;
  note?: string;
}
interface Segment {
  seq: string;
  index: number;
  startSec: number;
  endSec: number | null;
  boundarySource: string;
  boundaryType?: string;
  confidence: number;
  topic?: string;
  objective?: string;
  events: SegEvent[];
  editedBy?: string;
}
interface TimelineResp {
  ok: boolean;
  isHost?: boolean;
  lesson?: { courseId: string; title?: string; startTime?: string; endTime?: string; status?: string };
  segments?: Segment[];
  error?: string;
}

const MARKER_LABEL: Record<string, string> = {
  important_concept: '💡 重要概念',
  start_new_topic: '📑 新主題',
  start_exercise: '✏️ 練習',
  student_question: '🙋 學生提問',
  start_quiz: '📝 測驗',
  end_segment: '⏹ 結束本段',
  quiz_start: '📝 測驗開始',
  quiz_complete: '✅ 測驗結束',
  screenshare_start: '🖥 開始分享',
  screenshare_stop: '🖥 結束分享',
};
const SOURCE_LABEL: Record<string, string> = { marker: '老師標記', system: '系統事件', ai: 'AI 判斷', time: '時間分段' };

function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function LessonTimelinePage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId as string;
  const [data, setData] = useState<TimelineResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/lessons/${encodeURIComponent(sessionId)}/timeline`, { cache: 'no-store' });
      const j = (await res.json().catch(() => null)) as TimelineResp | null;
      setData(j ?? { ok: false, error: '載入失敗' });
    } catch {
      setData({ ok: false, error: '連線失敗' });
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) void load();
  }, [sessionId, load]);

  const saveTopic = async (seq: string) => {
    const topic = draft.trim();
    setEditing(null);
    try {
      await fetch(`/api/lessons/${encodeURIComponent(sessionId)}/segments/${encodeURIComponent(seq)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      await load();
    } catch {
      /* ignore */
    }
  };

  const wrap: React.CSSProperties = { maxWidth: 820, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' };

  if (loading) return <div style={wrap}>載入中…</div>;
  if (!data?.ok) return <div style={wrap}>無法載入時間軸:{data?.error || '未知錯誤'}</div>;

  const segs = data.segments ?? [];
  const isHost = !!data.isHost;

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#5b21b6', marginBottom: 4 }}>
        {data.lesson?.title || '課堂時間軸'}
      </h1>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>
        {data.lesson?.startTime ? new Date(data.lesson.startTime).toLocaleString() : ''} · 共 {segs.length} 段
        {isHost ? ' · 你可以點主題名稱重新命名' : ''}
      </p>

      {segs.length === 0 && <p style={{ color: '#9ca3af' }}>這堂課還沒有教學段落(老師尚未標記,或課程未結束)。</p>}

      <ol style={{ listStyle: 'none', padding: 0, margin: 0, borderLeft: '2px solid #ddd6fe' }}>
        {segs.map((s) => (
          <li key={s.seq} style={{ position: 'relative', padding: '0 0 20px 20px' }}>
            <span
              style={{
                position: 'absolute',
                left: -7,
                top: 4,
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: s.boundarySource === 'marker' ? '#7c3aed' : s.boundarySource === 'time' ? '#cbd5e1' : '#a78bfa',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#6d28d9', fontWeight: 600, fontSize: 13 }}>
                {mmss(s.startSec)}–{s.endSec != null ? mmss(s.endSec) : '…'}
              </span>
              {editing === s.seq ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => saveTopic(s.seq)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveTopic(s.seq);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  style={{ fontSize: 15, padding: '2px 6px', border: '1px solid #a78bfa', borderRadius: 6 }}
                />
              ) : (
                <span
                  onClick={() => {
                    if (!isHost) return;
                    setEditing(s.seq);
                    setDraft(s.topic || '');
                  }}
                  style={{ fontSize: 15, fontWeight: 600, cursor: isHost ? 'text' : 'default', color: s.topic ? '#111' : '#9ca3af' }}
                >
                  {s.topic || `第 ${s.index + 1} 段`}
                  {s.editedBy ? <span style={{ fontSize: 11, color: '#059669', marginLeft: 6 }}>已編輯</span> : null}
                </span>
              )}
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{SOURCE_LABEL[s.boundarySource] || s.boundarySource}</span>
            </div>
            {s.events.filter((e) => MARKER_LABEL[e.type]).length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {s.events
                  .filter((e) => MARKER_LABEL[e.type])
                  .map((e) => (
                    <span
                      key={e.eventId}
                      title={e.note || ''}
                      style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: '#f3f4f6', color: '#4b5563' }}
                    >
                      {mmss(e.offsetSec)} {MARKER_LABEL[e.type]}
                      {e.note ? `:${e.note}` : ''}
                    </span>
                  ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

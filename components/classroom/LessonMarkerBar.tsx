'use client';
// components/classroom/LessonMarkerBar.tsx
//
// Teacher's teaching-marker row (Phase 3a). Six zero-cost markers that drive the
// Segmenter / Timeline. Renders only for the host; hidden until the lesson
// session has resolved.

import { useState } from 'react';
import type { MarkerType } from '@/lib/lessonAI/eventTypes';
import type { LessonSessionApi } from '@/lib/classroom/useLessonSession';

const MARKERS: { type: MarkerType; label: string }[] = [
  { type: 'important_concept', label: '💡 重要概念' },
  { type: 'start_new_topic', label: '📑 新主題' },
  { type: 'start_exercise', label: '✏️ 開始練習' },
  { type: 'student_question', label: '🙋 學生提問' },
  { type: 'start_quiz', label: '📝 開始測驗' },
  { type: 'end_segment', label: '⏹ 結束本段' },
];

export default function LessonMarkerBar({ api }: { api: LessonSessionApi }) {
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState<MarkerType | null>(null);

  if (!api.ready) return null;

  const onClick = async (type: MarkerType, label: string) => {
    setBusy(type);
    const ok = await api.sendMarker(type);
    setBusy(null);
    setFlash(ok ? `已標記:${label}` : '標記失敗,請再試一次');
    setTimeout(() => setFlash(null), 1800);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        background: 'rgba(124, 58, 237, 0.08)',
        border: '1px solid rgba(124, 58, 237, 0.25)',
        borderRadius: 10,
      }}
      aria-label="教學斷點"
    >
      <span style={{ fontSize: 12, color: '#6d28d9', fontWeight: 600, marginRight: 2 }}>教學標記</span>
      {MARKERS.map((m) => (
        <button
          key={m.type}
          type="button"
          onClick={() => onClick(m.type, m.label)}
          disabled={busy === m.type}
          style={{
            fontSize: 13,
            padding: '4px 10px',
            borderRadius: 8,
            border: '1px solid rgba(124, 58, 237, 0.35)',
            background: busy === m.type ? '#ddd6fe' : '#fff',
            color: '#5b21b6',
            cursor: busy === m.type ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {m.label}
        </button>
      ))}
      {flash && <span style={{ fontSize: 12, color: '#059669', marginLeft: 4 }}>{flash}</span>}
    </div>
  );
}

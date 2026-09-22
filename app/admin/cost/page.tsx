'use client';

// Minimal AI/RTC cost dashboard (auth-gated by app/admin/layout.tsx). Reads the
// GLOBAL month rollup and, on demand, a per-lesson rollup. Data is written by
// lib/ai/gateway/ledger.ts recordUsage (AI Gateway) — empty until AI features run.

import { useEffect, useState } from 'react';

type Rollup = { total_musd: number; ai_musd: number; platform_musd: number; requests: number; total_nt: number } | null;

export default function CostPage() {
  const [month] = useState(new Date().toISOString().slice(0, 7).replace('-', ''));
  const [global, setGlobal] = useState<Rollup>(null);
  const [fx, setFx] = useState(32);
  const [lessonId, setLessonId] = useState('');
  const [lesson, setLesson] = useState<Rollup>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/cost/summary?scope=GLOBAL&month=${month}`);
        const data = await res.json();
        if (data.ok) { setGlobal(data.rollups[`GLOBAL#${month}`]); setFx(data.fx); }
      } finally { setLoading(false); }
    })();
  }, [month]);

  const loadLesson = async () => {
    if (!lessonId.trim()) return;
    const res = await fetch(`/api/admin/cost/lessons/${encodeURIComponent(lessonId.trim())}`);
    const data = await res.json();
    setLesson(data.ok ? data.rollup : null);
  };

  const usd = (musd: number) => `$${(musd / 1_000_000).toFixed(4)}`;
  const card = (title: string, r: Rollup) => (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, minWidth: 260 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {!r ? <div style={{ color: '#888' }}>尚無資料</div> : (
        <table style={{ fontSize: 14 }}>
          <tbody>
            <tr><td style={{ paddingRight: 12, color: '#666' }}>總成本</td><td>{usd(r.total_musd)} ≈ NT${r.total_nt}</td></tr>
            <tr><td style={{ color: '#666' }}>AI</td><td>{usd(r.ai_musd)}</td></tr>
            <tr><td style={{ color: '#666' }}>Platform(RTC)</td><td>{usd(r.platform_musd)}</td></tr>
            <tr><td style={{ color: '#666' }}>請求數</td><td>{r.requests}</td></tr>
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>AI / RTC 成本儀表板</h1>
      <p style={{ color: '#666', marginBottom: 16, fontSize: 13 }}>月份 {month} · 匯率 US$1 = NT${fx} · 金額為 micro-USD 換算</p>
      {loading ? <div>載入中…</div> : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {card(`GLOBAL ${month}`, global)}
        </div>
      )}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>每堂成本查詢</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input value={lessonId} onChange={(e) => setLessonId(e.target.value)} placeholder="sessionId" style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 10px' }} />
          <button onClick={loadLesson} style={{ background: '#7c3aed', color: '#fff', borderRadius: 6, padding: '6px 14px', border: 0 }}>查詢</button>
        </div>
        {lesson !== null && card(`LESSON ${lessonId}`, lesson)}
      </div>
    </div>
  );
}

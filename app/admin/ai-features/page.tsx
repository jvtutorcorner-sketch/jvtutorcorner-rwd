'use client';

// Minimal AI feature-flag console. Lives under /admin (auth-gated by
// app/admin/layout.tsx). Edits the GLOBAL-scope enabled/requiredPlan per feature;
// finer per-scope (TENANT/PLAN/TEACHER/COURSE/LESSON/USER) rows are set via the
// API directly for now. Resolution logic is server-side (lib/ai/entitlements.ts).

import { useEffect, useState } from 'react';

type Seed = { defaultEnabled: boolean; requiredPlan?: string; syncOrAsync?: string };
type Row = { featureId: string; scope: string; enabled?: string; locked?: boolean; requiredPlan?: string };

export default function AiFeaturesPage() {
  const [seeds, setSeeds] = useState<Record<string, Seed>>({});
  const [rows, setRows] = useState<Record<string, Row[]>>({});
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ai-features');
      const data = await res.json();
      if (data.ok) { setSeeds(data.seeds || {}); setRows(data.rows || {}); }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const globalRow = (featureId: string): Row =>
    (rows[featureId] || []).find((r) => r.scope === 'GLOBAL') || { featureId, scope: 'GLOBAL' };

  const save = async (featureId: string, patch: Partial<Row>) => {
    setMsg('');
    const current = globalRow(featureId);
    const body = { ...current, ...patch, featureId, scope: 'GLOBAL' };
    const res = await fetch('/api/admin/ai-features', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    setMsg(data.ok ? `已儲存 ${featureId}` : `儲存失敗:${data.error || ''}`);
    await load();
  };

  if (loading) return <div style={{ padding: 24 }}>載入中…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>AI 功能開關</h1>
      <p style={{ color: '#666', marginBottom: 16, fontSize: 13 }}>
        設定各 AI 功能的 GLOBAL 層開關與所需方案。實際生效由 7 層解析(Global→Tenant→Plan→Teacher→Course→Lesson→User)決定;此頁只編 GLOBAL 層。
      </p>
      {msg && <div style={{ marginBottom: 12, color: '#2563eb' }}>{msg}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
            <th style={{ padding: 8 }}>功能</th>
            <th style={{ padding: 8 }}>seed 預設</th>
            <th style={{ padding: 8 }}>GLOBAL enabled</th>
            <th style={{ padding: 8 }}>requiredPlan</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(seeds).map((f) => {
            const g = globalRow(f);
            return (
              <tr key={f} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: 8, fontFamily: 'monospace' }}>{f}</td>
                <td style={{ padding: 8, color: '#888' }}>{seeds[f].defaultEnabled ? 'on' : 'off'}{seeds[f].requiredPlan ? ` · ${seeds[f].requiredPlan}` : ''}</td>
                <td style={{ padding: 8 }}>
                  <select value={g.enabled || 'inherit'} onChange={(e) => save(f, { enabled: e.target.value })}>
                    <option value="inherit">inherit(用 seed)</option>
                    <option value="on">on</option>
                    <option value="off">off</option>
                  </select>
                </td>
                <td style={{ padding: 8 }}>
                  <select value={g.requiredPlan || ''} onChange={(e) => save(f, { requiredPlan: e.target.value || undefined })}>
                    <option value="">(用 seed)</option>
                    <option value="viewer">viewer</option>
                    <option value="basic">basic</option>
                    <option value="pro">pro</option>
                    <option value="elite">elite</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

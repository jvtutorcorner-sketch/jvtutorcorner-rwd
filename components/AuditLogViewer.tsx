"use client";

import { useState } from "react";

type AuditLogEntry = {
  auditId: string;
  createdAt: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
};

export default function AuditLogViewer() {
  const [targetId, setTargetId] = useState('');
  const [targetType, setTargetType] = useState('');
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [limit, setLimit] = useState('50');
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (targetId.trim()) params.set('targetId', targetId.trim());
      if (targetType.trim()) params.set('targetType', targetType.trim());
      if (action.trim()) params.set('action', action.trim());
      if (actorId.trim()) params.set('actorId', actorId.trim());
      if (limit.trim()) params.set('limit', limit.trim());

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '查詢失敗');
      setEntries(data.entries || []);
      setSearched(true);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={handleSearch}
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 16,
          padding: 12,
          backgroundColor: '#f5f5f5',
          borderRadius: 4
        }}
      >
        <input
          type="text"
          placeholder="targetId（例如組織/授權/訂單 id，留空則瀏覽最近紀錄）"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          style={{ padding: 6, minWidth: 280 }}
        />
        <input
          type="text"
          placeholder="targetType（如 organization / license / order / roles）"
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
          style={{ padding: 6, minWidth: 200 }}
        />
        <input
          type="text"
          placeholder="action（如 organization.create）"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          style={{ padding: 6, minWidth: 180 }}
        />
        <input
          type="text"
          placeholder="actorId"
          value={actorId}
          onChange={(e) => setActorId(e.target.value)}
          style={{ padding: 6, minWidth: 160 }}
        />
        <input
          type="number"
          min={1}
          max={200}
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          style={{ padding: 6, width: 90 }}
          title="最多回傳筆數（上限 200）"
        />
        <button type="submit" disabled={loading} style={btn('#1565c0')}>
          {loading ? '查詢中...' : '查詢'}
        </button>
      </form>

      {!targetId.trim() && (
        <p style={{ color: '#999', fontSize: 13 }}>
          未指定 targetId 時為全表掃描（Scan），僅適合少量診斷用途——這張表目前只有組織/授權/訂單/角色設定等高風險異動會寫入，資料量小。
        </p>
      )}

      {error && <p style={{ color: '#d32f2f' }}>{error}</p>}
      {searched && !loading && entries.length === 0 && <p style={{ color: '#999' }}>查無符合條件的稽核紀錄</p>}

      {entries.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', border: '2px solid #ccc', width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>時間</th>
                <th style={th}>Action</th>
                <th style={th}>Target Type</th>
                <th style={th}>Target ID</th>
                <th style={th}>Actor ID</th>
                <th style={th}>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.auditId}>
                  <td style={td}>{e.createdAt}</td>
                  <td style={td}>{e.action}</td>
                  <td style={td}>{e.targetType}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{e.targetId}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{e.actorId}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                    {e.metadata ? JSON.stringify(e.metadata) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function btn(color: string): React.CSSProperties {
  return {
    padding: '6px 16px',
    backgroundColor: color,
    color: 'white',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13
  };
}

const th: React.CSSProperties = { border: '2px solid #ccc', padding: 8, textAlign: 'left', backgroundColor: '#fafafa' };
const td: React.CSSProperties = { border: '2px solid #ccc', padding: 8 };

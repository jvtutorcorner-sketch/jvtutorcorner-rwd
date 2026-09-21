"use client";

import { useCallback, useEffect, useState } from "react";

type AccountStatus = 'active' | 'suspended' | 'banned';

type UserSummary = {
  id: string;
  roid_id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  authProvider: string;
  emailVerified: boolean;
  accountStatus: AccountStatus;
  suspendedReason: string | null;
  suspendedAt: string | null;
  suspendedBy: string | null;
  suspendedUntil: string | null;
  createdAt: string | null;
};

const STATUS_LABEL: Record<AccountStatus, string> = {
  active: '正常',
  suspended: '停權中',
  banned: '已封鎖',
};

const STATUS_COLOR: Record<AccountStatus, string> = {
  active: '#1a7f37',
  suspended: '#b45309',
  banned: '#b91c1c',
};

const cell: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #e5e7eb', verticalAlign: 'top', fontSize: 13 };
const btn: React.CSSProperties = { padding: '4px 10px', fontSize: 12, borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' };

function fmt(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function AdminUserManager() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | AccountStatus>('all');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 停權對話框狀態
  const [dialog, setDialog] = useState<{ user: UserSummary; status: 'suspended' | 'banned' } | null>(null);
  const [reason, setReason] = useState('');
  const [untilDays, setUntilDays] = useState<string>('7');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (status !== 'all') params.set('status', status);
      const res = await fetch(`/api/admin/users?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '查詢失敗');
      setUsers(data.users || []);
    } catch (e: any) {
      setError(e?.message || '查詢失敗');
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => { void load(); }, [load]);

  async function applyStatus(user: UserSummary, next: AccountStatus, opts?: { reason?: string; until?: string | null }) {
    setBusyId(user.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, reason: opts?.reason || '', until: opts?.until || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '更新失敗');
      setDialog(null);
      setReason('');
      await load();
    } catch (e: any) {
      setError(e?.message || '更新失敗');
    } finally {
      setBusyId(null);
    }
  }

  function submitDialog() {
    if (!dialog) return;
    let until: string | null = null;
    if (dialog.status === 'suspended' && untilDays !== 'forever') {
      const days = Number(untilDays);
      if (Number.isFinite(days) && days > 0) {
        until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      }
    }
    void applyStatus(dialog.user, dialog.status, { reason, until });
  }

  const counts = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.accountStatus] = (acc[u.accountStatus] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ marginTop: 16 }}>
      <form
        onSubmit={(e) => { e.preventDefault(); void load(); }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋 Email / 名稱 / ID"
          style={{ padding: '6px 8px', minWidth: 260, border: '1px solid #d1d5db', borderRadius: 4 }}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} style={{ padding: '6px 8px' }}>
          <option value="all">全部狀態</option>
          <option value="active">正常</option>
          <option value="suspended">停權中</option>
          <option value="banned">已封鎖</option>
        </select>
        <button type="submit" style={btn} disabled={loading}>{loading ? '查詢中…' : '查詢'}</button>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          共 {users.length} 筆 · 正常 {counts.active || 0} · 停權 {counts.suspended || 0} · 封鎖 {counts.banned || 0}
        </span>
      </form>

      {error && (
        <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: 4, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
          <thead>
            <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
              <th style={cell}>Email</th>
              <th style={cell}>名稱</th>
              <th style={cell}>角色 / 方案</th>
              <th style={cell}>登入方式</th>
              <th style={cell}>Email 驗證</th>
              <th style={cell}>狀態</th>
              <th style={cell}>停權資訊</th>
              <th style={cell}>註冊時間</th>
              <th style={cell}>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && !loading && (
              <tr><td style={cell} colSpan={9}>沒有符合的使用者</td></tr>
            )}
            {users.map((u) => {
              const busy = busyId === u.id;
              return (
                <tr key={u.id}>
                  <td style={cell}>
                    <div>{u.email || <em style={{ color: '#9ca3af' }}>（無 Email）</em>}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{u.id}</div>
                  </td>
                  <td style={cell}>{u.name || '—'}</td>
                  <td style={cell}>{u.role}{u.plan ? ` / ${u.plan}` : ''}</td>
                  <td style={cell}>{u.authProvider}</td>
                  <td style={cell}>{u.emailVerified ? '✅' : '❌ 未驗證'}</td>
                  <td style={{ ...cell, color: STATUS_COLOR[u.accountStatus], fontWeight: 600 }}>
                    {STATUS_LABEL[u.accountStatus]}
                  </td>
                  <td style={cell}>
                    {u.accountStatus === 'active' ? '—' : (
                      <div style={{ fontSize: 12 }}>
                        {u.suspendedReason && <div>原因：{u.suspendedReason}</div>}
                        <div>時間：{fmt(u.suspendedAt)}</div>
                        {u.suspendedUntil && <div>至：{fmt(u.suspendedUntil)}</div>}
                        {u.suspendedBy && <div>操作者：{u.suspendedBy}</div>}
                      </div>
                    )}
                  </td>
                  <td style={cell}>{fmt(u.createdAt)}</td>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                    {u.accountStatus === 'active' ? (
                      <>
                        <button
                          style={{ ...btn, color: '#b45309', marginRight: 6 }}
                          disabled={busy}
                          onClick={() => { setDialog({ user: u, status: 'suspended' }); setReason(''); setUntilDays('7'); }}
                        >
                          停權
                        </button>
                        <button
                          style={{ ...btn, color: '#b91c1c' }}
                          disabled={busy}
                          onClick={() => { setDialog({ user: u, status: 'banned' }); setReason(''); }}
                        >
                          封鎖
                        </button>
                      </>
                    ) : (
                      <button
                        style={{ ...btn, color: '#1a7f37' }}
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`確定恢復 ${u.email || u.id} 的帳號？`)) void applyStatus(u, 'active');
                        }}
                      >
                        {busy ? '處理中…' : '恢復'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dialog && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={() => !busyId && setDialog(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', padding: 20, borderRadius: 8, width: 420, maxWidth: '90vw' }}
          >
            <h3 style={{ marginTop: 0 }}>
              {dialog.status === 'banned' ? '封鎖帳號' : '停權帳號'}：{dialog.user.email || dialog.user.id}
            </h3>
            <p style={{ fontSize: 13, color: '#4b5563' }}>
              {dialog.status === 'banned'
                ? '封鎖為永久性，需管理員手動恢復。該使用者所有登入 session 會立即失效。'
                : '停權期間該使用者無法登入，所有登入 session 會立即失效；到期後自動恢復。'}
            </p>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>
              原因（會顯示在稽核紀錄；使用者登入時也會看到）
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                style={{ width: '100%', marginTop: 4, padding: 6, border: '1px solid #d1d5db', borderRadius: 4 }}
              />
            </label>
            {dialog.status === 'suspended' && (
              <label style={{ display: 'block', fontSize: 13, marginBottom: 12 }}>
                停權時長
                <select value={untilDays} onChange={(e) => setUntilDays(e.target.value)} style={{ marginLeft: 8, padding: 4 }}>
                  <option value="1">1 天</option>
                  <option value="3">3 天</option>
                  <option value="7">7 天</option>
                  <option value="30">30 天</option>
                  <option value="forever">直到手動恢復</option>
                </select>
              </label>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={btn} onClick={() => setDialog(null)} disabled={Boolean(busyId)}>取消</button>
              <button
                style={{ ...btn, background: dialog.status === 'banned' ? '#b91c1c' : '#b45309', color: '#fff', borderColor: 'transparent' }}
                onClick={submitDialog}
                disabled={Boolean(busyId)}
              >
                {busyId ? '處理中…' : (dialog.status === 'banned' ? '確認封鎖' : '確認停權')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

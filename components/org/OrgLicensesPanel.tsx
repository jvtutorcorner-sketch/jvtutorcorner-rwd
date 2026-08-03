"use client";

import { useEffect, useState } from "react";

type License = {
  id: string;
  orgId: string;
  userId?: string | null;
  courseId?: string | null;
  status: 'active' | 'revoked' | 'expired' | 'pending';
  assignedAt?: string;
  assignedBy?: string;
  expiresAt?: number;
  createdAt: string;
};

type Member = { id: string; email: string; firstName?: string; lastName?: string };

interface Props {
  orgId: string;
  onSeatsChanged: () => void;
}

const STATUS_LABEL: Record<License['status'], string> = {
  active: '已指派',
  pending: '未指派（庫存）',
  revoked: '已撤銷',
  expired: '已過期'
};

const STATUS_COLOR: Record<License['status'], string> = {
  active: '#4caf50',
  pending: '#2196f3',
  revoked: '#9e9e9e',
  expired: '#f44336'
};

export default function OrgLicensesPanel({ orgId, onSeatsChanged }: Props) {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provisionCount, setProvisionCount] = useState('1');
  const [provisioning, setProvisioning] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignEmail, setAssignEmail] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [licRes, memRes] = await Promise.all([
        fetch(`/api/licenses?orgId=${encodeURIComponent(orgId)}`),
        fetch(`/api/organizations/${orgId}/members`)
      ]);
      const licData = await licRes.json();
      const memData = await memRes.json();
      if (!licRes.ok || !licData.ok) throw new Error(licData?.error || '無法載入授權');
      setLicenses(licData.licenses || []);
      setMembers(memData.members || []);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  function memberLabel(userId?: string | null) {
    if (!userId) return '-';
    const m = members.find((mm) => mm.id === userId);
    if (!m) return userId;
    const name = `${m.firstName || ''} ${m.lastName || ''}`.trim();
    return name ? `${name}（${m.email}）` : m.email;
  }

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault();
    setProvisioning(true);
    try {
      const res = await fetch('/api/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, count: parseInt(provisionCount, 10) || 1 })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '核發授權失敗');
      setProvisionCount('1');
      await load();
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setProvisioning(false);
    }
  }

  async function handleAssign(license: License) {
    try {
      const res = await fetch(`/api/licenses/${license.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: assignEmail })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '指派失敗');
      setAssigningId(null);
      setAssignEmail('');
      await load();
      onSeatsChanged();
    } catch (err: any) {
      alert(err?.message || String(err));
    }
  }

  async function handleUnassign(license: License) {
    if (!confirm('確定要取消指派此授權嗎？該使用者的席次會被釋放。')) return;
    try {
      const res = await fetch(`/api/licenses/${license.id}/assign`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '取消指派失敗');
      await load();
      onSeatsChanged();
    } catch (err: any) {
      alert(err?.message || String(err));
    }
  }

  async function handleRevoke(license: License) {
    if (!confirm('確定要撤銷此未指派的授權嗎？')) return;
    try {
      const res = await fetch(`/api/licenses/${license.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '撤銷失敗');
      await load();
    } catch (err: any) {
      alert(err?.message || String(err));
    }
  }

  return (
    <div>
      <h3>授權</h3>

      <form onSubmit={handleProvision} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <label>
          批次核發
          <input
            type="number"
            min={1}
            max={100}
            value={provisionCount}
            onChange={(e) => setProvisionCount(e.target.value)}
            style={{ width: 70, padding: 6, marginLeft: 6, marginRight: 6 }}
          />
          個未指派授權
        </label>
        <button type="submit" disabled={provisioning} style={btn('#4caf50')}>
          核發
        </button>
      </form>

      {error && <p style={{ color: '#d32f2f' }}>{error}</p>}
      {loading && <p>載入中...</p>}
      {!loading && licenses.length === 0 && <p style={{ color: '#999' }}>尚無授權</p>}

      {!loading && licenses.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', border: '2px solid #ccc', width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>授權 ID</th>
                <th style={th}>狀態</th>
                <th style={th}>指派對象</th>
                <th style={th}>課程</th>
                <th style={th}>指派時間</th>
                <th style={th}>到期日</th>
                <th style={th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((lic) => (
                <tr key={lic.id}>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{lic.id.slice(0, 8)}...</td>
                  <td style={td}>
                    <span
                      style={{
                        padding: '4px 8px',
                        backgroundColor: STATUS_COLOR[lic.status],
                        color: 'white',
                        borderRadius: 3,
                        fontSize: 12,
                        fontWeight: 'bold'
                      }}
                    >
                      {STATUS_LABEL[lic.status]}
                    </span>
                  </td>
                  <td style={td}>{memberLabel(lic.userId)}</td>
                  <td style={td}>{lic.courseId || '-'}</td>
                  <td style={{ ...td, fontSize: 12 }}>{lic.assignedAt ? new Date(lic.assignedAt).toLocaleString('zh-TW') : '-'}</td>
                  <td style={{ ...td, fontSize: 12 }}>
                    {lic.expiresAt ? new Date(lic.expiresAt * 1000).toLocaleDateString('zh-TW') : '永久'}
                  </td>
                  <td style={td}>
                    {lic.status === 'pending' && (
                      <>
                        {assigningId === lic.id ? (
                          <span style={{ display: 'inline-flex', gap: 4 }}>
                            <input
                              type="email"
                              placeholder="Email"
                              value={assignEmail}
                              onChange={(e) => setAssignEmail(e.target.value)}
                              style={{ padding: 4, width: 160 }}
                            />
                            <button onClick={() => handleAssign(lic)} style={btn('#4caf50')}>
                              確定
                            </button>
                            <button onClick={() => setAssigningId(null)} style={btn('#9e9e9e')}>
                              取消
                            </button>
                          </span>
                        ) : (
                          <>
                            <button onClick={() => setAssigningId(lic.id)} style={{ ...btn('#2196f3'), marginRight: 6 }}>
                              指派
                            </button>
                            <button onClick={() => handleRevoke(lic)} style={btn('#f44336')}>
                              撤銷
                            </button>
                          </>
                        )}
                      </>
                    )}
                    {lic.status === 'active' && (
                      <button onClick={() => handleUnassign(lic)} style={btn('#f44336')}>
                        取消指派
                      </button>
                    )}
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
    padding: '5px 12px',
    backgroundColor: color,
    color: 'white',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12
  };
}

const th: React.CSSProperties = { border: '2px solid #ccc', padding: 8, textAlign: 'left', backgroundColor: '#fafafa' };
const td: React.CSSProperties = { border: '2px solid #ccc', padding: 8 };

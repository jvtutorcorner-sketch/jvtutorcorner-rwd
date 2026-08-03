"use client";

import { useEffect, useState } from "react";

type License = {
  id: string;
  status: string;
  courseId?: string;
  expiresAt?: number;
};

type Member = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  orgUnitId?: string | null;
  isOrgAdmin?: boolean;
  license: License | null;
};

type OrgUnit = { id: string; name: string; level: number; status: string };

interface Props {
  orgId: string;
  usedSeats: number;
  maxSeats: number;
  isSystemAdmin: boolean;
  onSeatsChanged: () => void;
}

export default function OrgMembersPanel({ orgId, usedSeats, maxSeats, isSystemAdmin, onSeatsChanged }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [addOrgUnitId, setAddOrgUnitId] = useState('');
  const [addIsOrgAdmin, setAddIsOrgAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [membersRes, unitsRes] = await Promise.all([
        fetch(`/api/organizations/${orgId}/members`),
        fetch(`/api/org-units?orgId=${encodeURIComponent(orgId)}`)
      ]);
      const membersData = await membersRes.json();
      const unitsData = await unitsRes.json();
      if (!membersRes.ok || !membersData.ok) throw new Error(membersData?.error || '無法載入成員');
      setMembers(membersData.members || []);
      setOrgUnits((unitsData.orgUnits || []).filter((u: OrgUnit) => u.status === 'active'));
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

  const seatsFull = usedSeats >= maxSeats;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          orgUnitId: addOrgUnitId || undefined,
          isOrgAdmin: addIsOrgAdmin
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '加入成員失敗');
      setEmail('');
      setAddOrgUnitId('');
      setAddIsOrgAdmin(false);
      await load();
      onSeatsChanged();
    } catch (err: any) {
      setAddError(err?.message || String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOrgUnitChange(member: Member, orgUnitId: string) {
    try {
      const res = await fetch(`/api/organizations/${orgId}/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgUnitId: orgUnitId || null })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '更新部門失敗');
      await load();
    } catch (err: any) {
      alert(err?.message || String(err));
    }
  }

  async function handleToggleOrgAdmin(member: Member) {
    try {
      const res = await fetch(`/api/organizations/${orgId}/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOrgAdmin: !member.isOrgAdmin })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '更新管理員狀態失敗');
      await load();
    } catch (err: any) {
      alert(err?.message || String(err));
    }
  }

  async function handleRemove(member: Member) {
    const name = `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.email;
    if (!confirm(`確定要將「${name}」移出組織嗎？此動作會釋放其席次。`)) return;
    try {
      const res = await fetch(`/api/organizations/${orgId}/members/${member.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '移除失敗');
      await load();
      onSeatsChanged();
    } catch (err: any) {
      alert(err?.message || String(err));
    }
  }

  return (
    <div>
      <h3>成員</h3>

      <form
        onSubmit={handleAdd}
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
          type="email"
          required
          placeholder="以 Email 加入現有使用者"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={seatsFull}
          style={{ padding: 6, minWidth: 220 }}
        />
        <select value={addOrgUnitId} onChange={(e) => setAddOrgUnitId(e.target.value)} disabled={seatsFull} style={{ padding: 6 }}>
          <option value="">（未分配部門）</option>
          {orgUnits.map((u) => (
            <option key={u.id} value={u.id}>
              {'　'.repeat(u.level)}{u.name}
            </option>
          ))}
        </select>
        {isSystemAdmin && (
          <label style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={addIsOrgAdmin}
              onChange={(e) => setAddIsOrgAdmin(e.target.checked)}
              disabled={seatsFull}
            />{' '}
            設為組織管理員
          </label>
        )}
        <button type="submit" disabled={submitting || seatsFull} style={btn('#4caf50')}>
          + 加入成員
        </button>
        {seatsFull && <span style={{ color: '#f44336', fontSize: 13 }}>席次已滿（{usedSeats}/{maxSeats}），請先釋放或提高席次上限</span>}
        {addError && <span style={{ color: '#d32f2f' }}>{addError}</span>}
      </form>

      {error && <p style={{ color: '#d32f2f' }}>{error}</p>}
      {loading && <p>載入中...</p>}
      {!loading && members.length === 0 && <p style={{ color: '#999' }}>尚無成員</p>}

      {!loading && members.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', border: '2px solid #ccc', width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>姓名</th>
                <th style={th}>Email</th>
                <th style={th}>角色</th>
                <th style={th}>部門</th>
                <th style={th}>組織管理員</th>
                <th style={th}>授權狀態</th>
                <th style={th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td style={td}>{`${m.firstName || ''} ${m.lastName || ''}`.trim() || '-'}</td>
                  <td style={td}>{m.email}</td>
                  <td style={td}>{m.role}</td>
                  <td style={td}>
                    <select
                      value={m.orgUnitId || ''}
                      onChange={(e) => handleOrgUnitChange(m, e.target.value)}
                      style={{ padding: 4 }}
                    >
                      <option value="">（未分配）</option>
                      {orgUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {'　'.repeat(u.level)}{u.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={td}>
                    <input
                      type="checkbox"
                      checked={!!m.isOrgAdmin}
                      disabled={!isSystemAdmin}
                      onChange={() => handleToggleOrgAdmin(m)}
                    />
                  </td>
                  <td style={td}>
                    {m.license ? (
                      <span style={{ color: '#4caf50', fontWeight: 'bold' }}>{m.license.status}</span>
                    ) : (
                      <span style={{ color: '#999' }}>無</span>
                    )}
                  </td>
                  <td style={td}>
                    <button onClick={() => handleRemove(m)} style={btn('#f44336')}>
                      移除
                    </button>
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

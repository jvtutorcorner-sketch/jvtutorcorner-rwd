"use client";

import { useEffect, useState } from "react";

type OrgUnit = {
  id: string;
  orgId: string;
  name: string;
  parentId?: string | null;
  path: string;
  level: number;
  managerId?: string;
  description?: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
};

interface Props {
  orgId: string;
}

export default function OrgUnitTreePanel({ orgId }: Props) {
  const [units, setUnits] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newUnitParentId, setNewUnitParentId] = useState<string | null | 'ROOT'>(null);
  const [newUnitName, setNewUnitName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/org-units?orgId=${encodeURIComponent(orgId)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '無法載入組織單位');
      setUnits(data.orgUnits || []);
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

  const visibleUnits = showArchived ? units : units.filter((u) => u.status === 'active');
  const roots = visibleUnits.filter((u) => !u.parentId || !visibleUnits.some((p) => p.id === u.parentId));

  function childrenOf(parentId: string) {
    return visibleUnits.filter((u) => u.parentId === parentId);
  }

  function isDescendant(unit: OrgUnit, candidateId: string) {
    const candidate = units.find((u) => u.id === candidateId);
    if (!candidate) return false;
    return candidate.path.startsWith(`${unit.path}/`);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newUnitName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/org-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          name: newUnitName.trim(),
          parentId: newUnitParentId === 'ROOT' || newUnitParentId === null ? null : newUnitParentId
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '建立部門失敗');
      setNewUnitName('');
      await load();
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(unit: OrgUnit) {
    setEditingId(unit.id);
    setEditName(unit.name);
    setEditDescription(unit.description || '');
  }

  async function saveEdit(unit: OrgUnit) {
    setBusy(true);
    try {
      const res = await fetch(`/api/org-units/${unit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), description: editDescription })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '更新失敗');
      setEditingId(null);
      await load();
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleMove(unit: OrgUnit, newParentId: string | null) {
    setBusy(true);
    try {
      const res = await fetch(`/api/org-units/${unit.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newParentId })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '搬移失敗');
      setMovingId(null);
      await load();
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(unit: OrgUnit) {
    const nextStatus = unit.status === 'active' ? 'archived' : 'active';
    if (nextStatus === 'archived' && !confirm(`確定要封存部門「${unit.name}」嗎？`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/org-units/${unit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || '操作失敗');
      await load();
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  function renderUnit(unit: OrgUnit): React.ReactNode {
    const isEditing = editingId === unit.id;
    const isMoving = movingId === unit.id;
    return (
      <div key={unit.id} style={{ marginLeft: unit.level * 24, marginBottom: 6 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            backgroundColor: unit.status === 'archived' ? '#f5f5f5' : '#fff',
            border: '1px solid #ddd',
            borderRadius: 4,
            opacity: unit.status === 'archived' ? 0.6 : 1
          }}
        >
          <span style={{ color: '#999' }}>{unit.level > 0 ? '└─' : '●'}</span>
          {isEditing ? (
            <>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ padding: 4 }} />
              <input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="描述"
                style={{ padding: 4, flex: 1 }}
              />
              <button onClick={() => saveEdit(unit)} disabled={busy} style={btnSmall('#4caf50')}>
                儲存
              </button>
              <button onClick={() => setEditingId(null)} style={btnSmall('#9e9e9e')}>
                取消
              </button>
            </>
          ) : (
            <>
              <strong>{unit.name}</strong>
              {unit.description && <span style={{ color: '#777', fontSize: 12 }}>{unit.description}</span>}
              {unit.status === 'archived' && <span style={{ fontSize: 11, color: '#f44336' }}>（已封存）</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={() => startEdit(unit)} style={btnSmall('#2196f3')}>
                  編輯
                </button>
                <button onClick={() => setMovingId(isMoving ? null : unit.id)} style={btnSmall('#ff9800')}>
                  移動
                </button>
                <button onClick={() => toggleArchive(unit)} style={btnSmall(unit.status === 'active' ? '#f44336' : '#4caf50')}>
                  {unit.status === 'active' ? '封存' : '恢復'}
                </button>
              </span>
            </>
          )}
        </div>
        {isMoving && (
          <div style={{ marginLeft: 20, marginTop: 4, padding: 8, backgroundColor: '#fff8e1', borderRadius: 4 }}>
            <label>
              移動到：
              <select
                defaultValue=""
                onChange={(e) => handleMove(unit, e.target.value === 'ROOT' ? null : e.target.value)}
                style={{ marginLeft: 8, padding: 4 }}
              >
                <option value="" disabled>
                  選擇新的上層部門
                </option>
                <option value="ROOT">（頂層）</option>
                {units
                  .filter((u) => u.id !== unit.id && !isDescendant(unit, u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {'　'.repeat(u.level)}{u.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
        {childrenOf(unit.id).map((child) => renderUnit(child))}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>組織單位</h3>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> 顯示已封存
        </label>
      </div>

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={newUnitParentId === null ? 'ROOT' : newUnitParentId}
          onChange={(e) => setNewUnitParentId(e.target.value === 'ROOT' ? 'ROOT' : e.target.value)}
          style={{ padding: 6 }}
        >
          <option value="ROOT">（頂層）新增部門於</option>
          {units
            .filter((u) => u.status === 'active')
            .map((u) => (
              <option key={u.id} value={u.id}>
                {'　'.repeat(u.level)}{u.name}
              </option>
            ))}
        </select>
        <input
          value={newUnitName}
          onChange={(e) => setNewUnitName(e.target.value)}
          placeholder="新部門名稱"
          style={{ padding: 6, flex: 1, minWidth: 160 }}
        />
        <button type="submit" disabled={busy} style={btnSmall('#4caf50')}>
          + 新增子部門
        </button>
      </form>

      {error && <p style={{ color: '#d32f2f' }}>{error}</p>}
      {loading && <p>載入中...</p>}
      {!loading && roots.length === 0 && <p style={{ color: '#999' }}>尚無部門</p>}
      {!loading && roots.map((unit) => renderUnit(unit))}
    </div>
  );
}

function btnSmall(color: string): React.CSSProperties {
  return {
    padding: '3px 10px',
    backgroundColor: color,
    color: 'white',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12
  };
}

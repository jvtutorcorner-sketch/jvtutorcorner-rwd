"use client";

import React, { useEffect, useState } from 'react';

type PagePermission = { roleId: string; roleName: string; menuVisible: boolean; dropdownVisible: boolean; pageVisible: boolean };
type PageConfig = { id: string; path: string; label?: string; permissions: PagePermission[] };
type Role = { id: string; name: string; description?: string; isActive: boolean };
type Settings = { pageConfigs: PageConfig[] } & Record<string, any>;

export default function RolesUsage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newActive, setNewActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingDesc, setEditingDesc] = useState('');

  function generateIdFromName(name: string, existing: Role[]) {
    const base = name.trim().toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '')
      .replace(/\-+/g, '-')
      .replace(/^\-+|\-+$/g, '');
    let id = base || `role-${Date.now()}`;
    let suffix = 1;
    while (existing.some(r => r.id === id)) {
      id = `${base}-${suffix++}`;
    }
    return id;
  }

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const r = await fetch('/api/admin/roles');
      const rr = await r.json();
      if (r.ok && rr.ok) setRoles(rr.roles || []);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  }

  async function saveRoles(updated: Role[]) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roles: updated }) });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'save failed');
      setRoles(updated);
      // dispatch change event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('tutor:roles-changed'));
      }

      // Attempt to also sync roles into admin_settings as a fallback persistence
      try {
        const sres = await fetch('/api/admin/settings');
        const sdata = await sres.json().catch(() => null);
        if (sres.ok && sdata && sdata.ok && sdata.settings) {
          const merged = { ...sdata.settings, roles: updated };
          await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(merged) });
        }
      } catch (syncErr) {
        console.warn('Failed to sync roles into settings fallback:', syncErr);
      }

      if (typeof window !== 'undefined') {
        alert('儲存成功');
      }
    } catch (err) {
      console.error(err);
      alert('儲存角色失敗: ' + String(err));
    } finally { setSaving(false); }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading roles…</div>;

  return (
    <div style={{ padding: 16 }}>
      <h2>角色管理</h2>

      <div style={{ marginTop: 12, marginBottom: 12, padding: 8, background: '#f8f9fa', border: '1px solid #ddd' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="顯示名稱" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ padding: 6, minWidth: 140 }} />
          <input placeholder="描述 (選填)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} style={{ padding: 6, minWidth: 200 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={newActive} onChange={(e) => setNewActive(e.target.checked)} />啟用</label>
          <button onClick={async () => {
            const name = (newName || '').trim();
            if (!name) return alert('請輸入顯示名稱');
            const id = generateIdFromName(name, roles);
            const updated = [...roles, { id, name, description: newDesc || undefined, isActive: !!newActive }];
            await saveRoles(updated);
            setNewName(''); setNewDesc(''); setNewActive(true);
          }}>新增角色</button>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #ccc' }}>
          <thead>
            <tr style={{ background: '#f7f7f7' }}>
              <th style={{ textAlign: 'left', padding: 8, border: '2px solid #ccc' }}>ID</th>
              <th style={{ textAlign: 'left', padding: 8, border: '2px solid #ccc' }}>名稱</th>
              <th style={{ textAlign: 'left', padding: 8, border: '2px solid #ccc' }}>描述</th>
              <th style={{ padding: 8, border: '2px solid #ccc' }}>狀態</th>
              <th style={{ padding: 8, border: '2px solid #ccc' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {roles.map(r => (
              <tr key={r.id}>
                <td style={{ padding: 8, border: '2px solid #ccc' }}>{r.id}</td>
                <td style={{ padding: 8, border: '2px solid #ccc' }}>
                  {editingId === r.id ? (
                    <input value={editingName} onChange={(e) => setEditingName(e.target.value)} style={{ padding: 6, minWidth: 160 }} />
                  ) : (
                    r.name
                  )}
                </td>
                <td style={{ padding: 8, border: '2px solid #ccc' }}>
                  {editingId === r.id ? (
                    <input value={editingDesc} onChange={(e) => setEditingDesc(e.target.value)} style={{ padding: 6, minWidth: 200 }} />
                  ) : (
                    r.description || '-'
                  )}
                </td>
                <td style={{ padding: 8, textAlign: 'center', border: '2px solid #ccc' }}>
                  <input
                    type="checkbox"
                    checked={!!r.isActive}
                    onChange={(e) => {
                      const updated = roles.map(x => x.id === r.id ? { ...x, isActive: e.target.checked } : x);
                      setRoles(updated);
                    }}
                  />
                </td>
                <td style={{ padding: 8, textAlign: 'center', border: '2px solid #ccc' }}>
                  {editingId === r.id ? (
                    <>
                      <button onClick={async () => {
                        const updated = roles.map(x => x.id === r.id ? { ...x, name: editingName.trim() || x.name, description: editingDesc || undefined } : x);
                        await saveRoles(updated);
                        setEditingId(null); setEditingName(''); setEditingDesc('');
                      }} style={{ marginRight: 8 }}>儲存</button>
                      <button onClick={() => { setEditingId(null); setEditingName(''); setEditingDesc(''); }}>取消</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => {
                        if (!confirm(`確定要編輯角色 ${r.name} (${r.id}) 嗎？`)) return;
                        setEditingId(r.id);
                        setEditingName(r.name || '');
                        setEditingDesc(r.description || '');
                      }} style={{ marginRight: 8 }}>編輯</button>
                      <button onClick={async () => {
                        if (!confirm(`確定要刪除角色 ${r.name} (${r.id}) 嗎？此操作會移除角色定義，但不會自動調整現有 page 權限。`)) return;
                        const updated = roles.filter(x => x.id !== r.id);
                        await saveRoles(updated);
                      }} style={{ color: 'crimson' }}>刪除</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={() => saveRoles(roles)} disabled={saving}>{saving ? '儲存中…' : '儲存變更'}</button>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from 'react';

type PagePermission = { roleId: string; roleName: string; menuVisible: boolean; dropdownVisible?: boolean; pageVisible?: boolean };
type PageConfig = { id: string; path: string; label?: string; permissions: PagePermission[] };
type Role = { id: string; name: string; description?: string; isActive: boolean };
type Settings = { pageConfigs: PageConfig[] } & Record<string, any>;

export default function MenuSettings({ 
  settings: propsSettings, 
  roles: propsRoles, 
  pathFilter 
}: { 
  settings?: any; 
  roles?: any[];
  pathFilter?: (path: string) => boolean;
} = {}) {
  const [internalSettings, setInternalSettings] = useState<Settings | null>(null);
  const [internalRoles, setInternalRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (propsSettings && propsRoles) {
      setInternalSettings(propsSettings);
      setInternalRoles(propsRoles);
      setLoading(false);
    } else {
      load();
    }
  }, [propsSettings, propsRoles]);

  async function load() {
    try {
      const s = await fetch('/api/admin/settings');
      const rs = await s.json();
      const r = await fetch('/api/admin/roles');
      const rr = await r.json();
      if (s.ok) setInternalSettings(rs.settings || rs);
      if (r.ok) setInternalRoles(rr.roles || rr);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  }

  async function save() {
    if (!internalSettings) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(internalSettings) });
      const data = await res.json();
      if (!res.ok) console.warn('save failed', data);
      else {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('tutor:admin-settings-changed'));
          alert('儲存成功');
        }
      }
    } finally { setSaving(false); }
  }

  if (loading || !internalSettings) return <div style={{ padding: 16 }}>Loading Menu settings…</div>;

  const pages = internalSettings.pageConfigs || [];

  return (
    <div style={{ padding: 16 }}>
      <h2>Menu 設定</h2>
      <div style={{ marginTop: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, border: '1px solid #ddd' }}>
          <thead>
            <tr style={{ background: '#f7f7f7' }}>
              <th style={{ padding: 8 }}>頁面</th>
              {internalRoles.filter(r => r.isActive).map(r => <th key={r.id} style={{ padding: 8 }}>{r.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {pages
              .filter(p => pathFilter ? pathFilter(p.path) : true)
              .map(p => (
              <tr key={p.path}>
                <td style={{ padding: 8 }}>{p.label || p.path}</td>
                {internalRoles.filter(r => r.isActive).map(role => {
                  const perm = p.permissions.find((pp: PagePermission) => pp.roleId === role.id);
                  return (
                    <td key={role.id} style={{ padding: 8, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!perm?.menuVisible}
                        onChange={(e) => {
                          setInternalSettings(prev => {
                            if (!prev) return prev;
                            const updated = prev.pageConfigs.map((pc: PageConfig) => {
                              if (pc.path !== p.path) return pc;
                              const permissions = pc.permissions.map(perm => perm.roleId === role.id ? { ...perm, menuVisible: e.target.checked } : perm);
                              return { ...pc, permissions };
                            });
                            return { ...prev, pageConfigs: updated };
                          });
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={save} disabled={saving}>{saving ? '儲存中…' : '儲存 Menu'}</button>
      </div>
    </div>
  );
}

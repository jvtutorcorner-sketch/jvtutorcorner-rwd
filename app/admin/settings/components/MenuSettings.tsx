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
    console.log('[MenuSettings] 開始儲存 Menu 可見性設定...');
    console.log('[MenuSettings] 儲存的資料:', internalSettings);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(internalSettings) });
      const data = await res.json();
      if (!res.ok) {
        console.error('[MenuSettings] 儲存失敗:', data);
      } else {
        console.log('[MenuSettings] 儲存成功！', data);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('tutor:admin-settings-changed'));
          alert('儲存成功');
        }
      }
    } catch (err: any) {
      console.error('[MenuSettings] 發生錯誤:', err);
    } finally {
      setSaving(false);
      console.log('[MenuSettings] 儲存流程結束');
    }
  }

  if (loading || !internalSettings) return <div style={{ padding: 16 }}>Loading Menu settings…</div>;

  const pages = internalSettings.pageConfigs || [];

  return (
    <div style={{ padding: 16, border: '1px solid #eee', borderRadius: 8, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>Menu 可見性設定</h3>
        <button onClick={save} disabled={saving} style={{ padding: '6px 16px', background: '#2563eb', color: 'white', borderRadius: 6, border: 'none', cursor: 'pointer' }}>
          {saving ? '儲存中...' : '儲存變更'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
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
                  <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                    <div style={{ fontWeight: 'bold' }}>{p.label || p.path}</div>
                    <div style={{ fontSize: 12, color: '#999', fontFamily: 'monospace' }}>{p.path}</div>
                  </td>
                  {internalRoles.filter(r => r.isActive).map(role => {
                    const perm = p.permissions.find((pp: PagePermission) => pp.roleId === role.id);
                    const isPageVisible = perm?.pageVisible !== false; // Default to true if undefined
                    const isDisabled = !isPageVisible;

                    return (
                      <td key={role.id} style={{ padding: 8, textAlign: 'center', borderBottom: '1px solid #eee', background: isDisabled ? '#f5f5f5' : 'transparent' }}>
                        <input
                          type="checkbox"
                          checked={isPageVisible && !!perm?.menuVisible}
                          disabled={isDisabled}
                          style={{
                            transform: 'scale(1.2)',
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            opacity: isDisabled ? 0.4 : 1
                          }}
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
      <p style={{ marginTop: 12, fontSize: 13, color: '#666' }}>
        * 勾選表示該角色可以在主選單看到此項目。未勾選則不顯示於選單中。
      </p>
    </div>
  );
}

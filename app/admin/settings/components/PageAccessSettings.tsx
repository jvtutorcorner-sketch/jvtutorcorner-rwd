"use client";

import React, { useEffect, useState } from 'react';

type PagePermission = { roleId: string; roleName: string; menuVisible?: boolean; dropdownVisible?: boolean; pageVisible?: boolean };
type PageConfig = { id: string; path: string; label?: string; permissions: PagePermission[] };
type Role = { id: string; name: string; description?: string; isActive: boolean };
type Settings = { pageConfigs: PageConfig[] } & Record<string, any>;

export default function PageAccessSettings({
  settings: propsSettings,
  setSettings: propsSetSettings,
  roles: propsRoles,
  pathFilter
}: {
  settings?: any;
  setSettings?: React.Dispatch<React.SetStateAction<any>>;
  roles?: any[];
  pathFilter?: (path: string) => boolean;
} = {}) {
  const [internalSettings, setInternalSettings] = useState<Settings | null>(null);
  const [internalRoles, setInternalRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialSettings, setInitialSettings] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);

  // Monitor for changes
  useEffect(() => {
    if (initialSettings && internalSettings) {
      const currentState = JSON.stringify(internalSettings);
      setHasChanges(currentState !== initialSettings);
    }
  }, [internalSettings, initialSettings]);

  useEffect(() => {
    async function load() {
      try {
        if (propsSettings) {
          setInternalSettings(propsSettings);
          setInitialSettings(JSON.stringify(propsSettings));
        }
        else {
          const res = await fetch('/api/admin/settings');
          const data = await res.json();
          if (res.ok) {
            const settings = data.settings || data;
            setInternalSettings(settings);
            setInitialSettings(JSON.stringify(settings));
          }
        }

        if (propsRoles) setInternalRoles(propsRoles);
        else {
          const res = await fetch('/api/admin/roles');
          const data = await res.json();
          if (res.ok) setInternalRoles(data.roles || data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [propsSettings, propsRoles]);

  async function save() {
    if (!internalSettings) return;
    console.log('[PageAccessSettings] 開始儲存頁面存取權限...');
    console.log('[PageAccessSettings] 儲存的資料:', internalSettings);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(internalSettings) });
      const data = await res.json();
      if (!res.ok) {
        console.error('[PageAccessSettings] 儲存失敗:', data);
      } else {
        console.log('[PageAccessSettings] 儲存成功！', data);
        // Update initial state after successful save
        const savedSettings = data.settings || internalSettings;
        setInternalSettings(savedSettings);
        setInitialSettings(JSON.stringify(savedSettings));
        setHasChanges(false);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('tutor:admin-settings-changed'));
          alert('儲存成功');
        }
      }
    } catch (err: any) {
      console.error('[PageAccessSettings] 發生錯誤:', err);
    } finally {
      setSaving(false);
      console.log('[PageAccessSettings] 儲存流程結束');
    }
  }

  if (loading || !internalSettings) return <div style={{ padding: 16 }}>Loading Access settings…</div>;

  const pages = internalSettings.pageConfigs || [];
  // Ensure we sort pages or just take them as is.
  const filteredPages = pages.filter(p => pathFilter ? pathFilter(p.path) : true);

  if (filteredPages.length === 0) {
    return (
      <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8, background: '#f9f9f9', color: '#666' }}>
        無法找到符合條件的頁面 (Path not found in config)
      </div>
    );
  }

  return (
    <div style={{ padding: 16, border: '1px solid #eee', borderRadius: 8, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>頁面存取權限列表</h3>
        <button onClick={save} disabled={saving || !hasChanges} style={{ padding: '6px 16px', background: !hasChanges ? '#cbd5e1' : '#2563eb', color: 'white', borderRadius: 6, border: 'none', cursor: !hasChanges ? 'not-allowed' : 'pointer', opacity: !hasChanges ? 0.6 : 1 }}>
          {saving ? '儲存中...' : '儲存變更'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, border: '1px solid #ddd' }}>
          <thead>
            <tr style={{ background: '#f7f7f7' }}>
              <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>頁面</th>
              {internalRoles.filter(r => r.isActive).map(r => <th key={r.id} style={{ padding: 8, borderBottom: '1px solid #ddd', minWidth: 80 }}>{r.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {filteredPages.map(p => (
              <tr key={p.path} className="hover:bg-gray-50">
                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                  <div style={{ fontWeight: 'bold' }}>{p.label || p.path}</div>
                  <div style={{ fontSize: 12, color: '#999', fontFamily: 'monospace' }}>{p.path}</div>
                </td>
                {internalRoles.filter(r => r.isActive).map(role => {
                  const perm = p.permissions.find((pp: PagePermission) => pp.roleId === role.id);
                  // If permission object missing, assume allowed or disallowed? Default usually allowed if not managed, 
                  // but here we are managing it. Let's assume false if strict, or use the value.
                  // For "pageVisible", if undefined, maybe default true? 
                  // In logic below, `!!perm?.pageVisible` forces boolean.
                  return (
                    <td key={role.id} style={{ padding: 8, textAlign: 'center', borderBottom: '1px solid #eee' }}>
                      <input
                        type="checkbox"
                        checked={perm?.pageVisible !== false} // Default to true if undefined? Or strict explicit?
                        // If we want strict control: checked={!!perm?.pageVisible}
                        // But usually new pages might lack the property. 
                        // Let's use `perm?.pageVisible !== false` to mean "Visible unless explicitly set to false" 
                        // OR stick to existing pattern. 
                        // Checking `PageSettings.tsx`, default is `pageVisible: true`.
                        onChange={(e) => {
                          const updateFn = (prev: any) => {
                            if (!prev) return prev;
                            const updated = prev.pageConfigs.map((pc: PageConfig) => {
                              if (pc.path !== p.path) return pc;
                              // Ensure permission object exists
                              let newItemPermissions = [...pc.permissions];
                              const existingPermIndex = newItemPermissions.findIndex(pp => pp.roleId === role.id);

                              if (existingPermIndex >= 0) {
                                // When unchecking pageVisible, also uncheck menuVisible and dropdownVisible
                                if (!e.target.checked) {
                                  newItemPermissions[existingPermIndex] = {
                                    ...newItemPermissions[existingPermIndex],
                                    pageVisible: false,
                                    menuVisible: false,
                                    dropdownVisible: false
                                  };
                                } else {
                                  newItemPermissions[existingPermIndex] = {
                                    ...newItemPermissions[existingPermIndex],
                                    pageVisible: true
                                  };
                                }
                              } else {
                                // If role missing in permissions, add it
                                newItemPermissions.push({
                                  roleId: role.id,
                                  roleName: role.name,
                                  pageVisible: e.target.checked,
                                  menuVisible: false,
                                  dropdownVisible: false
                                });
                              }
                              return { ...pc, permissions: newItemPermissions };
                            });
                            return { ...prev, pageConfigs: updated };
                          };

                          setInternalSettings(updateFn);
                          if (propsSetSettings) propsSetSettings(updateFn);
                        }}
                        style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
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
        * 勾選表示該角色可以訪問此頁面 (Page Visible)。若未勾選，使用者訪問時將顯示 403 無權限或被重導向。
      </p>
    </div>
  );
}

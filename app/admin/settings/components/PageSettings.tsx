"use client";

import React, { useEffect, useState } from 'react';

type PagePermission = { roleId: string; roleName: string; menuVisible?: boolean; dropdownVisible?: boolean; pageVisible: boolean };
type PageConfig = { id: string; path: string; label?: string; permissions: PagePermission[] };
type Role = { id: string; name: string; description?: string; isActive: boolean };
type Settings = { pageConfigs: PageConfig[] } & Record<string, any>;

export default function PageSettings({ 
  settings, 
  setSettings, 
  roles,
  pathFilter,
  allowAddRemove = true
}: { 
  settings: any | null; 
  setSettings: React.Dispatch<React.SetStateAction<any | null>>; 
  roles: any[];
  pathFilter?: (path: string) => boolean;
  allowAddRemove?: boolean;
}) {
  const [newPath, setNewPath] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [checkingPath, setCheckingPath] = useState<string | null>(null);

  function addPage() {
    if (!settings) return;
    const path = (newPath || '').trim();
    if (!path) return alert('請輸入頁面路徑');
    if (settings.pageConfigs.some((pc: PageConfig) => pc.path === path)) return alert('頁面已存在');
    const defaultPerms = (roles || []).filter((r: Role) => r.isActive).map((r: Role) => ({ roleId: r.id, roleName: r.name, menuVisible: false, dropdownVisible: false, pageVisible: true }));
    const newPage: PageConfig = { id: path, path, label: newLabel || path, permissions: defaultPerms };
    setSettings((prev: Settings | null) => prev ? { ...prev, pageConfigs: [...prev.pageConfigs, newPage] } : prev);
    setNewPath(''); setNewLabel('');
  }

  function removePage(path: string) {
    if (!settings) return;
    const ok = confirm(`確定要刪除頁面 ${path} 嗎？此操作無法復原。`);
    if (!ok) return;
    setSettings((prev: Settings | null) => prev ? { ...prev, pageConfigs: prev.pageConfigs.filter((pc: PageConfig) => pc.path !== path) } : prev);
  }

  function startEdit(p: PageConfig) {
    const ok = confirm(`確定要編輯 ${p.path} 的標籤嗎？`);
    if (!ok) return;
    setEditingPath(p.path);
    setEditingLabel(p.label || '');
  }

  function cancelEdit() {
    setEditingPath(null);
    setEditingLabel('');
  }

  function saveEdit(path: string) {
    if (!settings) return;
    const label = (editingLabel || '').trim();
    setSettings((prev: Settings | null) => prev ? {
      ...prev,
      pageConfigs: prev.pageConfigs.map(pc => pc.path === path ? { ...pc, label: label || pc.path } : pc)
    } : prev);
    setEditingPath(null);
    setEditingLabel('');
  }

  function checkLink(path: string) {
    setCheckingPath(path);
    try {
      const win = window.open(path, '_blank');
      if (!win) {
        alert('無法開啟新分頁，請允許彈出視窗或檢查瀏覽器設定。');
      }
    } catch (err) {
      console.error(err);
      alert(`無法開啟連結：${String(err)}`);
    } finally {
      // 小延遲讓按鈕回復可點狀態
      setTimeout(() => setCheckingPath(null), 500);
    }
  }

  if (!settings) return <div style={{ padding: 16 }}>Loading Page settings…</div>;

  return (
    <div style={{ padding: 16 }}>
      <h2>管理 Pages{allowAddRemove ? '（僅新增 / 刪除）' : ''}</h2>
      {allowAddRemove && (
        <div style={{ marginTop: 12, marginBottom: 16, padding: 8, background: '#f8f9fa', border: '1px solid #ddd' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input placeholder="/example-path" value={newPath} onChange={(e) => setNewPath(e.target.value)} style={{ padding: 6, minWidth: 180 }} />
            <input placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} style={{ padding: 6, minWidth: 140 }} />
            <button onClick={addPage}>新增 Page</button>
            <span style={{ marginLeft: 12, color: '#666' }}>使用上方「儲存設定」按鈕儲存變更。</span>
          </div>
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #ccc' }}>
          <thead>
            <tr style={{ background: '#f7f7f7' }}>
              <th style={{ textAlign: 'left', padding: 8, border: '2px solid #ccc' }}>Label</th>
              <th style={{ textAlign: 'left', padding: 8, border: '2px solid #ccc' }}>Path</th>
              <th style={{ padding: 8, border: '2px solid #ccc' }}>檢查連結</th>
              {allowAddRemove && <th style={{ padding: 8, border: '2px solid #ccc' }}>操作</th>}
            </tr>
          </thead>
          <tbody>
            {settings.pageConfigs
              .filter((p: PageConfig) => pathFilter ? pathFilter(p.path) : true)
              .map((p: PageConfig) => (
              <tr key={p.path}>
                <td style={{ padding: 8, border: '2px solid #ccc' }}>
                  {editingPath === p.path ? (
                    <input value={editingLabel} onChange={(e) => setEditingLabel(e.target.value)} style={{ padding: 6, minWidth: 180 }} />
                  ) : (
                    p.label
                  )}
                </td>
                <td style={{ padding: 8, border: '2px solid #ccc' }}>{p.path}</td>
                <td style={{ padding: 8, border: '2px solid #ccc', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button onClick={() => checkLink(p.path)} disabled={checkingPath === p.path}>{checkingPath === p.path ? '檢查中…' : '檢查連結'}</button>
                  </div>
                </td>
                {allowAddRemove && (
                  <td style={{ padding: 8, textAlign: 'center', border: '2px solid #ccc' }}>
                    {editingPath === p.path ? (
                      <>
                        <button onClick={() => saveEdit(p.path)} style={{ marginRight: 8 }}>儲存標籤</button>
                        <button onClick={cancelEdit}>取消</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(p)} style={{ marginRight: 8 }}>編輯</button>
                        <button onClick={() => removePage(p.path)} style={{ color: 'crimson' }}>刪除</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

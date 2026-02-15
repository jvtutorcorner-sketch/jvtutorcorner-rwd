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
  const [editingPathValue, setEditingPathValue] = useState('');
  const [checkingPath, setCheckingPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  async function save() {
    if (!settings) return;
    console.log('💾 [PageSettings] 開始儲存頁面設定...');
    console.log('📋 [PageSettings] pageConfigs 順序:', settings.pageConfigs?.map((p: any) => p.path));
    console.log('📦 [PageSettings] 完整儲存資料:', settings);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('❌ [PageSettings] 儲存失敗:', data);
        alert('儲存失敗：' + (data?.error || '未知錯誤'));
      } else {
        console.log('✅ [PageSettings] 儲存成功！', data);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('tutor:admin-settings-changed'));
          alert('儲存成功！');
        }
      }
    } catch (err: any) {
      console.error('❌ [PageSettings] 網路錯誤:', err);
      alert('網路錯誤：' + (err?.message || String(err)));
    } finally {
      setSaving(false);
      console.log('🏁 [PageSettings] 儲存流程結束');
    }
  }

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
    const ok = confirm(`確定要編輯 ${p.path} 的設定嗎？`);
    if (!ok) return;
    setEditingPath(p.path);
    setEditingLabel(p.label || '');
    setEditingPathValue(p.path);
  }

  function cancelEdit() {
    setEditingPath(null);
    setEditingLabel('');
    setEditingPathValue('');
  }

  function saveEdit(oldPath: string) {
    if (!settings) return;
    const label = (editingLabel || '').trim();
    const newPath = (editingPathValue || '').trim();
    if (!newPath) return alert('路徑不能為空');

    setSettings((prev: Settings | null) => prev ? {
      ...prev,
      pageConfigs: prev.pageConfigs.map(pc => pc.path === oldPath ? { ...pc, label: label || pc.path, path: newPath } : pc)
    } : prev);
    setEditingPath(null);
    setEditingLabel('');
    setEditingPathValue('');
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
      setTimeout(() => setCheckingPath(null), 500);
    }
  }

  function handleDragStart(e: React.DragEvent, path: string) {
    setDraggingPath(path);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', path);
  }

  function handleDragOver(e: React.DragEvent, path: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggingPath && draggingPath !== path) {
      setDragOverPath(path);
    }
  }

  function handleDragLeave() {
    setDragOverPath(null);
  }

  function handleDrop(e: React.DragEvent, targetPath: string) {
    e.preventDefault();
    if (!settings || !draggingPath || draggingPath === targetPath) {
      setDraggingPath(null);
      setDragOverPath(null);
      return;
    }

    console.log('🔄 [PageSettings] 開始拖曳排序...');
    console.log(`  拖曳項目: ${draggingPath}`);
    console.log(`  放置目標: ${targetPath}`);

    setSettings((prev: Settings | null) => {
      if (!prev) return prev;
      const allConfigs = [...prev.pageConfigs];
      const dragIndex = allConfigs.findIndex(p => p.path === draggingPath);
      const dropIndex = allConfigs.findIndex(p => p.path === targetPath);

      if (dragIndex === -1 || dropIndex === -1) return prev;

      console.log(`  原始位置: ${dragIndex}, 新位置: ${dropIndex}`);
      console.log('  排序前:', allConfigs.map(p => p.path));

      // Remove item from old position
      const [draggedItem] = allConfigs.splice(dragIndex, 1);
      // Insert at new position
      allConfigs.splice(dropIndex, 0, draggedItem);

      console.log('  排序後:', allConfigs.map(p => p.path));
      console.log('✅ [PageSettings] 拖曳排序完成，狀態已更新');

      return { ...prev, pageConfigs: allConfigs };
    });

    setDraggingPath(null);
    setDragOverPath(null);
  }

  function handleDragEnd() {
    setDraggingPath(null);
    setDragOverPath(null);
  }


  if (!settings) return <div style={{ padding: 16 }}>Loading Page settings…</div>;

  return (
    <div style={{ padding: 16, border: '1px solid #eee', borderRadius: 8, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>管理 Pages{allowAddRemove ? '（新增 / 刪除 / 編輯）' : ''}</h3>
        <button onClick={save} disabled={saving} style={{ padding: '6px 16px', background: '#2563eb', color: 'white', borderRadius: 6, border: 'none', cursor: 'pointer' }}>
          {saving ? '儲存中...' : '儲存變更'}
        </button>
      </div>
      {allowAddRemove && (
        <div style={{ marginTop: 12, marginBottom: 16, padding: 12, background: '#f8f9fa', border: '1px solid #ddd', borderRadius: 6 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              placeholder="/example-path"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              style={{
                padding: '8px 12px',
                minWidth: 200,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14
              }}
            />
            <input
              placeholder="頁面標籤"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              style={{
                padding: '8px 12px',
                minWidth: 160,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 14
              }}
            />
            <button
              onClick={addPage}
              style={{
                padding: '8px 16px',
                background: '#10b981',
                color: 'white',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              + 新增 Page
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
            💡 新增頁面後，請使用各區塊的「儲存變更」按鈕儲存。
          </div>
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #ccc' }}>
          <thead>
            <tr style={{ background: '#f7f7f7' }}>
              {allowAddRemove && <th style={{ padding: 8, border: '2px solid #ccc', width: '100px' }}>排序</th>}
              <th style={{ textAlign: 'left', padding: 8, border: '2px solid #ccc' }}>Label</th>
              <th style={{ textAlign: 'left', padding: 8, border: '2px solid #ccc' }}>Path</th>
              <th style={{ padding: 8, border: '2px solid #ccc' }}>檢查連結</th>
              {allowAddRemove && <th style={{ padding: 8, border: '2px solid #ccc' }}>操作</th>}
            </tr>
          </thead>
          <tbody>
            {settings.pageConfigs
              .filter((p: PageConfig) => pathFilter ? pathFilter(p.path) : true)
              .map((p: PageConfig, index: number, array: PageConfig[]) => (
                <tr
                  key={p.path}
                  draggable={allowAddRemove && editingPath === p.path}
                  onDragStart={(e) => handleDragStart(e, p.path)}
                  onDragOver={(e) => handleDragOver(e, p.path)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, p.path)}
                  onDragEnd={handleDragEnd}
                  style={{
                    opacity: draggingPath === p.path ? 0.5 : 1,
                    backgroundColor: dragOverPath === p.path ? '#e0f2fe' : 'transparent',
                    transition: 'background-color 0.2s',
                    cursor: allowAddRemove && editingPath === p.path ? 'move' : 'default'
                  }}
                >
                  {allowAddRemove && (
                    <td style={{ padding: 8, border: '2px solid #ccc', textAlign: 'center', background: editingPath === p.path ? '#fff7e6' : 'transparent' }}>
                      {editingPath === p.path ? (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'center',
                            cursor: 'move',
                            fontSize: 20,
                            color: '#6b7280',
                            userSelect: 'none'
                          }}
                          title="拖曳以重新排序"
                        >
                          ⋮⋮
                        </div>
                      ) : (
                        <span style={{ color: '#999', fontSize: 12 }}>—</span>
                      )}
                    </td>
                  )}
                  <td style={{ padding: 8, border: '2px solid #ccc', background: editingPath === p.path ? '#fff7e6' : 'transparent' }}>
                    {editingPath === p.path ? (
                      <input
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        style={{
                          padding: '8px 12px',
                          minWidth: 200,
                          width: '100%',
                          border: '2px solid #2563eb',
                          borderRadius: 4,
                          fontSize: 14,
                          background: '#fff',
                          outline: 'none'
                        }}
                        placeholder="輸入頁面標籤"
                      />
                    ) : (
                      p.label
                    )}
                  </td>
                  <td style={{ padding: 8, border: '2px solid #ccc', background: editingPath === p.path ? '#fff7e6' : 'transparent' }}>
                    {editingPath === p.path ? (
                      <input
                        value={editingPathValue}
                        onChange={(e) => setEditingPathValue(e.target.value)}
                        style={{
                          padding: '8px 12px',
                          minWidth: 200,
                          width: '100%',
                          border: '2px solid #2563eb',
                          borderRadius: 4,
                          fontSize: 14,
                          background: '#fff',
                          fontFamily: 'monospace',
                          outline: 'none'
                        }}
                        placeholder="/example-path"
                      />
                    ) : (
                      p.path
                    )}
                  </td>
                  <td style={{ padding: 8, border: '2px solid #ccc', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      <button
                        onClick={() => checkLink(p.path)}
                        disabled={checkingPath === p.path}
                        style={{
                          padding: '6px 12px',
                          background: checkingPath === p.path ? '#94a3b8' : '#2563eb',
                          color: 'white',
                          borderRadius: 6,
                          border: 'none',
                          cursor: checkingPath === p.path ? 'not-allowed' : 'pointer',
                          fontSize: 13,
                          fontWeight: 500,
                          opacity: checkingPath === p.path ? 0.6 : 1
                        }}
                      >
                        {checkingPath === p.path ? '🔍 檢查中...' : '🔗 檢查連結'}
                      </button>
                    </div>
                  </td>
                  {allowAddRemove && (
                    <td style={{ padding: 8, textAlign: 'center', border: '2px solid #ccc' }}>
                      {editingPath === p.path ? (
                        <>
                          <button
                            onClick={() => saveEdit(p.path)}
                            style={{
                              marginRight: 8,
                              padding: '6px 12px',
                              background: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: 4,
                              cursor: 'pointer',
                              fontWeight: 'bold'
                            }}
                          >
                            ✓ 儲存
                          </button>
                          <button
                            onClick={cancelEdit}
                            style={{
                              padding: '6px 12px',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: 4,
                              cursor: 'pointer',
                              fontWeight: 'bold'
                            }}
                          >
                            ✕ 取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(p)}
                            style={{
                              marginRight: 8,
                              padding: '6px 12px',
                              background: '#2563eb',
                              color: 'white',
                              border: 'none',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 13,
                              fontWeight: 500
                            }}
                          >
                            ✏️ 編輯
                          </button>
                          <button
                            onClick={() => removePage(p.path)}
                            style={{
                              padding: '6px 12px',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 13,
                              fontWeight: 500
                            }}
                          >
                            🗑️ 刪除
                          </button>
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

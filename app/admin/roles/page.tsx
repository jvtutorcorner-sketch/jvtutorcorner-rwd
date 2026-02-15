"use client";

import { useEffect, useState } from 'react';

type Role = {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  order?: number;
};

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [initialRoles, setInitialRoles] = useState<string>('');

  useEffect(() => {
    loadRoles();
  }, []);

  // 監控 roles 變化
  useEffect(() => {
    if (initialRoles && roles.length > 0) {
      const currentState = JSON.stringify(roles);
      setHasChanges(currentState !== initialRoles);
    }
  }, [roles, initialRoles]);

  async function loadRoles() {
    try {
      const res = await fetch('/api/admin/roles');
      const data = await res.json();
      if (res.ok && data.ok) {
        const loadedRoles = data.roles || [];
        setRoles(loadedRoles);
        // 記錄初始狀態
        setInitialRoles(JSON.stringify(loadedRoles));
        setHasChanges(false);
      }
    } catch (error) {
      console.error('Failed to load roles:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveRoles() {
    console.log('🔘 [Roles Page] 點擊「儲存設定」按鈕');
    console.log('📋 [Roles Page] 目前 roles:', roles);
    setSaving(true);
    setSaveMessage(null);
    try {
      // Add order to each role based on current position
      const rolesWithOrder = roles.map((role, index) => ({
        ...role,
        order: index
      }));
      
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: rolesWithOrder }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setRoles(data.roles);
        // 儲存成功後，更新初始狀態
        setInitialRoles(JSON.stringify(data.roles));
        setHasChanges(false);
        setSaveMessage('儲存成功');
        console.log('✅ [Roles Page] 儲存成功');
      } else {
        setSaveMessage('儲存失敗：' + (data?.error || res.statusText));
        console.error('❌ [Roles Page] 儲存失敗:', data?.error || res.statusText);
      }
    } catch (err: any) {
      setSaveMessage('網路錯誤：' + (err?.message || String(err)));
      console.error('❌ [Roles Page] 網路錯誤:', err);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }

  function addRole() {
    console.log('🔘 [Roles Page] 點擊「添加角色」按鈕');
    console.log('  新角色名稱:', newRoleName);
    console.log('  新角色描述:', newRoleDescription);

    if (!newRoleName.trim()) {
      console.warn('⚠️  [Roles Page] 角色名稱為空，取消添加');
      return;
    }

    const newRole: Role = {
      id: newRoleName.toLowerCase().replace(/\s+/g, '_'),
      name: newRoleName.trim(),
      description: newRoleDescription.trim(),
      isActive: false
    };

    // 检查角色名是否已存在
    if (roles.some(r => r.name.toLowerCase() === newRole.name.toLowerCase())) {
      console.warn('⚠️  [Roles Page] 角色名稱已存在:', newRole.name);
      alert('角色名稱已存在');
      return;
    }

    console.log('✅ [Roles Page] 添加新角色:', newRole);
    setRoles(prev => [...prev, newRole]);
    setNewRoleName('');
    setNewRoleDescription('');
  }

  function deleteRole(roleId: string) {
    console.log('🔘 [Roles Page] 點擊「刪除」按鈕，角色 ID:', roleId);

    if (!confirm('確定要刪除此角色嗎？這將移除所有相關的權限設定。')) {
      console.log('❌ [Roles Page] 用戶取消刪除');
      return;
    }

    // 不允许删除系统角色
    if (['admin', 'teacher', 'student'].includes(roleId)) {
      console.warn('⚠️  [Roles Page] 無法刪除系統角色:', roleId);
      alert('無法刪除系統預設角色');
      return;
    }

    console.log('✅ [Roles Page] 刪除角色:', roleId);
    setRoles(prev => prev.filter(r => r.id !== roleId));
    
    // 刪除後退出編輯模式
    setEditingRoleId(null);
    setEditingName('');
    setEditingDescription('');
  }

  function toggleRoleActive(roleId: string) {
    const role = roles.find(r => r.id === roleId);
    const newStatus = role ? !role.isActive : true;
    console.log(`🔘 [Roles Page] 點擊「${newStatus ? '啟用' : '停用'}」按鈕，角色:`, roleId);

    setRoles(prev => prev.map(r =>
      r.id === roleId ? { ...r, isActive: !r.isActive } : r
    ));
  }

  function editRole(role: Role) {
    console.log('🔘 [Roles Page] 點擊「編輯」按鈕，角色:', role);

    if (!confirm(`確定要編輯角色「${role.name}」嗎？`)) {
      console.log('❌ [Roles Page] 用戶取消編輯');
      return;
    }

    console.log('✅ [Roles Page] 開始編輯模式');
    setEditingRoleId(role.id);
    setEditingName(role.name);
    setEditingDescription(role.description || '');
  }

  function saveEdit() {
    console.log('🔘 [Roles Page] 點擊「確認」按鈕（編輯）');
    console.log('  編輯中的角色 ID:', editingRoleId);
    console.log('  新名稱:', editingName);
    console.log('  新描述:', editingDescription);

    const trimmedName = editingName.trim();
    if (!trimmedName) {
      console.warn('⚠️  [Roles Page] 角色名稱為空');
      alert('角色名稱不能為空');
      return;
    }

    // 檢查名稱衝突 (排除自己)
    if (roles.some(r => r.id !== editingRoleId && r.name.toLowerCase() === trimmedName.toLowerCase())) {
      console.warn('⚠️  [Roles Page] 角色名稱衝突:', trimmedName);
      alert('此角色名稱已被使用');
      return;
    }

    console.log('✅ [Roles Page] 儲存編輯');
    updateRole(editingRoleId!, {
      name: trimmedName,
      description: editingDescription.trim()
    });

    setEditingRoleId(null);
    setEditingName('');
    setEditingDescription('');
  }

  function cancelEdit() {
    console.log('🔘 [Roles Page] 點擊「取消」按鈕（編輯）');
    setEditingRoleId(null);
    setEditingName('');
    setEditingDescription('');
  }

  function updateRole(roleId: string, updates: Partial<Role>) {
    setRoles(prev => prev.map(r =>
      r.id === roleId ? { ...r, ...updates } : r
    ));
  }

  function handleDragStart(e: React.DragEvent, index: number) {
    if (editingRoleId) {
      console.log('🔘 [Roles Page] 開始拖曳角色，索引:', index);
      setDraggedIndex(index);
      e.dataTransfer!.effectAllowed = 'move';
    } else {
      e.preventDefault();
    }
  }

  function handleDragOver(e: React.DragEvent) {
    if (editingRoleId) {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
    }
  }

  function handleDrop(e: React.DragEvent, targetIndex: number) {
    if (!editingRoleId) return;
    
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    console.log('✅ [Roles Page] 放開拖曳，從索引 ' + draggedIndex + ' 移動到 ' + targetIndex);
    const newRoles = [...roles];
    const [draggedRole] = newRoles.splice(draggedIndex, 1);
    newRoles.splice(targetIndex, 0, draggedRole);
    setRoles(newRoles);
    setDraggedIndex(null);
  }

  function handleDragEnd() {
    setDraggedIndex(null);
  }

  if (loading) {
    return <main style={{ padding: 24 }}>Loading roles...</main>;
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1>角色管理</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button 
            onClick={saveRoles} 
            disabled={saving || !hasChanges} 
            style={{ 
              padding: '8px 16px',
              background: !hasChanges ? '#cbd5e1' : '#2563eb',
              color: 'white',
              borderRadius: 6,
              border: 'none',
              cursor: !hasChanges ? 'not-allowed' : 'pointer',
              opacity: !hasChanges ? 0.6 : 1,
              fontWeight: 600
            }}
            title={!hasChanges ? '沒有任何更改' : '儲存所有變更'}
          >
            {saving ? '儲存中…' : '儲存設定'}
          </button>
          {saveMessage && (
            <div style={{
              color: saveMessage.includes('成功') ? '#0b6' : '#c62828',
              fontWeight: 600
            }}>
              {saveMessage}
            </div>
          )}
        </div>
      </div>

      {/* 添加新角色 */}
      <section style={{ marginBottom: 24, padding: 20, background: '#f8f9fa', borderRadius: 8 }}>
        <h3 style={{ marginTop: 0 }}>添加新角色</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>角色名稱 *</label>
            <input
              placeholder="例如：助教、管理员助理"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              style={{ padding: 8, border: '1px solid #ddd', borderRadius: 4, width: 200 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>角色描述</label>
            <input
              placeholder="選填"
              value={newRoleDescription}
              onChange={(e) => setNewRoleDescription(e.target.value)}
              style={{ padding: 8, border: '1px solid #ddd', borderRadius: 4, width: 250 }}
            />
          </div>
          <button
            onClick={addRole}
            style={{
              padding: '8px 16px',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            添加角色
          </button>
        </div>
      </section>

      {/* 角色列表 */}
      <section>
        <h3>角色列表</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: 0,
            border: '2px solid #ddd',
            background: 'white'
          }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ padding: 12, borderRight: '2px solid #ddd', textAlign: 'center', width: 60 }}>排序</th>
                <th style={{ padding: 12, borderRight: '2px solid #ddd', textAlign: 'left' }}>角色名稱</th>
                <th style={{ padding: 12, borderRight: '2px solid #ddd', textAlign: 'left' }}>描述</th>
                <th style={{ padding: 12, borderRight: '2px solid #ddd', textAlign: 'center', width: 80 }}>燈號</th>
                <th style={{ padding: 12, borderRight: '2px solid #ddd', textAlign: 'center', width: 100 }}>狀態</th>
                <th style={{ padding: 12, textAlign: 'center', width: 120 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role, idx) => (
                <tr key={role.id} style={{
                  background: idx % 2 === 0 ? '#ffffff' : '#f9f9f9',
                  borderTop: '1px solid #eee',
                  opacity: draggedIndex === idx ? 0.5 : 1,
                  cursor: editingRoleId ? (draggedIndex === idx ? 'grabbing' : 'grab') : 'default',
                  transition: 'background-color 0.2s ease'
                }}
                draggable={!!editingRoleId}
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                >
                  <td style={{ padding: 12, borderRight: '1px solid #eee', textAlign: 'center' }}>
                    {editingRoleId && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'grab',
                        color: '#999',
                        fontSize: '18px',
                        userSelect: 'none'
                      }} title="拖曳以排序">
                        ⋮
                      </div>
                    )}
                  </td>
                  <td style={{ padding: 12, borderRight: '1px solid #eee' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {editingRoleId === role.id ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          style={{
                            padding: '6px 8px',
                            border: '2px solid #0070f3',
                            borderRadius: 4,
                            fontSize: '14px',
                            fontWeight: 600,
                            flex: 1
                          }}
                          autoFocus
                        />
                      ) : (
                        <span style={{ fontWeight: 600 }}>{role.name}</span>
                      )}
                      {['admin', 'teacher', 'student'].includes(role.id) && (
                        <span style={{
                          padding: '2px 6px',
                          background: '#e3f2fd',
                          color: '#1976d2',
                          borderRadius: 3,
                          fontSize: '11px',
                          fontWeight: 500
                        }}>
                          系統
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: 12, borderRight: '1px solid #eee' }}>
                    {editingRoleId === role.id ? (
                      <input
                        type="text"
                        value={editingDescription}
                        onChange={(e) => setEditingDescription(e.target.value)}
                        placeholder="無描述"
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          border: '2px solid #0070f3',
                          borderRadius: 4,
                          fontSize: '14px'
                        }}
                      />
                    ) : (
                      <div style={{
                        padding: '6px 8px',
                        background: '#f1f5f9',
                        borderRadius: 4,
                        fontSize: '14px',
                        color: role.description ? '#334155' : '#94a3b8',
                        minHeight: '32px',
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                        {role.description || '無描述'}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: 12, borderRight: '1px solid #eee', textAlign: 'center' }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: role.isActive ? '#28a745' : '#f8d7da',
                      boxShadow: role.isActive ? 'inset 0 0 0 2px #20c997' : 'inset 0 0 0 2px #f5c6cb'
                    }} title={role.isActive ? '啟用中' : '停用中'}></div>
                  </td>
                  <td style={{ padding: 12, borderRight: '1px solid #eee', textAlign: 'center' }}>
                    {['admin', 'teacher', 'student'].includes(role.id) ? (
                      <span style={{
                        padding: '6px 12px',
                        background: '#e8f5e9',
                        color: '#2e7d32',
                        borderRadius: 4,
                        fontSize: '12px',
                        fontWeight: 500
                      }}>
                        永久啟用
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          if (editingRoleId === role.id) {
                            toggleRoleActive(role.id);
                          }
                        }}
                        disabled={editingRoleId !== role.id}
                        style={{
                          padding: '6px 12px',
                          background: editingRoleId === role.id 
                            ? (role.isActive ? '#28a745' : '#6c757d')
                            : '#cbd5e1',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          cursor: editingRoleId === role.id ? 'pointer' : 'not-allowed',
                          fontSize: '12px',
                          opacity: editingRoleId === role.id ? 1 : 0.6
                        }}
                        title={editingRoleId === role.id ? '點擊切換狀態' : '點擊編輯按鈕才能改變狀態'}
                      >
                        {role.isActive ? '啟用' : '停用'}
                      </button>
                    )}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      {['admin', 'teacher', 'student'].includes(role.id) ? (
                        <span style={{
                          padding: '6px 12px',
                          background: '#e3f2fd',
                          color: '#1976d2',
                          borderRadius: 4,
                          fontSize: '12px',
                          fontWeight: 500
                        }}>
                          系統保護
                        </span>
                      ) : editingRoleId === role.id ? (
                        <>
                          <button
                            onClick={saveEdit}
                            style={{
                              padding: '4px 8px',
                              background: '#28a745',
                              color: 'white',
                              border: 'none',
                              borderRadius: 3,
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 500
                            }}
                          >
                            確認
                          </button>
                          <button
                            onClick={cancelEdit}
                            style={{
                              padding: '4px 8px',
                              background: '#6c757d',
                              color: 'white',
                              border: 'none',
                              borderRadius: 3,
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            取消
                          </button>
                          {!['admin', 'teacher', 'student'].includes(role.id) && (
                            <button
                              onClick={() => deleteRole(role.id)}
                              style={{
                                padding: '4px 8px',
                                background: '#dc3545',
                                color: 'white',
                                border: 'none',
                                borderRadius: 3,
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              刪除
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => editRole(role)}
                          style={{
                            padding: '4px 8px',
                            background: '#ffc107',
                            color: '#000',
                            border: 'none',
                            borderRadius: 3,
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 500
                          }}
                        >
                          編輯
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {roles.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: 40,
            color: '#666',
            fontSize: '16px'
          }}>
            尚未添加任何角色
          </div>
        )}
      </section>
    </main>
  );
}
"use client";

import { useEffect, useState } from 'react';

type Role = {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
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

  useEffect(() => {
    loadRoles();
  }, []);

  async function loadRoles() {
    try {
      const res = await fetch('/api/admin/roles');
      const data = await res.json();
      if (res.ok && data.ok) {
        setRoles(data.roles || []);
      }
    } catch (error) {
      console.error('Failed to load roles:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveRoles() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setRoles(data.roles);
        setSaveMessage('儲存成功');
      } else {
        setSaveMessage('儲存失敗：' + (data?.error || res.statusText));
      }
    } catch (err: any) {
      setSaveMessage('網路錯誤：' + (err?.message || String(err)));
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }

  function addRole() {
    if (!newRoleName.trim()) return;

    const newRole: Role = {
      id: newRoleName.toLowerCase().replace(/\s+/g, '_'),
      name: newRoleName.trim(),
      description: newRoleDescription.trim(),
      isActive: true
    };

    // 检查角色名是否已存在
    if (roles.some(r => r.name.toLowerCase() === newRole.name.toLowerCase())) {
      alert('角色名稱已存在');
      return;
    }

    setRoles(prev => [...prev, newRole]);
    setNewRoleName('');
    setNewRoleDescription('');
  }

  function deleteRole(roleId: string) {
    if (!confirm('確定要刪除此角色嗎？這將移除所有相關的權限設定。')) return;

    // 不允许删除系统角色
    if (['admin', 'teacher', 'student'].includes(roleId)) {
      alert('無法刪除系統預設角色');
      return;
    }

    setRoles(prev => prev.filter(r => r.id !== roleId));
  }

  function toggleRoleActive(roleId: string) {
    setRoles(prev => prev.map(r =>
      r.id === roleId ? { ...r, isActive: !r.isActive } : r
    ));
  }

  function editRole(role: Role) {
    if (!confirm(`確定要編輯角色「${role.name}」嗎？`)) return;
    setEditingRoleId(role.id);
    setEditingName(role.name);
    setEditingDescription(role.description || '');
  }

  function saveEdit() {
    const trimmedName = editingName.trim();
    if (!trimmedName) {
      alert('角色名稱不能為空');
      return;
    }

    // 檢查名稱衝突 (排除自己)
    if (roles.some(r => r.id !== editingRoleId && r.name.toLowerCase() === trimmedName.toLowerCase())) {
      alert('此角色名稱已被使用');
      return;
    }

    updateRole(editingRoleId!, {
      name: trimmedName,
      description: editingDescription.trim()
    });

    setEditingRoleId(null);
    setEditingName('');
    setEditingDescription('');
  }

  function cancelEdit() {
    setEditingRoleId(null);
    setEditingName('');
    setEditingDescription('');
  }

  function updateRole(roleId: string, updates: Partial<Role>) {
    setRoles(prev => prev.map(r =>
      r.id === roleId ? { ...r, ...updates } : r
    ));
  }

  if (loading) {
    return <main style={{ padding: 24 }}>Loading roles...</main>;
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1>角色管理</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={saveRoles} disabled={saving} style={{ padding: '8px 16px' }}>
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
                  borderTop: '1px solid #eee'
                }}>
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
                    <button
                      onClick={() => toggleRoleActive(role.id)}
                      style={{
                        padding: '6px 12px',
                        background: role.isActive ? '#28a745' : '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      {role.isActive ? '啟用' : '停用'}
                    </button>
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      {editingRoleId === role.id ? (
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
                        </>
                      ) : (
                        <>
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
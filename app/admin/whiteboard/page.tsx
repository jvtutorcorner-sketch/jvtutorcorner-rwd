"use client";

import React, { useState, useEffect } from 'react';
import { getStoredUser } from '@/lib/mockAuth';

type Role = { id: string; name: string; description?: string; isActive: boolean };

const ACTIONS: { key: string; label: string; icon?: string }[] = [
  { key: 'clear', label: 'Clear', icon: '🧹' },
  { key: 'undo', label: 'Undo', icon: '↶' },
  { key: 'redo', label: 'Redo', icon: '↷' },
  { key: 'setTool:pencil', label: 'Pencil', icon: '✏️' },
  { key: 'setTool:eraser', label: 'Eraser', icon: '🧽' },
  { key: 'setColor', label: 'Set Color', icon: '🎨' },
  { key: 'setWidth', label: 'Set Width', icon: '📏' },
  { key: 'pdf-set', label: 'Upload PDF', icon: '📄' },
];

export default function AdminWhiteboardControls() {
  const [user, setUser] = useState<any | null>(null);
  const [uuid, setUuid] = useState('');
  const [color, setColor] = useState('#000000');
  const [strokeWidthVal, setStrokeWidthVal] = useState<number>(2);
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setUser(getStoredUser());
  }, []);

  useEffect(() => { loadAdminData(); }, []);

  async function loadAdminData() {
    try {
      const r = await fetch('/api/admin/roles');
      const rr = await r.json();
      if (r.ok && rr?.roles) setRoles(rr.roles || []);

      const s = await fetch('/api/admin/settings');
      const ss = await s.json();
      if (s.ok && ss?.settings) setSettings(ss.settings || {});
    } catch (e) {
      console.error('loadAdminData failed', e);
    }
  }

  if (!user) return <div style={{ padding: 16 }}>請先登入。</div>;
  // page visible to admins and other roles, but buttons controlled by permissions

  const postEvent = async (event: any) => {
    setLoading(true);
    try {
      const bodyObj = uuid ? { uuid, event } : { event };
      const res = await fetch('/api/whiteboard/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.message || 'error');
      alert('已送出事件: ' + event.type);
    } catch (e: any) {
      console.error(e);
      alert('送出事件失敗：' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  const isActionAllowed = (actionKey: string) => {
    if (!settings) return user?.role === 'admin';
    // admins bypass
    if (user?.role === 'admin') return true;
    // Map local stored user role to role id used in settings.
    // In mockAuth, non-admin users may have role 'user' which maps to 'student' in settings.
    const userRoleId = (user?.role === 'user') ? 'student' : user?.role;
    const perms = settings.whiteboardPermissions || {};
    const allowedRoles: string[] = perms[actionKey] || [];
    return !!userRoleId && allowedRoles.includes(userRoleId);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const payload: any = { ...settings };
      if (uuid) payload.whiteboardDefaultUuid = uuid;
      const res = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        alert('設定已儲存');
        // notify other parts of the app to reload settings
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('tutor:admin-settings-changed'));
        loadAdminData();
      } else {
        alert('儲存失敗');
      }
    } catch (e) {
      console.error(e);
      alert('儲存錯誤');
    } finally { setSaving(false); }
  };

  const onPdf = (f: File | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      await postEvent({ type: 'pdf-set', name: f.name, dataUrl });
    };
    reader.readAsDataURL(f);
  };

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h1>白板管理控制 (Admin)</h1>
      {/* UUID input removed: leaving UUID empty will broadcast to all whiteboards */}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => postEvent({ type: 'clear' })} disabled={loading || !isActionAllowed('clear')} style={{ padding: '8px 12px' }}>🧹 Clear</button>
        <button onClick={() => postEvent({ type: 'undo' })} disabled={loading || !isActionAllowed('undo')} style={{ padding: '8px 12px' }}>↶ Undo</button>
        <button onClick={() => postEvent({ type: 'redo' })} disabled={loading || !isActionAllowed('redo')} style={{ padding: '8px 12px' }}>↷ Redo</button>
        <button onClick={() => postEvent({ type: 'setTool', tool: 'pencil' })} disabled={loading || !isActionAllowed('setTool:pencil')} style={{ padding: '8px 12px' }}>✏️ Pencil</button>
        <button onClick={() => postEvent({ type: 'setTool', tool: 'eraser' })} disabled={loading || !isActionAllowed('setTool:eraser')} style={{ padding: '8px 12px' }}>🧽 Eraser</button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <label style={{ marginRight: 8 }}>🎨 Color:</label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <button onClick={() => postEvent({ type: 'setColor', color })} disabled={loading || !isActionAllowed('setColor')} style={{ padding: '8px 12px', marginLeft: 8 }}>🎨 Set Color</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12 }}>
          <label style={{ fontSize: 12 }}>寬度:</label>
          <input type="range" min={1} max={30} value={strokeWidthVal} onChange={(e) => setStrokeWidthVal(Number(e.target.value))} />
          <span style={{ minWidth: 28, textAlign: 'center' }}>{strokeWidthVal}</span>
          <button onClick={() => postEvent({ type: 'setWidth', width: strokeWidthVal })} disabled={loading || !isActionAllowed('setWidth')} style={{ padding: '8px 12px' }}>📏 Set Width</button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>📄 上傳 PDF 到白板</label>
        <input type="file" accept="application/pdf" onChange={(e) => onPdf(e.target.files?.[0] ?? null)} disabled={!isActionAllowed('pdf-set')} />
      </div>

      <div style={{ marginTop: 18, padding: 12, border: '1px solid #e5e7eb', borderRadius: 6 }}>
        <h3>白板按鈕權限設定</h3>
        {!roles.length && <div>Loading roles…</div>}
        {roles.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f7f7f7' }}>
                  <th style={{ padding: 8, textAlign: 'left' }}>功能</th>
                  {roles.filter(r => r.isActive).map(r => <th key={r.id} style={{ padding: 8 }}>{r.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {ACTIONS.map(a => (
                  <tr key={a.key}>
                    <td style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{a.icon ?? '•'}</span>
                      <span>{a.label}</span>
                    </td>
                    {roles.filter(r => r.isActive).map(role => {
                      const perms = settings?.whiteboardPermissions || {};
                      const allowed = Array.isArray(perms[a.key]) ? perms[a.key] : [];
                      const checked = allowed.includes(role.id);
                      return (
                        <td key={role.id} style={{ padding: 8, textAlign: 'center' }}>
                          <input type="checkbox" checked={checked} onChange={(e) => {
                            setSettings((prev: any) => {
                              const cur = prev || {};
                              const perms2 = { ...(cur.whiteboardPermissions || {}) };
                              const arr = Array.isArray(perms2[a.key]) ? [...perms2[a.key]] : [];
                              if (e.target.checked) {
                                if (!arr.includes(role.id)) arr.push(role.id);
                              } else {
                                const idx = arr.indexOf(role.id);
                                if (idx >= 0) arr.splice(idx, 1);
                              }
                              perms2[a.key] = arr;
                              return { ...cur, whiteboardPermissions: perms2 };
                            });
                          }} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12 }}>
              <button onClick={saveSettings} disabled={saving}>{saving ? '儲存中…' : '儲存按鈕權限設定'}</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <small>注意：若未設定 UUID，事件會廣播到所有白板頻道；設定後僅發送至指定 <code>uuid</code>。</small>
      </div>
    </div>
  );
}

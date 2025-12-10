"use client";

import { useEffect, useState } from 'react';
import { PLAN_LABELS } from '@/lib/mockAuth';

type Settings = {
  teacherPage: { showContact?: boolean; showIntro?: boolean; showSubjects?: boolean };
  studentPage: { showGoals?: boolean; showPreferredSubjects?: boolean };
  defaultPlan?: string;
  siteUrl?: string;
  pageVisibility?: Record<string, { label?: string; menu?: { admin?: boolean; teacher?: boolean; user?: boolean }; dropdown?: { admin?: boolean; teacher?: boolean; user?: boolean } }>;
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedMenuRows, setSelectedMenuRows] = useState<string[]>([]);
  const [selectedDropdownRows, setSelectedDropdownRows] = useState<string[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPlan, setNewUserPlan] = useState<string>('basic');
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (res.ok && data.ok) setSettings(data.settings);
    })();
  }, []);

  async function save() {
    if (!settings) {
      setSaveMessage('尚未載入設定，無法儲存');
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.ok) {
        setSettings(data.settings);
        setSaveMessage('儲存成功');
      } else {
        setSaveMessage('儲存失敗：' + (data?.error || res.statusText || '未知錯誤'));
      }
    } catch (err: any) {
      setSaveMessage('網路錯誤：' + (err?.message || String(err)));
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }

  async function createUser() {
    setCreateMsg(null);
    if (!newUserEmail) return setCreateMsg('請輸入 Email');
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newUserEmail.trim().toLowerCase(), plan: newUserPlan }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      setCreateMsg('建立成功：' + data.profile?.email);
      setNewUserEmail('');
    } else {
      setCreateMsg('錯誤：' + (data?.error || '建立失敗'));
    }
  }

  

  if (!settings) return <main style={{ padding: 24 }}>Loading settings…</main>;

  // Build the pages list from settings.pageVisibility so edits persist
  const pages = Object.entries(settings.pageVisibility || {}).map(([path, info]) => ({ path, label: info.label || '', menu: info.menu || {}, dropdown: info.dropdown || {} }));

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>Admin 設定</h1>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button onClick={save} disabled={saving} style={{ marginLeft: 12 }}>{saving ? '儲存中…' : '儲存設定'}</button>
          {saveMessage && (
            <div style={{ marginLeft: 12, color: '#0b6', fontWeight: 600 }} role="status" aria-live="polite">{saveMessage}</div>
          )}
        </div>
      </div>

      <section style={{ marginTop: 16 }}>
        <h3>頁面存取權限（Menu）</h3>
        <p style={{ marginTop: 6 }}>編輯左側主選單中各頁面的可見性與名稱/URL。</p>
        <div style={{ marginTop: 8, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, border: '2px solid #ddd' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ padding: 10, borderRight: '2px solid #ddd', width: 56 }}>選取</th>
                <th style={{ textAlign: 'left', padding: 10, borderRight: '2px solid #ddd' }}>頁面名稱</th>
                <th style={{ textAlign: 'left', padding: 10, borderRight: '2px solid #ddd' }}>URL</th>
                <th style={{ padding: 10, borderRight: '2px solid #ddd', textAlign: 'center' }}>Admin</th>
                <th style={{ padding: 10, borderRight: '2px solid #ddd', textAlign: 'center' }}>Teacher</th>
                <th style={{ padding: 10, textAlign: 'center' }}>Student</th>
                <th style={{ padding: 10, borderLeft: '2px solid #ddd' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p, idx) => {
                const vis = settings.pageVisibility?.[p.path] || { label: p.label, menu: {}, dropdown: {} };
                const displayLabel = (vis.label && vis.label.length > 0) ? vis.label : p.path;
                const rowBg = idx % 2 === 0 ? '#ffffff' : '#f6f6f6';
                const isSelected = selectedMenuRows.includes(p.path);
                return (
                  <tr key={p.path} style={{ background: rowBg, borderTop: '2px solid #ddd' }}>
                    <td style={{ padding: 8, borderRight: '2px solid #ddd', textAlign: 'center' }}>
                      <input type="checkbox" checked={isSelected} onChange={(e) => {
                        if (e.target.checked) setSelectedMenuRows((s) => [...s, p.path]);
                        else setSelectedMenuRows((s) => s.filter((x) => x !== p.path));
                      }} />
                    </td>
                    <td style={{ padding: 8, borderRight: '2px solid #ddd' }}>
                      <input disabled={!isSelected} value={settings.pageVisibility?.[p.path]?.label ?? ''} placeholder={p.path} onChange={(e) => {
                        const next = { ...(settings.pageVisibility || {}), [p.path]: { ...(settings.pageVisibility?.[p.path] || {}), label: e.target.value } };
                        setSettings({ ...settings, pageVisibility: next });
                      }} style={{ width: '100%', padding: 6 }} />
                    </td>
                    <td style={{ padding: 8, borderRight: '2px solid #ddd' }}>
                      <input disabled={!isSelected} value={p.path} onChange={(e) => {
                        const newUrl = e.target.value || '';
                        const current = settings.pageVisibility || {};
                        const entry = current[p.path];
                        if (!entry) return;
                        const next = { ...current } as any;
                        next[newUrl] = { ...(next[newUrl] || {}), ...entry };
                        if (newUrl !== p.path) delete next[p.path];
                        setSettings({ ...settings, pageVisibility: next });
                        // update menu selection only
                        setSelectedMenuRows((s) => s.map((x) => x === p.path ? newUrl : x));
                      }} style={{ width: '100%', padding: 6 }} />
                    </td>
                    <td style={{ padding: 8, borderRight: '2px solid #ddd', textAlign: 'center' }}>
                      <input disabled={!isSelected} type="checkbox" checked={!!(vis.menu?.admin)} onChange={(e) => {
                        const next = { ...(settings.pageVisibility || {}), [p.path]: { ...(settings.pageVisibility?.[p.path] || {}), menu: { ...(settings.pageVisibility?.[p.path]?.menu || {}), admin: e.target.checked } } };
                        setSettings({ ...settings, pageVisibility: next });
                      }} />
                    </td>
                    <td style={{ padding: 8, borderRight: '2px solid #ddd', textAlign: 'center' }}>
                      <input disabled={!isSelected} type="checkbox" checked={!!(vis.menu?.teacher)} onChange={(e) => {
                        const next = { ...(settings.pageVisibility || {}), [p.path]: { ...(settings.pageVisibility?.[p.path] || {}), menu: { ...(settings.pageVisibility?.[p.path]?.menu || {}), teacher: e.target.checked } } };
                        setSettings({ ...settings, pageVisibility: next });
                      }} />
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <input disabled={!isSelected} type="checkbox" checked={!!(vis.menu?.user)} onChange={(e) => {
                        const next = { ...(settings.pageVisibility || {}), [p.path]: { ...(settings.pageVisibility?.[p.path] || {}), menu: { ...(settings.pageVisibility?.[p.path]?.menu || {}), user: e.target.checked } } };
                        setSettings({ ...settings, pageVisibility: next });
                      }} />
                    </td>
                    <td style={{ padding: 8, borderLeft: '2px solid #ddd', textAlign: 'center' }}>
                      {isSelected ? (
                        <button style={{ color: 'crimson' }} onClick={() => {
                          const current = { ...(settings.pageVisibility || {}) } as any;
                          delete current[p.path];
                          setSettings({ ...settings, pageVisibility: current });
                          // clear selection in both tables for this path
                          setSelectedMenuRows((s) => s.filter((x) => x !== p.path));
                          setSelectedDropdownRows((s) => s.filter((x) => x !== p.path));
                        }}>刪除</button>
                      ) : (
                        <span style={{ color: '#999' }}>鎖定</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>頁面存取權限（Dropdown Menu）</h3>
        <p style={{ marginTop: 6 }}>設定下拉選單（avatar dropdown）中各頁面的可見性。</p>
        <div style={{ marginTop: 8, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, border: '2px solid #ddd' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ padding: 10, borderRight: '2px solid #ddd', width: 56 }}>選取</th>
                <th style={{ textAlign: 'left', padding: 10, borderRight: '2px solid #ddd' }}>頁面名稱</th>
                <th style={{ textAlign: 'left', padding: 10, borderRight: '2px solid #ddd' }}>URL</th>
                <th style={{ padding: 10, borderRight: '2px solid #ddd', textAlign: 'center' }}>Admin</th>
                <th style={{ padding: 10, borderRight: '2px solid #ddd', textAlign: 'center' }}>Teacher</th>
                <th style={{ padding: 10, textAlign: 'center' }}>Student</th>
                <th style={{ padding: 10, borderLeft: '2px solid #ddd' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p, idx) => {
                const vis = settings.pageVisibility?.[p.path] || { label: p.label, menu: {}, dropdown: {} };
                const displayLabel2 = (vis.label && vis.label.length > 0) ? vis.label : p.path;
                const rowBg = idx % 2 === 0 ? '#ffffff' : '#f6f6f6';
                const isSelected = selectedDropdownRows.includes(p.path);
                return (
                  <tr key={p.path} style={{ background: rowBg, borderTop: '2px solid #ddd' }}>
                    <td style={{ padding: 8, borderRight: '2px solid #ddd', textAlign: 'center' }}>
                      <input type="checkbox" checked={isSelected} onChange={(e) => {
                        if (e.target.checked) setSelectedDropdownRows((s) => [...s, p.path]);
                        else setSelectedDropdownRows((s) => s.filter((x) => x !== p.path));
                      }} />
                    </td>
                    <td style={{ padding: 8, borderRight: '2px solid #ddd' }}>
                      <input disabled={!isSelected} value={settings.pageVisibility?.[p.path]?.label ?? ''} placeholder={p.path} onChange={(e) => {
                        const next = { ...(settings.pageVisibility || {}), [p.path]: { ...(settings.pageVisibility?.[p.path] || {}), label: e.target.value } } as any;
                        setSettings({ ...settings, pageVisibility: next });
                      }} style={{ width: '100%', padding: 6 }} />
                    </td>
                    <td style={{ padding: 8, borderRight: '2px solid #ddd' }}>
                      <input disabled={!isSelected} value={p.path} onChange={(e) => {
                        const newUrl = e.target.value || '';
                        const current = settings.pageVisibility || {};
                        const entry = current[p.path];
                        if (!entry) return;
                        const next = { ...current } as any;
                        next[newUrl] = { ...(next[newUrl] || {}), ...entry };
                        if (newUrl !== p.path) delete next[p.path];
                        setSettings({ ...settings, pageVisibility: next });
                        // update dropdown selection only
                        setSelectedDropdownRows((s) => s.map((x) => x === p.path ? newUrl : x));
                      }} style={{ width: '100%', padding: 6 }} />
                    </td>
                    <td style={{ padding: 8, borderRight: '2px solid #ddd', textAlign: 'center' }}>
                      <input disabled={!isSelected} type="checkbox" checked={!!(vis.dropdown?.admin)} onChange={(e) => {
                        const next = { ...(settings.pageVisibility || {}), [p.path]: { ...(settings.pageVisibility?.[p.path] || {}), dropdown: { ...(settings.pageVisibility?.[p.path]?.dropdown || {}), admin: e.target.checked } } };
                        setSettings({ ...settings, pageVisibility: next });
                      }} />
                    </td>
                    <td style={{ padding: 8, borderRight: '2px solid #ddd', textAlign: 'center' }}>
                      <input disabled={!isSelected} type="checkbox" checked={!!(vis.dropdown?.teacher)} onChange={(e) => {
                        const next = { ...(settings.pageVisibility || {}), [p.path]: { ...(settings.pageVisibility?.[p.path] || {}), dropdown: { ...(settings.pageVisibility?.[p.path]?.dropdown || {}), teacher: e.target.checked } } };
                        setSettings({ ...settings, pageVisibility: next });
                      }} />
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <input disabled={!isSelected} type="checkbox" checked={!!(vis.dropdown?.user)} onChange={(e) => {
                        const next = { ...(settings.pageVisibility || {}), [p.path]: { ...(settings.pageVisibility?.[p.path] || {}), dropdown: { ...(settings.pageVisibility?.[p.path]?.dropdown || {}), user: e.target.checked } } };
                        setSettings({ ...settings, pageVisibility: next });
                      }} />
                    </td>
                    <td style={{ padding: 8, borderLeft: '2px solid #ddd', textAlign: 'center' }}>
                      {isSelected ? (
                        <button style={{ color: 'crimson' }} onClick={() => {
                          const current = { ...(settings.pageVisibility || {}) } as any;
                          delete current[p.path];
                          setSettings({ ...settings, pageVisibility: current });
                          // clear selection in both tables for this path
                          setSelectedMenuRows((s) => s.filter((x) => x !== p.path));
                          setSelectedDropdownRows((s) => s.filter((x) => x !== p.path));
                        }}>刪除</button>
                      ) : (
                        <span style={{ color: '#999' }}>鎖定</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section style={{ marginTop: 16 }}>
        <h3>老師頁面顯示設定</h3>
        <label>
          <input type="checkbox" checked={!!settings.teacherPage.showContact} onChange={(e) => setSettings({ ...settings, teacherPage: { ...settings.teacherPage, showContact: e.target.checked } })} /> 顯示聯絡資訊
        </label>
        <br />
        <label>
          <input type="checkbox" checked={!!settings.teacherPage.showIntro} onChange={(e) => setSettings({ ...settings, teacherPage: { ...settings.teacherPage, showIntro: e.target.checked } })} /> 顯示個人介紹
        </label>
        <br />
        <label>
          <input type="checkbox" checked={!!settings.teacherPage.showSubjects} onChange={(e) => setSettings({ ...settings, teacherPage: { ...settings.teacherPage, showSubjects: e.target.checked } })} /> 顯示科目
        </label>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>學生頁面顯示設定</h3>
        <label>
          <input type="checkbox" checked={!!settings.studentPage.showGoals} onChange={(e) => setSettings({ ...settings, studentPage: { ...settings.studentPage, showGoals: e.target.checked } })} /> 顯示學習目標
        </label>
        <br />
        <label>
          <input type="checkbox" checked={!!settings.studentPage.showPreferredSubjects} onChange={(e) => setSettings({ ...settings, studentPage: { ...settings.studentPage, showPreferredSubjects: e.target.checked } })} /> 顯示偏好科目
        </label>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>帳戶預設方案</h3>
        <select value={settings.defaultPlan || 'basic'} onChange={(e) => setSettings({ ...settings, defaultPlan: e.target.value })}>
          {Object.entries(PLAN_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </section>

      <div style={{ marginTop: 12 }}>
        <button onClick={save} disabled={saving}>{saving ? '儲存中…' : '儲存設定'}</button>
      </div>

      <section style={{ marginTop: 24 }}>
        <h3>管理員建立帳號（示範）</h3>
        <div>
          <input placeholder="Email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
          <select value={newUserPlan} onChange={(e) => setNewUserPlan(e.target.value)}>
            {Object.entries(PLAN_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button onClick={createUser}>建立帳號</button>
        </div>
        {createMsg && <p>{createMsg}</p>}
      </section>
    </main>
  );
}

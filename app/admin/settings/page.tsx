"use client";

import { useEffect, useState } from 'react';
import { PLAN_LABELS } from '@/lib/mockAuth';

type Settings = {
  teacherPage: { showContact?: boolean; showIntro?: boolean; showSubjects?: boolean };
  studentPage: { showGoals?: boolean; showPreferredSubjects?: boolean };
  defaultPlan?: string;
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
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
    if (!settings) return;
    setSaving(true);
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (res.ok && data.ok) setSettings(data.settings);
    setSaving(false);
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

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin 設定</h1>
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

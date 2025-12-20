"use client";

import { useEffect, useState, useMemo } from 'react';
import { PLAN_LABELS } from '@/lib/mockAuth';

// 页面权限类型
type PagePermission = {
  roleId: string;
  roleName: string;
  menuVisible: boolean;
  dropdownVisible: boolean;
  pageVisible: boolean;
};

// 页面配置类型
type PageConfig = {
  id: string;
  path: string;
  label?: string;
  permissions: PagePermission[];
};

// 角色类型
type Role = {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
};

// 设置类型
type Settings = {
  teacherPage: { showContact?: boolean; showIntro?: boolean; showSubjects?: boolean };
  studentPage: { showGoals?: boolean; showPreferredSubjects?: boolean };
  defaultPlan?: string;
  siteUrl?: string;
  pageConfigs: PageConfig[];
};

// DynamoDB Schema 预览相关类型
type DynamoPreviewData = {
  firstName?: string;
  lastName?: string;
  email: string;
  password?: string;
  role: 'student' | 'teacher' | 'admin';
  plan: string | null;
  birthdate?: string;
  gender?: string;
  country?: string;
  bio?: string;
  termsAccepted: boolean;
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedMenuRows, setSelectedMenuRows] = useState<string[]>([]);
  const [selectedDropdownRows, setSelectedDropdownRows] = useState<string[]>([]);
  const [selectedPageRows, setSelectedPageRows] = useState<string[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPlan, setNewUserPlan] = useState<string>('basic');
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [newPagePath, setNewPagePath] = useState('');
  const [newPageLabel, setNewPageLabel] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  // DynamoDB Schema 预览状态
  const [previewData, setPreviewData] = useState<DynamoPreviewData>({
    firstName: '張',
    lastName: '小明',
    email: 'admin@jvtutorcorner.com',
    password: 'hashed_password_here',
    role: 'admin',
    plan: 'premium',
    birthdate: '1990-01-01',
    gender: 'male',
    country: 'TW',
    bio: '熱愛教育的專業教師，擁有豐富的教學經驗。',
    termsAccepted: true,
  });

  // 国家时区映射
  const countryTimezones: Record<string, string> = {
    TW: 'Asia/Taipei',
    JP: 'Asia/Tokyo',
    US: 'America/New_York',
    GB: 'Europe/London',
    HK: 'Asia/Hong_Kong',
    MO: 'Asia/Macau',
    CN: 'Asia/Shanghai',
    KR: 'Asia/Seoul',
    SG: 'Asia/Singapore',
    MY: 'Asia/Kuala_Lumpur',
    AU: 'Australia/Sydney',
    NZ: 'Pacific/Auckland',
    CA: 'America/Toronto',
    DE: 'Europe/Berlin',
    FR: 'Europe/Paris',
    ES: 'Europe/Madrid',
    IT: 'Europe/Rome',
    IN: 'Asia/Kolkata',
    BR: 'America/Sao_Paulo',
    MX: 'America/Mexico_City',
    ZA: 'Africa/Johannesburg',
  };

  // 格式化本地时间为 ISO 格式
  function formatLocalIso(timezone?: string) {
    const now = new Date();
    const utcIso = now.toISOString();
    if (!timezone) return { utc: utcIso, local: utcIso, timezone: 'UTC' };
    try {
      const fmt = new Intl.DateTimeFormat('sv-SE', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      // 'sv-SE' style yields YYYY-MM-DD HH:MM:SS which we convert to ISO-like
      const parts = fmt.formatToParts(now).reduce((acc: any, part) => {
        acc[part.type] = (acc[part.type] || '') + part.value;
        return acc;
      }, {});
      const localIsoLike = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
      return { utc: utcIso, local: localIsoLike, timezone };
    } catch (e) {
      return { utc: utcIso, local: utcIso, timezone: 'UTC' };
    }
  }

  // 生成 DynamoDB Schema 预览
  const dynamoPreview = useMemo(() => {
    const tz = countryTimezones[previewData.country || 'TW'] || 'UTC';
    const t = formatLocalIso(tz);
    const combinedName = `${previewData.firstName || ''} ${previewData.lastName || ''}`.trim();
    return {
      roid_id: `user_preview_${previewData.email}`, // 使用 email 作為穩定 ID
      email: previewData.email.trim().toLowerCase(),
      password: previewData.password || undefined,
      firstName: previewData.firstName || undefined,
      lastName: previewData.lastName || undefined,
      nickname: combinedName || undefined,
      role: previewData.role,
      plan: previewData.plan ?? null,
      birthdate: previewData.birthdate || undefined,
      gender: previewData.gender || undefined,
      country: previewData.country || undefined,
      timezone: t.timezone,
      termsAccepted: !!previewData.termsAccepted,
      createdAtUtc: t.utc,
      updatedAtUtc: t.utc,
      bio: previewData.bio || undefined,
    } as const;
  }, [previewData]);

  useEffect(() => {
    loadSettings();
    loadRoles();
  }, []);

  async function loadSettings() {
    try {
      // 加载设置
      const settingsRes = await fetch('/api/admin/settings');
      const settingsData = await settingsRes.json();

      // 加载角色
      const rolesRes = await fetch('/api/admin/roles');
      const rolesData = await rolesRes.json();

      if (settingsRes.ok && settingsData.ok && rolesRes.ok && rolesData.ok) {
        // 转换旧数据格式到新格式
        const convertedSettings = convertOldSettingsToNew(settingsData.settings, rolesData.roles);
        setSettings(convertedSettings);
        setRoles(rolesData.roles);
        setRolesLoading(false);
      } else {
        setRolesLoading(false);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }

  async function loadRoles() {
    try {
      const response = await fetch('/api/admin/roles');
      const data = await response.json();
      if (response.ok && data.ok) {
        setRoles(data.roles);
      }
    } catch (error) {
      console.error('Failed to load roles:', error);
    } finally {
      setRolesLoading(false);
    }
  }

  function addNewPage() {
    if (!settings) {
      alert('設定尚未載入');
      return;
    }

    if (!newPagePath.trim()) {
      alert('請輸入頁面路徑');
      return;
    }

    if (settings.pageConfigs.some(pc => pc.path === newPagePath.trim())) {
      alert('此頁面路徑已存在');
      return;
    }

    const newPermissions: PagePermission[] = roles
      .filter(role => role.isActive)
      .map(role => ({
        roleId: role.id,
        roleName: role.name,
        menuVisible: false,
        dropdownVisible: false,
        pageVisible: false
      }));

    const newPageConfig: PageConfig = {
      id: newPagePath.trim(),
      path: newPagePath.trim(),
      label: newPageLabel.trim() || newPagePath.trim(),
      permissions: newPermissions
    };

    setSettings(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        pageConfigs: [...prev.pageConfigs, newPageConfig]
      };
    });

    // 清空输入框
    setNewPagePath('');
    setNewPageLabel('');
  }

  // 转换旧的 pageVisibility 格式到新的 PageConfig 格式
  function convertOldSettingsToNew(oldSettings: any, roles: any[]): Settings {
    const pageConfigs: PageConfig[] = [];

    if (oldSettings.pageVisibility) {
      Object.entries(oldSettings.pageVisibility).forEach(([path, config]: [string, any]) => {
        const permissions: PagePermission[] = roles
          .filter(role => role.isActive)
          .map((role: any) => ({
            roleId: role.id,
            roleName: role.name,
            menuVisible: config.menu?.[role.id.toLowerCase()] || false,
            dropdownVisible: config.dropdown?.[role.id.toLowerCase()] || false,
            pageVisible: config.page?.[role.id.toLowerCase()] || false
          }));

        pageConfigs.push({
          id: path,
          path,
          label: config.label,
          permissions
        });
      });
    }

    return {
      teacherPage: oldSettings.teacherPage || { showContact: true, showIntro: true, showSubjects: true },
      studentPage: oldSettings.studentPage || { showGoals: true, showPreferredSubjects: true },
      defaultPlan: oldSettings.defaultPlan || 'basic',
      siteUrl: oldSettings.siteUrl || '',
      pageConfigs
    };
  }

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

  // 构建页面列表从 pageConfigs（需要从外部获取角色数据）
  const pages = settings.pageConfigs.map(config => ({
    path: config.path,
    label: config.label || '',
    permissions: config.permissions
  }));

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

      <section style={{ marginTop: 24 }}>
        <h3>頁面存取權限管理</h3>
        <p style={{ marginTop: 6 }}>已拆分為三個專頁：Menu、Page、Dropdown Menu。請從下方連結打開對應設定畫面進行編輯。</p>
        <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
          <a href="/admin/settings/menu"><button style={{ padding: '8px 14px' }}>Menu 設定</button></a>
          <a href="/admin/settings/page-permissions"><button style={{ padding: '8px 14px' }}>Page 存取權限</button></a>
          <a href="/admin/settings/dropdown"><button style={{ padding: '8px 14px' }}>Dropdown Menu 設定</button></a>
          <a href="/admin/settings/roles-usage"><button style={{ padding: '8px 14px' }}>Role 使用設定</button></a>
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

      <section style={{ marginTop: 24 }}>
        <h3>DynamoDB Schema 預覽</h3>
        <p style={{ marginTop: 6 }}>用於開發者查看用戶資料在 DynamoDB 中的存儲格式。</p>

        <div style={{ marginTop: 12 }}>
          <h4>輸入測試資料：</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: 8 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>First Name:</label>
              <input
                type="text"
                value={previewData.firstName || ''}
                onChange={(e) => setPreviewData({ ...previewData, firstName: e.target.value })}
                style={{ width: '100%', padding: '4px 8px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Last Name:</label>
              <input
                type="text"
                value={previewData.lastName || ''}
                onChange={(e) => setPreviewData({ ...previewData, lastName: e.target.value })}
                style={{ width: '100%', padding: '4px 8px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Email:</label>
              <input
                type="email"
                value={previewData.email}
                onChange={(e) => setPreviewData({ ...previewData, email: e.target.value })}
                style={{ width: '100%', padding: '4px 8px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Role:</label>
              <select
                value={previewData.role}
                onChange={(e) => setPreviewData({ ...previewData, role: e.target.value as 'student' | 'teacher' | 'admin' })}
                style={{ width: '100%', padding: '4px 8px' }}
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Birthdate:</label>
              <input
                type="date"
                value={previewData.birthdate || ''}
                onChange={(e) => setPreviewData({ ...previewData, birthdate: e.target.value })}
                style={{ width: '100%', padding: '4px 8px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Gender:</label>
              <select
                value={previewData.gender || ''}
                onChange={(e) => setPreviewData({ ...previewData, gender: e.target.value })}
                style={{ width: '100%', padding: '4px 8px' }}
              >
                <option value="">Not specified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Plan:</label>
              <select
                value={previewData.plan || ''}
                onChange={(e) => setPreviewData({ ...previewData, plan: e.target.value || null })}
                style={{ width: '100%', padding: '4px 8px' }}
              >
                <option value="">None</option>
                {Object.entries(PLAN_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Country:</label>
              <select
                value={previewData.country || 'TW'}
                onChange={(e) => setPreviewData({ ...previewData, country: e.target.value })}
                style={{ width: '100%', padding: '4px 8px' }}
              >
                {Object.entries(countryTimezones).map(([code, tz]) => (
                  <option key={code} value={code}>{code} ({tz})</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Bio:</label>
            <textarea
              value={previewData.bio || ''}
              onChange={(e) => setPreviewData({ ...previewData, bio: e.target.value })}
              style={{ width: '100%', padding: '4px 8px', minHeight: '60px' }}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <label>
              <input
                type="checkbox"
                checked={previewData.termsAccepted}
                onChange={(e) => setPreviewData({ ...previewData, termsAccepted: e.target.checked })}
              /> Terms Accepted
            </label>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <h4>DynamoDB Item 預覽：</h4>
          <pre style={{
            backgroundColor: '#f5f5f5',
            padding: '12px',
            borderRadius: '4px',
            fontSize: '12px',
            overflow: 'auto',
            maxHeight: '400px'
          }}>
            {JSON.stringify(dynamoPreview, null, 2)}
          </pre>
        </div>
      </section>
    </main>
  );
}

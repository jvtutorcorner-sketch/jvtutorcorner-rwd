"use client";

import React, { useEffect, useState } from 'react';
import PageSettings from '../components/PageSettings';
import MenuSettings from '../components/MenuSettings';
import DropdownSettings from '../components/DropdownSettings';
import PageAccessSettings from '../components/PageAccessSettings';

type PagePermission = { roleId: string; roleName: string; menuVisible?: boolean; dropdownVisible?: boolean; pageVisible: boolean };
type PageConfig = { id: string; path: string; label?: string; permissions: PagePermission[] };
type Role = { id: string; name: string; description?: string; isActive: boolean };
type Settings = { pageConfigs: PageConfig[] } & Record<string, any>;

export default function PagePermissionsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeTab, setActiveTab] = useState<'pages' | 'menus'>('pages');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const s = await fetch('/api/admin/settings');
      const rs = await s.json();
      const r = await fetch('/api/admin/roles');
      const rr = await r.json();
      if (s.ok && rs.ok) setSettings(rs.settings || rs);
      if (r.ok && rr.ok) setRoles(rr.roles || rr);
    } catch (err) {
      console.error(err);
    }
  }

  if (!settings) return <main style={{ padding: 24 }}>Loading settings…</main>;

  return (
    <main style={{ padding: 24, maxWidth: 1400 }}>
      <h1 style={{ marginBottom: 24 }}>Page 存取權限管理</h1>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '2px solid #e5e7eb' }}>
        <button
          onClick={() => setActiveTab('pages')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'pages' ? '#2563eb' : 'transparent',
            color: activeTab === 'pages' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: activeTab === 'pages' ? '3px solid #2563eb' : '3px solid transparent',
            cursor: 'pointer',
            fontSize: 15,
            fontWeight: 600,
            transition: 'all 0.2s',
            borderRadius: '8px 8px 0 0'
          }}
        >
          📄 頁面管理與存取權限
        </button>
        <button
          onClick={() => setActiveTab('menus')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'menus' ? '#2563eb' : 'transparent',
            color: activeTab === 'menus' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: activeTab === 'menus' ? '3px solid #2563eb' : '3px solid transparent',
            cursor: 'pointer',
            fontSize: 15,
            fontWeight: 600,
            transition: 'all 0.2s',
            borderRadius: '8px 8px 0 0'
          }}
        >
          🎯 選單可見性設定
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'pages' && (
        <div>
          <section style={{ marginBottom: 24 }}>
            <PageSettings settings={settings} setSettings={setSettings} roles={roles} />
          </section>

          <section style={{ marginBottom: 24 }}>
            <PageAccessSettings settings={settings} setSettings={setSettings} roles={roles} />
          </section>
        </div>
      )}

      {activeTab === 'menus' && (
        <div>
          <section style={{ marginBottom: 24 }}>
            <MenuSettings />
          </section>

          <section style={{ marginBottom: 24 }}>
            <DropdownSettings />
          </section>
        </div>
      )}
    </main>
  );
}

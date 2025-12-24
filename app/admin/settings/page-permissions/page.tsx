"use client";

import React, { useEffect, useState } from 'react';
import PageSettings from '../components/PageSettings';
import MenuSettings from '../components/MenuSettings';
import DropdownSettings from '../components/DropdownSettings';

type PagePermission = { roleId: string; roleName: string; menuVisible?: boolean; dropdownVisible?: boolean; pageVisible: boolean };
type PageConfig = { id: string; path: string; label?: string; permissions: PagePermission[] };
type Role = { id: string; name: string; description?: string; isActive: boolean };
type Settings = { pageConfigs: PageConfig[] } & Record<string, any>;

export default function PagePermissionsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);

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
    <main style={{ padding: 24 }}>
      <h1>Page 存取權限</h1>
      <section style={{ marginTop: 12 }}>
        <h2>Page 基本設定</h2>
        <PageSettings settings={settings} setSettings={setSettings} roles={roles} />
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Menu 存取設定</h2>
        <MenuSettings />
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Dropdown Menu 存取設定</h2>
        <DropdownSettings />
      </section>
    </main>
  );
}

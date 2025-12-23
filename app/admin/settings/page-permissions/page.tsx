"use client";

import React from 'react';
import PageSettings from '../components/PageSettings';
import MenuSettings from '../components/MenuSettings';
import DropdownSettings from '../components/DropdownSettings';

export default function PagePermissionsPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Page 存取權限</h1>
      <section style={{ marginTop: 12 }}>
        <h2>Page 基本設定</h2>
        <PageSettings />
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

"use client";

import React from 'react';
import RolesUsage from '../components/RolesUsage';

export default function RolesUsagePage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Role 使用設定</h1>
      <p style={{ marginTop: 6 }}>在這裡為不同角色設定 Menu / Dropdown / Page 的可見性。</p>
      <RolesUsage />
    </main>
  );
}

"use client";

import React, { useState } from 'react';

type TabItem = {
  key: string;
  title: string;
  content: React.ReactNode;
};

export default function Tabs({ items }: { items: TabItem[] }) {
  const [active, setActive] = useState(0);
  if (!items || items.length === 0) return null;
  return (
    <div className="tabs">
      <div className="tabs-nav" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {items.map((it, i) => (
          <button
            key={it.key}
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: i === active ? '1px solid #2563eb' : '1px solid #e5e7eb',
              background: i === active ? '#eaf2ff' : '#fff',
              cursor: 'pointer'
            }}
          >
            {it.title}
          </button>
        ))}
      </div>

      <div className="tabs-panel" style={{ minHeight: 40 }}>
        {items[active].content}
      </div>
    </div>
  );
}

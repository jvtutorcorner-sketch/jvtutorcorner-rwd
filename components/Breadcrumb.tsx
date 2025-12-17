"use client";

import Link from 'next/link';
import React from 'react';

type Crumb = { label: string; href?: string };

export default function Breadcrumb({ items }: { items: Crumb[] }) {
  if (!items || items.length === 0) return null;
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb" style={{ margin: '12px 0' }}>
      <ol style={{ listStyle: 'none', display: 'flex', gap: 8, padding: 0, margin: 0, alignItems: 'center', color: '#374151' }}>
        {items.map((it, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} aria-current={isLast ? 'page' : undefined} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {it.href && !isLast ? (
                <Link href={it.href} className="breadcrumb-link" style={{ color: '#2563eb', textDecoration: 'none' }}>
                  {it.label}
                </Link>
              ) : (
                <span style={{ color: isLast ? '#111827' : '#6b7280' }}>{it.label}</span>
              )}
              {!isLast ? <span style={{ margin: '0 8px', color: '#9ca3af' }}>{'>'}</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

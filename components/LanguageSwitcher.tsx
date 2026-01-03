// components/LanguageSwitcher.tsx
"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useLocale, useSetLocale } from './IntlProvider';
import Button from './UI/Button';

type Locale = 'zh-TW' | 'zh-CN' | 'en';

// Use two-letter codes instead of flag emojis
const LANGS: { code: Locale; label: string; code2: string }[] = [
  { code: 'zh-TW', label: '繁體中文', code2: 'TW' },
  { code: 'zh-CN', label: '简体中文', code2: 'CN' },
  { code: 'en', label: 'English', code2: 'EN' },
];

export const LanguageSwitcher: React.FC = () => {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (e.target instanceof Node && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const current = LANGS.find((l) => l.code === locale) ?? LANGS[0];

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <Button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((s) => !s)} variant="outline" className="inline-flex items-center gap-2 rounded-md">
        <span style={{ fontSize: 13, fontWeight: 600 }}>{current.code2}</span>
        <span style={{ fontSize: 14 }}>{current.label}</span>
        <span aria-hidden style={{ marginLeft: 6, opacity: 0.7 }}>▾</span>
      </Button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            marginTop: 8,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
            zIndex: 100,
            minWidth: 160,
            overflow: 'hidden',
          }}
        >
          {LANGS.map((l) => (
            <Button
              key={l.code}
              role="menuitem"
              variant="ghost"
              className="w-full flex items-center gap-2 text-left px-3 py-2"
              onClick={() => {
                setLocale(l.code);
                setOpen(false);
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, width: 36 }}>{l.code2}</span>
              <span style={{ flex: 1 }}>{l.label}</span>
              {locale === l.code ? <span style={{ opacity: 0.6 }}>✓</span> : null}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};


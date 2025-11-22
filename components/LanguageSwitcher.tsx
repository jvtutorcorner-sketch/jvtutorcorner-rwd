// components/LanguageSwitcher.tsx
'use client';

import { useEffect, useState } from 'react';

type Locale = 'zh-TW' | 'en';

export const LanguageSwitcher: React.FC = () => {
  const [locale, setLocale] = useState<Locale>('zh-TW');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('locale') as Locale | null;
      if (stored) {
        setLocale(stored);
      }
    }
  }, []);

  const changeLocale = (newLocale: Locale) => {
    setLocale(newLocale);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('locale', newLocale);
      window.location.reload();
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        onClick={() => changeLocale('zh-TW')}
        style={{ fontWeight: locale === 'zh-TW' ? 'bold' : 'normal' }}
      >
        繁中
      </button>
      <button
        onClick={() => changeLocale('en')}
        style={{ fontWeight: locale === 'en' ? 'bold' : 'normal' }}
      >
        EN
      </button>
    </div>
  );
};


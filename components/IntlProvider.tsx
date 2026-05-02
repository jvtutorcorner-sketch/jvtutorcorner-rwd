"use client";

import React, { createContext, useContext, useLayoutEffect, useEffect, useState } from 'react';

type Messages = Record<string, string>;

type IntlContextValue = {
  locale: string;
  setLocale: (l: string) => void;
  t: (key: string) => string;
  ready: boolean;
};

const IntlContext = createContext<IntlContextValue | null>(null);

// 初始化函数：同步读取 localStorage 以获取正确的初始语言
function getInitialLocale(defaultLocale: string): string {
  if (typeof window === 'undefined') {
    return defaultLocale;
  }
  try {
    return window.localStorage.getItem('locale') || defaultLocale;
  } catch {
    return defaultLocale;
  }
}

export const IntlProvider: React.FC<{ children: React.ReactNode; defaultLocale?: string }> = ({ children, defaultLocale = 'zh-TW' }) => {
  const [locale, setLocaleState] = useState<string>(() => getInitialLocale(defaultLocale));
  const [messages, setMessages] = useState<Messages>({});
  const [ready, setReady] = useState(false);

  // 使用 useLayoutEffect 在浏览器绘制前同步处理语言初始化
  useLayoutEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('locale') : null;
    if (stored && stored !== locale) {
      setLocaleState(stored);
    }
  }, [locale]);

  useEffect(() => {
    async function load() {
      try {
        setReady(false);
        // Try to load locale JSON from bundled files first (faster, no network).
        try {
          // dynamic import relative to components folder -> ../locales/{locale}/common.json
          const mod = await import(`../locales/${locale}/common.json`);
          // some bundlers expose default
          setMessages((mod && (mod.default || mod)) as Messages);
        } catch (e) {
          // fallback to API route for runtime-loaded locales
          const res = await fetch(`/api/i18n?locale=${encodeURIComponent(locale)}`);
          const json = await res.json();
          if (json?.ok && json.messages) {
            setMessages(json.messages as Messages);
          } else {
            setMessages({});
          }
        }
      } catch (e) {
        setMessages({});
      } finally {
        setReady(true);
      }
    }
    load();
  }, [locale]);

  const setLocale = (l: string) => {
    setLocaleState(l);
    if (typeof window !== 'undefined') window.localStorage.setItem('locale', l);
    // do not reload; provider will fetch new messages
  };

  const t = (key: string) => {
    return messages[key] ?? key;
  };

  return (
    <IntlContext.Provider value={{ locale, setLocale, t, ready }}>
      {children}
    </IntlContext.Provider>
  );
};

export function useIntl() {
  const ctx = useContext(IntlContext);
  if (!ctx) throw new Error('useIntl must be used within IntlProvider');
  return ctx;
}

export function useT() {
  const { t } = useIntl();
  return t;
}

export function useLocale() {
  const { locale } = useIntl();
  return locale;
}

export function useSetLocale() {
  const { setLocale } = useIntl();
  return setLocale;
}

// ServerT is a simple placeholder to use in Server Components
// It will just render the key, allowing client-side hydration to handle it if needed
// or just providing a consistent way to mark translatable strings.
export function ServerT({ s }: { s: string }) {
  return <span>{s}</span>;
}

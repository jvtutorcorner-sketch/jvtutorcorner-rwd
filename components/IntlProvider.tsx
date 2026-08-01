"use client";

import React, { createContext, useContext, useLayoutEffect, useEffect, useState } from 'react';
// 靜態載入繁中字典：同時當作 SSR 種子與 fallback 來源。
// 沒有它的話 SSR 階段 messages 恆為 {}，伺服器輸出的 HTML 全是原始 key。
import zhTWMessages from '../locales/zh-TW/common.json';

type Messages = Record<string, string>;

const BASE_MESSAGES = zhTWMessages as Messages;

export const SUPPORTED_LOCALES = ['zh-TW', 'zh-CN', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(l: string | null | undefined): l is SupportedLocale {
  return !!l && (SUPPORTED_LOCALES as readonly string[]).includes(l);
}

type IntlContextValue = {
  locale: string;
  setLocale: (l: string) => void;
  t: (key: string, fallback?: string) => string;
  ready: boolean;
};

const IntlContext = createContext<IntlContextValue | null>(null);

// 初始化函数：同步读取 localStorage 以获取正确的初始语言
function getInitialLocale(defaultLocale: string): string {
  if (typeof window === 'undefined') {
    return defaultLocale;
  }
  try {
    const stored = window.localStorage.getItem('locale');
    // 未支援的值（例如手動塞入的 'ja'）會讓字典載入失敗而整站顯示原始 key，一律落回預設。
    return isSupportedLocale(stored) ? stored : defaultLocale;
  } catch {
    return defaultLocale;
  }
}

export const IntlProvider: React.FC<{ children: React.ReactNode; defaultLocale?: string }> = ({ children, defaultLocale = 'zh-TW' }) => {
  const [locale, setLocaleState] = useState<string>(() => getInitialLocale(defaultLocale));
  const [messages, setMessages] = useState<Messages>(BASE_MESSAGES);
  const [ready, setReady] = useState(false);

  // 使用 useLayoutEffect 在浏览器绘制前同步处理语言初始化
  useLayoutEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('locale') : null;
    if (isSupportedLocale(stored) && stored !== locale) {
      setLocaleState(stored);
    }
  }, [locale]);

  // 切換語言後同步 <html lang>，否則會停在 app/layout.tsx 預載腳本設定的初始值。
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    document.documentElement.setAttribute('data-locale', locale);
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
            // 降級到繁中而不是空字典，避免整站顯示原始 key。
            setMessages(BASE_MESSAGES);
          }
        }
      } catch (e) {
        setMessages(BASE_MESSAGES);
      } finally {
        setReady(true);
      }
    }
    load();
  }, [locale]);

  const setLocale = (l: string) => {
    if (!isSupportedLocale(l)) return;
    setLocaleState(l);
    if (typeof window !== 'undefined') window.localStorage.setItem('locale', l);
    // do not reload; provider will fetch new messages
  };

  // 三段查找：目標語系 -> 繁中 -> 呼叫端 fallback -> key 本身。
  // 沒有繁中這層 fallback 的話，en/zh-CN 缺的 key 會直接把識別字印在畫面上。
  const t = (key: string, fallback?: string) => {
    return messages[key] ?? BASE_MESSAGES[key] ?? fallback ?? key;
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

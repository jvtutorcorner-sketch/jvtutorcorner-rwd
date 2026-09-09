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

/** 插值變數：翻譯字串中的 `{name}` 會被對應的值取代。 */
export type TVars = Record<string, string | number>;

export type TFunction = {
  (key: string, fallback?: string, vars?: TVars): string;
  (key: string, vars: TVars): string;
};

type IntlContextValue = {
  locale: string;
  setLocale: (l: string) => void;
  t: TFunction;
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
  //
  // 第二個參數可以是 fallback 字串，也可以直接傳插值變數：
  //   t('points_amount', { count: 20 })            -> 「20 點」
  //   t('points_amount', '{count} 點', { count: 20 })
  // 用插值取代 prefix/suffix 兩個 key 的舊寫法，語序不同的語言才不會被中文語法綁死。
  const t = ((key: string, fallbackOrVars?: string | TVars, maybeVars?: TVars) => {
    const fallback = typeof fallbackOrVars === 'string' ? fallbackOrVars : undefined;
    const vars = fallbackOrVars && typeof fallbackOrVars === 'object' ? fallbackOrVars : maybeVars;
    const raw = messages[key] ?? BASE_MESSAGES[key] ?? fallback ?? key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    );
  }) as TFunction;

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

/**
 * 在 Server Component 裡輸出翻譯字串。
 *
 * IntlProvider 是 client 模組，所以 <T> 匯入到 Server Component 時會自動成為
 * client boundary——Server Component 不必整頁改寫成 client 也能跟著語言切換。
 *
 *   <h1><T k="courses_all_title" /></h1>
 *   <T k="teachers_empty_subject" vars={{ subject }} />
 */
export function T({
  k,
  fallback,
  vars,
  tVars,
}: {
  k: string;
  fallback?: string;
  vars?: TVars;
  /** 值本身也是翻譯 key 的插值變數，會先翻譯再代入（例如把科目名一起翻掉）。 */
  tVars?: Record<string, string>;
}) {
  const t = useT();
  const resolved: TVars = { ...vars };
  if (tVars) for (const [name, key] of Object.entries(tVars)) resolved[name] = t(key);
  const hasVars = Object.keys(resolved).length > 0;
  return <>{t(k, fallback, hasVars ? resolved : undefined)}</>;
}

/** @deprecated 改用 <T k="..." />。保留舊的 `s` prop 以免既有呼叫端壞掉。 */
export function ServerT({ s }: { s: string }) {
  return <T k={s} />;
}

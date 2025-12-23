"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';

type Messages = Record<string, string>;

type IntlContextValue = {
  locale: string;
  setLocale: (l: string) => void;
  t: (key: string) => string;
  ready: boolean;
};

const IntlContext = createContext<IntlContextValue | null>(null);

export const IntlProvider: React.FC<{ children: React.ReactNode; defaultLocale?: string }> = ({ children, defaultLocale = 'zh-TW' }) => {
  const [locale, setLocaleState] = useState<string>(defaultLocale);
  const [messages, setMessages] = useState<Messages>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('locale') : null;
    if (stored) setLocaleState(stored);
  }, []);

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

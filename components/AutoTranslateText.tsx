"use client";
import { useEffect, useRef, useState } from 'react';
import { useLocale } from './IntlProvider';

interface AutoTranslateTextProps {
  text: string;
  as?: 'p' | 'span' | 'h1' | 'h2' | 'div';
  className?: string;
  style?: React.CSSProperties;
  // Locale the raw text is assumed to be authored in; skipped (shown as-is) when that's the active locale.
  sourceLocale?: string;
}

function cacheKey(locale: string, text: string) {
  return `translate:${locale}:${text}`;
}

export default function AutoTranslateText({
  text,
  as = 'span',
  className,
  style,
  sourceLocale = 'zh-TW',
}: AutoTranslateTextProps) {
  const locale = useLocale();
  const [display, setDisplay] = useState(text);
  const requestedRef = useRef<string | null>(null);

  useEffect(() => {
    setDisplay(text);
    requestedRef.current = null;
  }, [text]);

  useEffect(() => {
    if (!text || !text.trim() || locale === sourceLocale) {
      setDisplay(text);
      return;
    }

    try {
      const cached = window.localStorage.getItem(cacheKey(locale, text));
      if (cached) {
        setDisplay(cached);
        return;
      }
    } catch {}

    const requestKey = `${locale}:${text}`;
    if (requestedRef.current === requestKey) return;
    requestedRef.current = requestKey;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, targetLocale: locale }),
        });
        const data = await res.json();
        if (!cancelled && res.ok && data.translated) {
          setDisplay(data.translated);
          try {
            window.localStorage.setItem(cacheKey(locale, text), data.translated);
          } catch {}
        }
      } catch {
        // network/API failure: keep showing the original text, no visible error
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locale, text, sourceLocale]);

  if (!text || !text.trim()) return null;
  const Tag = as as any;
  return (
    <Tag className={className} style={style}>
      {display}
    </Tag>
  );
}

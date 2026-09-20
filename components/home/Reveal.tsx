'use client';
// components/home/Reveal.tsx
/**
 * 進場淡入包裝：元素捲入視窗時加上 .is-visible。
 * 尊重 prefers-reduced-motion（該情況下直接顯示，不做動畫）。
 * 僅此一個新增的 client 小工具，動畫全靠 CSS，不引入動畫函式庫。
 */
import { useEffect, useRef, useState } from 'react';

interface RevealProps {
  children: React.ReactNode;
  /** 延遲毫秒，讓同區塊元素依序淡入 */
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li';
}

export function Reveal({ children, delay = 0, className = '', as = 'div' }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    // 不支援 IntersectionObserver 時，於下一個 tick 直接顯示（避免在 effect 內同步 setState）。
    // prefers-reduced-motion 由 CSS 的 media query 直接強制顯示，這裡不需處理。
    if (!el || typeof IntersectionObserver === 'undefined') {
      const id = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref as never}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

export default Reveal;

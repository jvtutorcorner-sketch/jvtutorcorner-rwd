"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import Breadcrumb from './Breadcrumb';

function getLabelForBase(base: string) {
  switch (base) {
    case '/teachers':
      return '專業師資';
    case '/pricing':
      return '方案與價格';
    case '/courses':
      return '課程總覽';
    case '/testimony':
      return '學員見證';
    case '/about':
      return '關於我們';
    case '/orders':
      return '我的訂單';
    case '/profile':
      return '個人檔案';
    case '/students':
      return '學生列表';
    default:
      return undefined;
  }
}

export default function PageBreadcrumb() {
  const pathname = usePathname() || '/';
  const parts = pathname.split('/').filter(Boolean);
  // Do not render breadcrumb on the homepage
  if (parts.length === 0) return null;

  // Do not render breadcrumb for classroom routes
  if (pathname.startsWith('/classroom')) return null;

  // First crumb always Home
  const items: { label: string; href?: string }[] = [{ label: '首頁', href: '/' }];

  // Determine base path (e.g. '/courses' from '/courses/123')
  const base = '/' + parts[0];
  const label = getLabelForBase(base) ?? decodeURIComponent(parts[0]).replace(/-/g, ' ');

  items.push({ label, href: base });

  return <Breadcrumb items={items} />;
}

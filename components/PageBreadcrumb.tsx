"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import Breadcrumb from './Breadcrumb';
import { useT } from './IntlProvider';

const BASE_KEY_MAP: Record<string, string> = {
  '/teachers': 'menu_teachers',
  '/pricing': 'menu_pricing',
  '/courses': 'menu_courses',
  '/testimony': 'menu_testimony',
  '/about': 'menu_about',
  '/orders': 'orders_my_orders',
  '/profile': 'profile_label',
  '/students': 'students_label',
};

export default function PageBreadcrumb() {
  const t = useT();
  const pathname = usePathname() || '/';
  const parts = pathname.split('/').filter(Boolean);
  // Do not render breadcrumb on the homepage
  if (parts.length === 0) return null;

  // Do not render breadcrumb for classroom routes
  if (pathname.startsWith('/classroom')) return null;

  // First crumb always Home
  const items: { label: string; href?: string }[] = [{ label: t('home'), href: '/' }];

  // Determine base path (e.g. '/courses' from '/courses/123')
  const base = '/' + parts[0];
  const labelKey = BASE_KEY_MAP[base];
  const label = labelKey ? t(labelKey) : decodeURIComponent(parts[0]).replace(/-/g, ' ');

  items.push({ label, href: base });

  return <Breadcrumb items={items} />;
}

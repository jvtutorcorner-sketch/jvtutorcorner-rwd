"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

type NavLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  exact?: boolean;
  title?: string;
};

export default function NavLink({ href, children, className = '', exact = false, title }: NavLinkProps) {
  const pathname = usePathname() || '';

  const isActive = exact
    ? pathname === href
    : pathname === href || (href !== '/' && pathname.startsWith(href + '/'));

  const classes = `${className} ${isActive ? 'active' : ''}`.trim();

  return (
    <Link href={href} className={classes} title={title}>
      {children}
    </Link>
  );
}

"use client";

import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'muted' | 'outline';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const variantMap: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200',
  ghost: 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  muted: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  outline: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
};

const sizeMap: Record<NonNullable<Props['size']>, string> = {
  sm: 'px-2 py-1 text-sm',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-sm',
};

export default function Button({ variant = 'primary', size = 'md', className = '', disabled, children, ...rest }: Props) {
  const base = 'inline-flex items-center justify-center rounded font-medium transition-colors focus:outline-none';
  const v = variantMap[variant] || variantMap.primary;
  const s = sizeMap[size] || sizeMap.md;
  const disabledCls = disabled ? 'opacity-60 cursor-not-allowed' : '';
  const cls = [base, v, s, disabledCls, className].filter(Boolean).join(' ');

  return (
    <button className={cls} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}

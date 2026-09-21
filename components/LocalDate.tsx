"use client";

import React from 'react';
import { useDateFormat, type DateInput } from '@/lib/hooks/useDateFormat';

type Props = {
  value: DateInput;
  /** 預設 'datetime'。 */
  mode?: 'date' | 'datetime' | 'time' | 'custom';
  /** mode="custom" 時使用的 Intl 選項。 */
  options?: Intl.DateTimeFormatOptions;
  /** 沒有值或無法解析時顯示的文字。 */
  fallback?: string;
};

/**
 * 依介面語系顯示日期。這是 client 元件，所以 Server Component 只要引入它，
 * 日期就會跟著語言切換，不必把整頁改寫成 client。
 *
 *   <LocalDate value={course.startDate} mode="datetime" fallback="TBD" />
 */
export default function LocalDate({ value, mode = 'datetime', options, fallback = '' }: Props) {
  const { formatDate, formatDateTime, formatTime, format } = useDateFormat();
  if (value === null || value === undefined || value === '') return <>{fallback}</>;
  const text =
    mode === 'date' ? formatDate(value)
      : mode === 'time' ? formatTime(value)
        : mode === 'custom' ? format(value, options)
          : formatDateTime(value);
  return <>{text || fallback}</>;
}

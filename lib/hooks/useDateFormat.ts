"use client";

import { useMemo, useSyncExternalStore } from 'react';
import { useLocale } from '@/components/IntlProvider';

/** IntlProvider 的預設語系，也是伺服器端唯一算得出來的語系。 */
const SSR_LOCALE = 'zh-TW';

export type DateInput = Date | string | number | null | undefined;

export type DateFormatter = {
  /** 目前實際套用的語系（hydrate 前一律是 SSR 語系）。 */
  locale: string;
  /** yyyy/mm/dd */
  formatDate: (value: DateInput, options?: Intl.DateTimeFormatOptions) => string;
  /** yyyy/mm/dd hh:mm */
  formatDateTime: (value: DateInput, options?: Intl.DateTimeFormatOptions) => string;
  /** hh:mm */
  formatTime: (value: DateInput, options?: Intl.DateTimeFormatOptions) => string;
  /** 自訂 Intl 選項。 */
  format: (value: DateInput, options?: Intl.DateTimeFormatOptions) => string;
};

const DATE_OPTS: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
const DATETIME_OPTS: Intl.DateTimeFormatOptions = { ...DATE_OPTS, hour: '2-digit', minute: '2-digit' };
const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

/**
 * 依介面語系格式化日期。
 *
 * 只用於「顯示」。寫進資料庫的時間字串不可以走這裡——那些值必須與使用者
 * 當下選的語言無關，否則同一筆資料會因為觀看者不同而存成不同格式。
 *
 * hydrate 前刻意固定用 SSR 語系：IntlProvider 的 locale 會在 useState
 * initializer 同步讀 localStorage，伺服器算 zh-TW、瀏覽器算 en，日期字串
 * 直接對不起來就會產生 hydration mismatch。等掛載後再切成真正的語系。
 */
const NO_SUBSCRIBE = () => () => {};
const IS_CLIENT = () => true;
const IS_SERVER = () => false;

export function useDateFormat(): DateFormatter {
  const locale = useLocale();
  // useSyncExternalStore 的 server/client snapshot 天生就分得開，不必用
  // effect + setState 來偵測 hydration，也就不會多觸發一次 render。
  const hydrated = useSyncExternalStore(NO_SUBSCRIBE, IS_CLIENT, IS_SERVER);
  const active = hydrated ? locale : SSR_LOCALE;

  return useMemo(() => {
    const format = (value: DateInput, options?: Intl.DateTimeFormatOptions) => {
      if (value === null || value === undefined || value === '') return '';
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      try {
        return d.toLocaleString(active, options);
      } catch {
        return d.toLocaleString(SSR_LOCALE, options);
      }
    };
    return {
      locale: active,
      format,
      formatDate: (v, o) => format(v, o ?? DATE_OPTS),
      formatDateTime: (v, o) => format(v, o ?? DATETIME_OPTS),
      formatTime: (v, o) => format(v, o ?? TIME_OPTS),
    };
  }, [active]);
}

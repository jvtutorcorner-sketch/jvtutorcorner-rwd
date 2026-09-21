import { enUS, zhCN, zhTW } from 'date-fns/locale';
import type { Locale } from 'date-fns';

/**
 * 將 IntlProvider 的 locale 代碼（zh-TW / zh-CN / en）對應到 date-fns 的 locale 物件，
 * 讓月份、星期等日期文字跟著介面語言一起切換。
 */
export function getDateFnsLocale(locale: string | undefined): Locale {
  switch (locale) {
    case 'zh-CN':
      return zhCN;
    case 'zh-TW':
      return zhTW;
    default:
      return enUS;
  }
}

export type DateFormats = {
  /** 年檢視標題 */
  year: string;
  /** 月檢視標題 */
  month: string;
  /** 日檢視標題 */
  day: string;
  /** 週檢視標題的起始日 */
  weekStart: string;
  /** 週檢視標題的結束日 */
  weekEnd: string;
  /** 完整日期（事件詳情） */
  fullDate: string;
  /** 日期 + 時間（提醒清單） */
  eventTime: string;
};

const ZH_FORMATS: DateFormats = {
  year: 'yyyy年',
  month: 'yyyy年 MMMM',
  day: 'yyyy年MM月dd日 (eeee)',
  weekStart: 'yyyy年MM月dd日',
  weekEnd: 'MM月dd日',
  fullDate: 'yyyy年MM月dd日',
  eventTime: 'yyyy/MM/dd (E) HH:mm',
};

const EN_FORMATS: DateFormats = {
  year: 'yyyy',
  month: 'MMMM yyyy',
  day: 'eeee, MMMM d, yyyy',
  weekStart: 'MMM d, yyyy',
  weekEnd: 'MMM d',
  fullDate: 'MMMM d, yyyy',
  eventTime: 'EEE, MMM d, yyyy HH:mm',
};

/**
 * date-fns 的 format pattern 依語言而異（中文帶年月日、英文用 MMMM d, yyyy）。
 * 這些字串刻意不放進 locale JSON：t() 在訊息尚未載入時會回傳 key 本身，
 * 而 key 裡的英文字母會讓 date-fns 直接丟出 "unescaped latin alphabet character"。
 */
export function getDateFormats(locale: string | undefined): DateFormats {
  return locale === 'zh-TW' || locale === 'zh-CN' ? ZH_FORMATS : EN_FORMATS;
}

/** 以 {key} 佔位符做簡單插值，供沒有參數支援的 t() 使用。 */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  );
}

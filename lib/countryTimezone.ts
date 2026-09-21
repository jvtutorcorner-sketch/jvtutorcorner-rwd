// lib/countryTimezone.ts
// 國家代碼 → IANA 時區，以及「同時取得 UTC 與當地牆上時間」的格式化工具。
//
// 原本這段在 app/login/register/page.tsx、app/login/register_enterprise/page.tsx、
// app/admin/settings/page.tsx 各有一份副本。企業 CSV 匯入搬到管理後台後需要第四份，
// 所以改抽成共用模組（純函式、無 DOM、無 server 依賴，client/server 皆可 import）。

export const COUNTRY_TIMEZONES: Record<string, string> = {
  TW: 'Asia/Taipei',
  JP: 'Asia/Tokyo',
  US: 'America/New_York',
  GB: 'Europe/London',
  HK: 'Asia/Hong_Kong',
  MO: 'Asia/Macau',
  CN: 'Asia/Shanghai',
  KR: 'Asia/Seoul',
  SG: 'Asia/Singapore',
  MY: 'Asia/Kuala_Lumpur',
  AU: 'Australia/Sydney',
  NZ: 'Pacific/Auckland',
  CA: 'America/Toronto',
  DE: 'Europe/Berlin',
  FR: 'Europe/Paris',
  ES: 'Europe/Madrid',
  IT: 'Europe/Rome',
  IN: 'Asia/Kolkata',
  BR: 'America/Sao_Paulo',
  MX: 'America/Mexico_City',
  ZA: 'Africa/Johannesburg',
};

export type LocalIsoParts = { utc: string; local: string; timezone: string };

/**
 * 回傳現在時間的 UTC ISO 字串，以及在 `timezone` 下的「牆上時間」（無時區後綴，
 * 格式 YYYY-MM-DDTHH:MM:SS）。時區無效或未指定時 local 退回 UTC ISO。
 */
export function formatLocalIso(timezone?: string): LocalIsoParts {
  const now = new Date();
  const utcIso = now.toISOString();
  if (!timezone) return { utc: utcIso, local: utcIso, timezone: 'UTC' };
  try {
    const fmt = new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    // 'sv-SE' 會輸出 YYYY-MM-DD HH:MM:SS，這裡改成 ISO 風格的 T 分隔。
    const parts = fmt.formatToParts(now).reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = (acc[part.type] || '') + part.value;
      return acc;
    }, {});
    const localIsoLike = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    return { utc: utcIso, local: localIsoLike, timezone };
  } catch {
    return { utc: utcIso, local: utcIso, timezone: 'UTC' };
  }
}

/** 國家代碼對應的時區，未知國家回 'UTC'。 */
export function timezoneForCountry(country?: string | null): string {
  return (country && COUNTRY_TIMEZONES[country]) || 'UTC';
}

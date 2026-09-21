/**
 * 註冊、企業註冊與個人設定三個頁面各自維護過一份國家清單。
 * 這裡收斂成單一來源：code 是存進資料庫的值，標籤一律走翻譯 key。
 */
export const COUNTRY_CODES = [
  'TW', 'JP', 'US', 'GB', 'HK', 'MO', 'CN', 'KR', 'SG', 'MY', 'AU',
  'NZ', 'CA', 'DE', 'FR', 'ES', 'IT', 'IN', 'BR', 'MX', 'ZA',
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

/** 國家代碼對應的翻譯 key。未知代碼回傳代碼本身，t() 會原樣輸出。 */
export function countryKey(code: string): string {
  return (COUNTRY_CODES as readonly string[]).includes(code) ? `country_${code}` : code;
}


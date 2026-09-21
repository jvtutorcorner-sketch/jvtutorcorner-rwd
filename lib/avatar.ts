// lib/avatar.ts
/**
 * 平台通用的預設頭像。
 *
 * 頭像有三種缺失情況，過去各頁面各自處理，結果是 /teachers 出現破圖：
 *   1. 教師從未上傳 avatarUrl（註冊時不會填）
 *   2. 資料庫留著舊的外連網址（例如 seed 用的 GitHub avatar），來源可能已失效
 *   3. 已上傳但檔案被刪，<img> 觸發 onError
 * 這裡集中定義預設圖與判斷規則，第 3 種由呼叫端在 onError 時改用 DEFAULT_AVATAR_URL。
 */

/** 站內自帶的預設頭像，不依賴任何外部網域 */
export const DEFAULT_AVATAR_URL = '/images/default-avatar.svg';

/**
 * 早期 seed 資料寫死的外連頭像。這些網址指向 GitHub 帳號的大頭貼，
 * 既不是平台資產也隨時可能失效，一律視為「沒有頭像」。
 */
const LEGACY_PLACEHOLDER_HOSTS = ['avatars.githubusercontent.com'];

function isLegacyPlaceholder(url: string): boolean {
  return LEGACY_PLACEHOLDER_HOSTS.some(host => url.includes(host));
}

/**
 * 取得可直接放進 <img src> 的頭像網址：
 * 沒有、空白、或是舊的外連佔位圖時，回傳平台預設圖。
 */
export function resolveAvatarUrl(avatarUrl?: unknown): string {
  if (typeof avatarUrl !== 'string') return DEFAULT_AVATAR_URL;
  const trimmed = avatarUrl.trim();
  if (!trimmed) return DEFAULT_AVATAR_URL;
  if (isLegacyPlaceholder(trimmed)) return DEFAULT_AVATAR_URL;
  return trimmed;
}

/** 這筆資料是否有教師自己上傳的頭像（用於決定要不要顯示「移除頭像」之類的操作） */
export function hasCustomAvatar(avatarUrl?: unknown): boolean {
  return resolveAvatarUrl(avatarUrl) !== DEFAULT_AVATAR_URL;
}

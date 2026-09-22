// lib/auth/internalFetch.ts
// 伺服器對自己發出的內部 API 呼叫（例如金流 webhook 收到通知後改訂單狀態）。
//
// 這些呼叫過去是完全未簽名的裸 fetch，所以被呼叫的端點必須維持無驗證才能運作 ——
// 也就等於任何人都能直接打那些端點。改用這個 helper 之後，內部呼叫會帶上 HMAC 簽名，
// 被呼叫端就可以套上 withAnyAuth / withHmac 而不會斷掉。

import { generateHmacHeaders } from './hmac';

/**
 * 解析內部呼叫要用的 base URL。
 * 優先用設定好的公開網址；沒有的話從觸發這次流程的請求 headers 推回自己。
 */
export function resolveInternalBaseUrl(originRequest?: Request): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');

  if (originRequest) {
    const proto = originRequest.headers.get('x-forwarded-proto') || 'http';
    const host = originRequest.headers.get('host');
    if (host) return `${proto}://${host}`;
  }

  return 'http://localhost:3000';
}

export type InternalFetchInit = {
  method?: string;
  /** 已序列化的 request body。簽名涵蓋這份字串，所以必須跟實際送出的完全一致。 */
  body?: string;
  headers?: Record<string, string>;
  /** 用來在沒設定 NEXT_PUBLIC_BASE_URL 時推導 base URL 的原始請求。 */
  originRequest?: Request;
  /**
   * 要納入簽名的路徑。動態路由的接收端用 `withAnyAuth('/api/x/[id]', …)` 驗證，
   * 驗證時比對的是這個「路由樣板」字串，而非帶實際 id 的具體路徑；因此呼叫動態
   * 路由時必須把樣板字串傳進來，簽名才會一致。省略時預設用 `path`（靜態路由適用）。
   */
  signPath?: string;
};

/**
 * 對自家 API 發出帶 HMAC 簽名的請求。
 *
 * @param path 實際要打的路徑，以 `/` 開頭。
 */
export async function internalFetch(path: string, init: InternalFetchInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const body = init.body ?? '';
  const signPath = init.signPath ?? path;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...generateHmacHeaders(method, signPath, body),
    ...(init.headers || {}),
  };

  const url = `${resolveInternalBaseUrl(init.originRequest)}${path}`;
  return fetch(url, {
    method,
    headers,
    body: body || undefined,
  });
}

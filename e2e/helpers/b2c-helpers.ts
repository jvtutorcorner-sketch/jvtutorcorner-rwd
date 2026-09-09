/// <reference types="node" />

/**
 * B2C 驗證輔助函數
 * =================
 *
 * 支援 `e2e/b2c_verification.spec.ts` 的四個模組：
 *   M1 渲染策略與 SEO / M2 完整轉換漏斗 / M3 訪客可及性 / M4 B2C-B2B 租戶邊界
 *
 * 設計原則：所有 SEO 斷言都對「初始 HTML」進行，而非渲染後的 DOM。
 * 用 page.content() 取到的是 JS 執行後的結果，爬蟲看不到那些內容——
 * 只有 request.get() 拿到的原始回應才代表 Googlebot 實際讀到什麼。
 */

import { APIRequestContext, APIResponse, expect } from '@playwright/test';

export const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

/** 未登入訪客必須能直接瀏覽的公開頁（獲客漏斗的入口）。 */
export const PUBLIC_ROUTES = [
  '/',
  '/courses',
  '/teachers',
  '/pricing',
  '/about',
  '/terms',
] as const;

/** 未登入訪客必須被擋下或導向登入的頁面。 */
export const PROTECTED_ROUTES = [
  '/student_courses',
  '/settings',
  '/admin',
] as const;

/**
 * 取得頁面的「初始 HTML」——不執行 JavaScript。
 * 這是判斷 SEO 是否成立的唯一可靠依據。
 */
export async function fetchRawHtml(
  request: APIRequestContext,
  route: string
): Promise<{ status: number; html: string; response: APIResponse }> {
  const response = await request.get(`${BASE_URL}${route}`, {
    // 不跟隨轉向，才能分辨「公開頁」與「被導去登入」
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  const html = await response.text().catch(() => '');
  return { status: response.status(), html, response };
}

/** 從原始 HTML 取出 <title>。 */
export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : null;
}

/** 從原始 HTML 取出指定 meta 的 content（支援 name= 與 property=）。 */
export function extractMeta(html: string, nameOrProperty: string): string | null {
  const escaped = nameOrProperty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
    'i'
  );
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  return tag.match(/content=["']([^"']*)["']/i)?.[1] ?? null;
}

/** 從原始 HTML 取出 canonical URL。 */
export function extractCanonical(html: string): string | null {
  const tag = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0];
  if (!tag) return null;
  return tag.match(/href=["']([^"']*)["']/i)?.[1] ?? null;
}

/**
 * 判斷回應是否可被 CDN 快取。
 *
 * 目前 middleware.ts 對 '/:path*' 一律送出 no-store，
 * 因此所有公開頁都會是 false——這正是稽核 P1-6 要量測的東西。
 */
export function isCdnCacheable(response: APIResponse): boolean {
  const cc = response.headers()['cache-control'] || '';
  if (/no-store|no-cache/i.test(cc)) return false;
  return /s-maxage|max-age|stale-while-revalidate/i.test(cc);
}

/** 取回應的 Cache-Control（找不到時回空字串，方便直接寫進錯誤訊息）。 */
export function cacheControlOf(response: APIResponse): string {
  return response.headers()['cache-control'] || '';
}

/**
 * 斷言某段文字出現在初始 HTML 中（代表由伺服器渲染，爬蟲讀得到）。
 * 會先剝掉 <script> 區塊，避免命中 Next.js 的 RSC payload 而誤判為通過。
 */
export function expectInServerHtml(html: string, needle: string, label: string) {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  expect(
    withoutScripts.includes(needle),
    `${label}：預期「${needle}」出現在初始 HTML 的可見標記中（非 <script> payload）。` +
      `爬蟲只讀得到伺服器輸出的內容，若此斷言失敗代表該內容是 JS 注入的。`
  ).toBe(true);
}

/**
 * 從 /api/courses 取一筆真實課程，供詳情頁的 SEO/可及性測試使用。
 * 回傳 null 表示環境中沒有課程資料，呼叫端應 skip 而非失敗。
 */
export async function pickFirstCourse(
  request: APIRequestContext
): Promise<{ id: string; title: string } | null> {
  const res = await request.get(`${BASE_URL}/api/courses`, {
    failOnStatusCode: false,
  });
  if (!res.ok()) return null;

  const body = await res.json().catch(() => null);
  const list: any[] = Array.isArray(body)
    ? body
    : body?.courses || body?.items || body?.data || [];

  const course = list.find(
    (c) => c?.id && !String(c.id).startsWith('test-course-')
  );
  if (!course) return null;

  return {
    id: String(course.id),
    title: String(course.title || course.name || ''),
  };
}

/**
 * 以 system 權限設定使用者點數（測試前置）。
 *
 * /api/points 的 add/set 僅限 admin/system——一般使用者 session 會被擋。
 * 前置資料一律走 x-e2e-secret bypass，不可用學生身分自行加點。
 */
export async function setPointsAsSystem(
  request: APIRequestContext,
  userId: string,
  amount: number,
  reason: string,
  bypassSecret: string
): Promise<APIResponse> {
  return request.post(`${BASE_URL}/api/points`, {
    data: JSON.stringify({ userId, action: 'set', amount, reason }),
    headers: {
      'Content-Type': 'application/json',
      'x-e2e-secret': bypassSecret,
    },
    failOnStatusCode: false,
  });
}

/** 讀取使用者點數餘額。 */
export async function getPoints(
  request: APIRequestContext,
  userId: string,
  bypassSecret: string
): Promise<number> {
  const res = await request.get(
    `${BASE_URL}/api/points?userId=${encodeURIComponent(userId)}`,
    { headers: { 'x-e2e-secret': bypassSecret }, failOnStatusCode: false }
  );
  if (!res.ok()) return 0;
  const json = await res.json().catch(() => ({} as any));
  return typeof json?.balance === 'number' ? json.balance : 0;
}

/** 判斷回應是否為「被導向登入」或「未授權」。 */
export function isAuthGated(status: number, response: APIResponse): boolean {
  if (status === 401 || status === 403) return true;
  if (status >= 300 && status < 400) {
    const location = response.headers()['location'] || '';
    return /login|signin|auth/i.test(location);
  }
  return false;
}

export default {
  BASE_URL,
  PUBLIC_ROUTES,
  PROTECTED_ROUTES,
  fetchRawHtml,
  extractTitle,
  extractMeta,
  extractCanonical,
  isCdnCacheable,
  cacheControlOf,
  expectInServerHtml,
  pickFirstCourse,
  setPointsAsSystem,
  getPoints,
  isAuthGated,
};

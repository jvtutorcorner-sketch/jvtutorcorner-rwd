/**
 * 權限 contract 型 verification spec 的共用工具。
 *
 * 身分：
 *   G   訪客       — 全新 APIRequestContext（沒有 cookie）；測試裡直接用 Playwright 的 `request` fixture
 *   S   學生       — 走真實 /api/login（captcha 以 LOGIN_BYPASS_SECRET 繞過），session cookie 留在該 context
 *   T   老師       — 同上
 *   SYS 系統       — `x-e2e-secret` header。apiGuard 家族（withAuth／withAdmin／withAnyAuth／withAdminOrHmac）
 *                    在角色檢查前就放行，等同 admin；手寫守衛（/api/auth/me、integration/make-*、cron/*）不認它。
 *
 * 只用於「唯讀」或「在寫入前就被擋下」的請求：不要拿 SYS 身分去打會寫資料、寄信或付款的端點。
 */

import crypto from 'crypto';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
import { BASE_URL, loginViaApi, type LoggedInProfile } from './attendance-materials-helpers';

export { BASE_URL, loginViaApi };
export type { LoggedInProfile };

export const BYPASS_SECRET = process.env.LOGIN_BYPASS_SECRET || '';
export const TEST_STUDENT = {
  email: process.env.TEST_STUDENT_EMAIL || 'basic@test.com',
  password: process.env.TEST_STUDENT_PASSWORD || '',
};
export const TEST_TEACHER = {
  email: process.env.TEST_TEACHER_EMAIL || 'lin@test.com',
  password: process.env.TEST_TEACHER_PASSWORD || process.env.QA_TEACHER_PASSWORD || '',
};
export const IS_HMAC_CONFIGURED = !!process.env.API_HMAC_SECRET;

export const JSON_HEADERS: Record<string, string> = { 'content-type': 'application/json' };

export function systemHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...JSON_HEADERS, 'x-e2e-secret': BYPASS_SECRET, ...extra };
}

export async function guestContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: BASE_URL });
}

async function loggedInContext(account: { email: string; password: string }) {
  if (!BYPASS_SECRET || !account.password) {
    throw new Error('需要在 .env.local 設定 LOGIN_BYPASS_SECRET 與測試帳號密碼');
  }
  const ctx = await guestContext();
  const profile = await loginViaApi(ctx, account.email, account.password, BYPASS_SECRET);
  return { request: ctx, profile };
}

export const studentContext = () => loggedInContext(TEST_STUDENT);
export const teacherContext = () => loggedInContext(TEST_TEACHER);

/**
 * 與 lib/auth/hmac.ts 相同的簽章：`METHOD\n<pathname+query>\n<timestamp ms>\n<body>` 的 HMAC-SHA256 hex。
 *
 * 在這裡自己算、不 import lib/auth/hmac.ts：該模組在載入當下讀 API_HMAC_SECRET，而 spec 的 import
 * 會被提升，時序不可靠。格式若與伺服器不一致，「正確簽章應被接受」的正向測試會失敗，漂移會被抓到。
 */
export function hmacHeadersAt(
  method: string,
  pathWithQuery: string,
  body: string,
  timestampMs: number
): Record<string, string> {
  const secret = process.env.API_HMAC_SECRET;
  if (!secret) throw new Error('API_HMAC_SECRET is not set');
  const timestamp = String(timestampMs);
  const signature = crypto
    .createHmac('sha256', secret)
    .update([method.toUpperCase(), pathWithQuery, timestamp, body].join('\n'))
    .digest('hex');
  return { ...JSON_HEADERS, 'X-Api-Timestamp': timestamp, 'X-Api-Signature': signature };
}

export function hmacHeaders(method: string, pathWithQuery: string, body: string): Record<string, string> {
  return hmacHeadersAt(method, pathWithQuery, body, Date.now());
}

// ─── 表格式 contract 案例 ─────────────────────────────────────────────────────

export type Who = 'G' | 'S' | 'T' | 'SYS';

export interface ContractCase {
  who: Who;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  /** JSON body（會 stringify）。 */
  body?: unknown;
  /** multipart 表單（上傳端點用；會取代 body）。 */
  multipart?: Record<string, string>;
  expect: number | number[];
  note?: string;
}

export interface Contexts {
  guest: APIRequestContext;
  student?: APIRequestContext;
  teacher?: APIRequestContext;
}

export function contractTitle(c: ContractCase): string {
  const expected = Array.isArray(c.expect) ? c.expect.join('/') : c.expect;
  return `${c.who} ${c.method} ${c.path} → ${expected}${c.note ? `（${c.note}）` : ''}`;
}

export async function runContractCase(c: ContractCase, ctx: Contexts): Promise<APIResponse> {
  const target = c.who === 'S' ? ctx.student : c.who === 'T' ? ctx.teacher : ctx.guest;
  if (!target) throw new Error(`沒有 ${c.who} 身分的 context`);

  const auth = c.who === 'SYS' ? { 'x-e2e-secret': BYPASS_SECRET } : {};
  const res = await target.fetch(c.path, {
    method: c.method,
    headers: c.multipart ? auth : { ...JSON_HEADERS, ...auth },
    ...(c.multipart ? { multipart: c.multipart } : c.body !== undefined ? { data: JSON.stringify(c.body) } : {}),
    maxRedirects: 0,
    failOnStatusCode: false,
  });

  const allowed = Array.isArray(c.expect) ? c.expect : [c.expect];
  if (!allowed.includes(res.status())) {
    const snippet = (await res.text().catch(() => '')).slice(0, 160);
    expect(allowed, `${contractTitle(c)}：實際 ${res.status()} ${snippet}`).toContain(res.status());
  }
  return res;
}

// ─── 斷言 ─────────────────────────────────────────────────────────────────────

const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

/**
 * 頁面守衛（server layout 的 redirect()）。正式 build 回 3xx；next dev 對 streaming 頁面會回 200，
 * 並把重導向目標寫進 HTML（RSC payload）——兩種都接受，但都必須指向預期的目標。
 */
export async function expectPageRedirect(res: APIResponse, fragment: string, label: string) {
  if (REDIRECT_STATUSES.includes(res.status())) {
    expect(res.headers()['location'] || '', `${label} 的 Location`).toContain(fragment);
    return;
  }
  expect(res.status(), `${label} 應被重導向`).toBe(200);
  const html = await res.text();
  expect(html.includes(fragment), `${label} 應重導向到含「${fragment}」的網址`).toBe(true);
}

/** 3xx 且 Location 含指定片段（API 路由的 NextResponse.redirect）。 */
export function expectRedirectTo(res: APIResponse, fragment: string, label: string) {
  expect(REDIRECT_STATUSES, `${label} 應回 3xx（實際 ${res.status()}）`).toContain(res.status());
  expect(res.headers()['location'] || '', `${label} 的 Location`).toContain(fragment);
}

export async function expectPageAllowed(res: APIResponse, label: string) {
  expect(res.status(), `${label} 應可進入`).toBe(200);
  const html = await res.text();
  expect(/_no_session|_invalid_session|dashboard\?forbidden=1/.test(html), `${label} 不應被重導向`).toBe(false);
}

export function setCookieHeaders(res: APIResponse): string[] {
  return res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value);
}

/** 不得發出新的 session cookie（清除 session=; Max-Age=0 可以）。 */
export function expectNoSessionCookie(res: APIResponse, label: string) {
  const issued = setCookieHeaders(res).some(
    (c) => /^session=[^;]+/.test(c.trim()) && !/max-age=0/i.test(c)
  );
  expect(issued, `${label} 不應發出 session cookie`).toBe(false);
}

export function skipUnlessEnv(...names: string[]) {
  const missing = names.filter((n) => !process.env[n]);
  test.skip(missing.length > 0, `需要環境變數：${missing.join(', ')}`);
}

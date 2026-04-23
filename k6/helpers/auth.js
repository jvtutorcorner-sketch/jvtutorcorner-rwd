// k6/helpers/auth.js
// 登入流程 helper — 取得 session cookie 供後續請求使用

import http from 'k6/http';
import { check, fail } from 'k6';
import { BASE_URL, JSON_HEADERS } from '../config.js';

/**
 * 執行登入，回傳 { sessionCookie, profile }
 * 失敗時呼叫 fail() 中止測試
 *
 * @param {object} account - { email, password, captchaValue }
 * @returns {{ sessionCookie: string, profile: object } | null}
 */
export function login(account) {
  const payload = JSON.stringify({
    email: account.email,
    password: account.password,
    captchaValue: account.captchaValue || '',
  });

  const res = http.post(`${BASE_URL}/api/login`, payload, {
    headers: JSON_HEADERS,
    tags: { name: 'login' },
  });

  const ok = check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: ok=true': (r) => {
      try { return JSON.parse(r.body).ok === true; } catch { return false; }
    },
    'login: has session cookie': (r) =>
      (r.headers['Set-Cookie'] || '').includes('session='),
  });

  if (!ok) {
    console.error(`[auth] Login failed for ${account.email}: ${res.status} ${res.body}`);
    return null;
  }

  // 解析 Set-Cookie
  const setCookie = res.headers['Set-Cookie'] || '';
  const match = setCookie.match(/session=([^;]+)/);
  const sessionCookie = match ? `session=${match[1]}` : '';

  let profile = {};
  try { profile = JSON.parse(res.body).profile || {}; } catch {}

  return { sessionCookie, profile };
}

/**
 * 建立帶有 session cookie 的 headers
 */
export function authHeaders(sessionCookie, extra = {}) {
  return {
    'Content-Type': 'application/json',
    Cookie: sessionCookie,
    ...extra,
  };
}

/**
 * 呼叫 /api/auth/me 驗證 session 有效性
 */
export function verifySession(sessionCookie) {
  const res = http.get(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: sessionCookie },
    tags: { name: 'auth_me' },
  });

  return check(res, {
    'auth/me: status 200': (r) => r.status === 200,
    'auth/me: authenticated=true': (r) => {
      try { return JSON.parse(r.body).authenticated === true; } catch { return false; }
    },
  });
}

/**
 * 登出
 */
export function logout(sessionCookie) {
  const res = http.post(`${BASE_URL}/api/logout`, '{}', {
    headers: authHeaders(sessionCookie),
    tags: { name: 'logout' },
  });

  return check(res, {
    'logout: status 200': (r) => r.status === 200,
  });
}

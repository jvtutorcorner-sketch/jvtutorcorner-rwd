/**
 * 對應 skill: .agents/skills/auth-sso/SKILL.md
 *
 * 登入、登出、Email 驗證、LINE Login 的 contract：偽造或不完整的回調不得發出 session cookie，
 * 缺欄位的請求在查資料庫與速率限制之前就被擋下。Google SSO 的偽造回調由
 * e2e/enterprise_general_security_contract.spec.ts 涵蓋，這裡不重複。
 * ⚠️ 不用真實 email 打 /api/forgot-password（會重設密碼並寄信）。
 *
 *   npx playwright test e2e/auth_sso_verification.spec.ts --project=chromium
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  contractTitle,
  expectNoSessionCookie,
  expectRedirectTo,
  runContractCase,
  setCookieHeaders,
  studentContext,
  type ContractCase,
} from './helpers/auth-helpers';

const LINE_CONFIGURED = !!(
  process.env.LINE_LOGIN_CHANNEL_ID &&
  process.env.LINE_LOGIN_CHANNEL_SECRET &&
  process.env.LINE_LOGIN_REDIRECT_URI
);

test.describe('登入與 SSO Verification (auth-sso)', () => {
  let student: APIRequestContext;

  test.beforeAll(async () => {
    student = (await studentContext()).request;
  });
  test.afterAll(async () => {
    await student?.dispose();
  });

  const CASES: ContractCase[] = [
    { who: 'G', method: 'GET', path: '/api/auth/me', expect: 401 },
    { who: 'S', method: 'GET', path: '/api/auth/me', expect: 200 },
    { who: 'G', method: 'POST', path: '/api/login', body: {}, expect: 400, note: '缺 email／password' },
    { who: 'G', method: 'POST', path: '/api/forgot-password', body: {}, expect: 400, note: '缺 email' },
    { who: 'G', method: 'POST', path: '/api/auth/resend-verification', body: {}, expect: 400 },
    { who: 'G', method: 'POST', path: '/api/logout', expect: 200, note: '沒有 session 也冪等' },
    { who: 'G', method: 'GET', path: '/api/auth/line-login/session', expect: 200, note: '未登入回 authenticated:false' },
  ];
  for (const c of CASES) {
    test(contractTitle(c), async ({ request }) => {
      await runContractCase(c, { guest: request, student });
    });
  }

  test('Email 驗證連結缺參數 → 導回錯誤頁', async ({ request }) => {
    const res = await request.get('/api/auth/verify-email', { maxRedirects: 0, failOnStatusCode: false });
    expectRedirectTo(res, 'error=invalid_verification_link', 'verify-email');
    expectNoSessionCookie(res, 'verify-email');
  });

  test.describe('LINE Login 回調', () => {
    test(`start → ${LINE_CONFIGURED ? '3xx 到 access.line.me' : '未設定 → 503'}`, async ({ request }) => {
      const res = await request.get('/api/auth/line-login/start', { maxRedirects: 0, failOnStatusCode: false });
      if (LINE_CONFIGURED) expectRedirectTo(res, 'access.line.me', 'line-login/start');
      else expect(res.status()).toBe(503);
    });

    const CALLBACKS: Array<{ label: string; query: string; cookie?: string; fragment: string }> = [
      { label: '使用者拒絕授權', query: 'error=access_denied', fragment: 'error=line_denied' },
      { label: '沒有 state cookie（CSRF）', query: 'code=forged&state=forged', fragment: 'error=line_state_mismatch' },
      { label: 'state 相符但沒有 code', query: 'state=e2e', cookie: 'line_oauth_state=e2e', fragment: 'error=line_no_code' },
    ];
    for (const cb of CALLBACKS) {
      test(`${cb.label} → ${cb.fragment}，且不發 session`, async ({ request }) => {
        const res = await request.get(`/api/auth/line-login/callback?${cb.query}`, {
          maxRedirects: 0,
          failOnStatusCode: false,
          headers: cb.cookie ? { cookie: cb.cookie } : undefined,
        });
        expectNoSessionCookie(res, cb.label);
        if (!LINE_CONFIGURED && res.status() === 503) return; // 未設定時可能在參數檢查前就回 503
        expectRedirectTo(res, cb.fragment, cb.label);
      });
    }

    test('DELETE line-login/session 清除 session cookie', async ({ request }) => {
      const res = await request.delete('/api/auth/line-login/session', { failOnStatusCode: false });
      expect(res.status()).toBe(200);
      const cleared = setCookieHeaders(res).some((c) => /^session=;|^session=\s*;|max-age=0/i.test(c.trim()));
      expect(cleared, '應送出清除 session 的 Set-Cookie').toBe(true);
    });
  });
});

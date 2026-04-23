// k6/tests/01_auth_flow.test.js
// ═══════════════════════════════════════════════════════
// 測試案例：登入 / 登出 / Session 驗證
// ═══════════════════════════════════════════════════════
//
// 執行：
//   k6 run k6/tests/01_auth_flow.test.js
//   k6 run -e BASE_URL=http://localhost:3000 k6/tests/01_auth_flow.test.js
//
// 場景：模擬 50 個使用者同時登入，持續 30 秒

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, ACCOUNTS, JSON_HEADERS, COMMON_THRESHOLDS } from '../config.js';
import { login, logout, verifySession, authHeaders } from '../helpers/auth.js';

// ─── 自訂 Metrics ─────────────────────────────────────
const loginSuccess = new Counter('login_success_total');
const loginFail    = new Counter('login_fail_total');
const sessionValid = new Rate('session_valid_rate');
const loginDuration = new Trend('login_duration_ms', true);

// ─── 測試設定 ─────────────────────────────────────────
export const options = {
  scenarios: {
    // 一般登入壓力測試
    normal_login: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 20 },  // 加速到 20 VU
        { duration: '20s', target: 50 },  // 維持 50 VU
        { duration: '10s', target: 0  },  // 降速
      ],
    },
  },
  thresholds: {
    ...COMMON_THRESHOLDS,
    'http_req_duration{name:login}': ['p(95)<600'],  // 登入要在 600ms 內
    'login_success_total': ['count>0'],
    'session_valid_rate': ['rate>0.95'],              // 95% session 要有效
  },
};

// ─── 測試入口 ─────────────────────────────────────────
export default function () {
  // 每次 VU 隨機選帳號
  const accounts = [ACCOUNTS.student, ACCOUNTS.teacher, ACCOUNTS.admin];
  const account  = accounts[Math.floor(Math.random() * accounts.length)];

  group('Auth Flow', () => {

    // ── TC-AUTH-001: 正常登入 ───────────────────────────
    group('TC-AUTH-001: Login with valid credentials', () => {
      const start = Date.now();
      const result = login(account);
      loginDuration.add(Date.now() - start);

      if (!result) {
        loginFail.add(1);
        return;
      }

      loginSuccess.add(1);
      const { sessionCookie, profile } = result;

      // ── TC-AUTH-002: Session 有效性驗證 ───────────────
      group('TC-AUTH-002: Verify session via /api/auth/me', () => {
        const valid = verifySession(sessionCookie);
        sessionValid.add(valid ? 1 : 0);

        check(sessionCookie, {
          'session cookie exists': (c) => c.startsWith('session='),
        });
      });

      // ── TC-AUTH-003: 重複使用 Session 請求 ────────────
      group('TC-AUTH-003: Use session for authenticated request', () => {
        const userId = profile.id || profile.roid_id || '';
        if (userId) {
          const res = http.get(
            `${BASE_URL}/api/points?userId=${userId}`,
            { headers: { Cookie: sessionCookie }, tags: { name: 'points_get' } }
          );
          check(res, {
            'points get: status 200 or 403': (r) => r.status === 200 || r.status === 403,
          });
        }
      });

      // ── TC-AUTH-004: 登出 ─────────────────────────────
      group('TC-AUTH-004: Logout', () => {
        const logoutOk = logout(sessionCookie);
        check(logoutOk, { 'logout succeeded': (v) => v === true });

        // 登出後 session 應失效
        const recheck = http.get(`${BASE_URL}/api/auth/me`, {
          headers: { Cookie: sessionCookie },
          tags: { name: 'auth_me_after_logout' },
        });
        check(recheck, {
          'session invalid after logout': (r) => r.status === 401,
        });
      });
    });

    // ── TC-AUTH-005: 無效憑證登入 ─────────────────────
    group('TC-AUTH-005: Login with wrong password', () => {
      const res = http.post(
        `${BASE_URL}/api/login`,
        JSON.stringify({
          email: account.email,
          password: 'wrong_password_xyz',
          captchaValue: account.captchaValue,
        }),
        { headers: JSON_HEADERS, tags: { name: 'login_wrong_pw' } }
      );
      check(res, {
        'wrong password: status 401': (r) => r.status === 401,
        'wrong password: ok=false': (r) => {
          try { return !JSON.parse(r.body).ok; } catch { return false; }
        },
      });
    });

    // ── TC-AUTH-006: 未登入存取受保護 API ─────────────
    group('TC-AUTH-006: Access protected API without session', () => {
      const res = http.get(`${BASE_URL}/api/points?userId=test`, {
        headers: JSON_HEADERS,
        tags: { name: 'unauth_access' },
      });
      check(res, {
        'no auth: status 401': (r) => r.status === 401,
      });
    });
  });

  sleep(Math.random() * 1 + 0.5); // 0.5 ~ 1.5s 間隔
}

// k6/tests/07_smoke_test.test.js
// ═══════════════════════════════════════════════════════
// 冒煙測試（Smoke Test）：快速驗證所有核心 API 通暢
// 每次 deploy 後自動執行，1 個 VU 跑 30 秒
// ═══════════════════════════════════════════════════════
//
// 執行：
//   k6 run k6/tests/07_smoke_test.test.js

import http from 'k6/http';
import { check, group } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, ACCOUNTS, JSON_HEADERS } from '../config.js';
import { login, verifySession, logout } from '../helpers/auth.js';
import { generateHmacHeaders } from '../helpers/hmac.js';

const smokeOk   = new Counter('smoke_ok');
const smokeFail = new Counter('smoke_fail');

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    // 冒煙測試：100% 通過，延遲 < 2s
    http_req_duration: ['p(100)<2000'],
    http_req_failed: ['rate<0.01'],
    'smoke_fail': ['count<1'],
  },
};

function smokeCheck(name, res, checks) {
  const passed = check(res, checks);
  if (passed) {
    smokeOk.add(1);
    console.log(`✅ [smoke] ${name}: PASS (${res.timings.duration.toFixed(0)}ms)`);
  } else {
    smokeFail.add(1);
    console.error(`❌ [smoke] ${name}: FAIL (${res.status}) body=${res.body?.slice(0, 150)}`);
  }
  return passed;
}

export default function () {
  let sessionCookie = '';
  let userId = '';
  let courseId = '';

  group('🔥 Smoke Tests', () => {

    // ── SMOKE-01: Ping / 健康檢查 ──────────────────────
    group('SMOKE-01: Health Check /api/ping', () => {
      const res = http.get(`${BASE_URL}/api/ping`, { headers: JSON_HEADERS });
      smokeCheck('ping', res, {
        'ping: status 200': (r) => r.status === 200,
      });
    });

    // ── SMOKE-02: 登入 ─────────────────────────────────
    group('SMOKE-02: Login', () => {
      const result = login(ACCOUNTS.student);
      if (result) {
        sessionCookie = result.sessionCookie;
        userId = result.profile.id || result.profile.roid_id || '';
        smokeOk.add(1);
        console.log(`✅ [smoke] Login: PASS (userId=${userId})`);
      } else {
        smokeFail.add(1);
        console.error('❌ [smoke] Login: FAIL');
      }
    });

    // ── SMOKE-03: Session 驗證 ─────────────────────────
    group('SMOKE-03: Auth Me', () => {
      if (!sessionCookie) return;
      const valid = verifySession(sessionCookie);
      if (valid) {
        smokeOk.add(1);
        console.log('✅ [smoke] Auth/me: PASS');
      } else {
        smokeFail.add(1);
        console.error('❌ [smoke] Auth/me: FAIL');
      }
    });

    // ── SMOKE-04: 課程列表 ─────────────────────────────
    group('SMOKE-04: Courses List', () => {
      const res = http.get(`${BASE_URL}/api/courses`, { headers: JSON_HEADERS });
      const passed = smokeCheck('courses', res, {
        'courses: status 200': (r) => r.status === 200,
        'courses: data is array': (r) => {
          try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; }
        },
      });
      if (passed) {
        try {
          const data = JSON.parse(res.body).data;
          courseId = data?.[0]?.id || '';
        } catch {}
      }
    });

    // ── SMOKE-05: 點數查詢（Session 驗證）─────────────
    group('SMOKE-05: Points GET (session auth)', () => {
      if (!sessionCookie || !userId) return;
      const res = http.get(
        `${BASE_URL}/api/points?userId=${userId}`,
        {
          headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
          tags: { name: 'smoke_points' },
        }
      );
      smokeCheck('points (session)', res, {
        'points: status 200': (r) => r.status === 200,
        'points: has balance': (r) => {
          try { return typeof JSON.parse(r.body).balance === 'number'; } catch { return false; }
        },
      });
    });

    // ── SMOKE-06: 點數查詢（HMAC 驗證）──────────────
    group('SMOKE-06: Points GET (HMAC auth)', () => {
      if (!userId) return;
      const path = '/api/points';
      const headers = generateHmacHeaders('GET', path, '');
      const res = http.get(`${BASE_URL}${path}?userId=${userId}`, {
        headers,
        tags: { name: 'smoke_points_hmac' },
      });
      smokeCheck('points (HMAC)', res, {
        'points HMAC: not 401': (r) => r.status !== 401,
        'points HMAC: status 200 or 403': (r) => [200, 403].includes(r.status),
      });
    });

    // ── SMOKE-07: 未授權存取 → 要回 401 ──────────────
    group('SMOKE-07: Unauthorized access returns 401', () => {
      const res = http.get(`${BASE_URL}/api/points?userId=test`, {
        headers: JSON_HEADERS,
        tags: { name: 'smoke_unauth' },
      });
      smokeCheck('unauthorized', res, {
        'unauthorized: status 401': (r) => r.status === 401,
      });
    });

    // ── SMOKE-08: 登出 ─────────────────────────────────
    group('SMOKE-08: Logout', () => {
      if (!sessionCookie) return;
      const ok = logout(sessionCookie);
      if (ok) {
        smokeOk.add(1);
        console.log('✅ [smoke] Logout: PASS');

        // 確認 session 失效
        const recheck = http.get(`${BASE_URL}/api/auth/me`, {
          headers: { Cookie: sessionCookie },
        });
        smokeCheck('session invalidated', recheck, {
          'post-logout session: 401': (r) => r.status === 401,
        });
      } else {
        smokeFail.add(1);
        console.error('❌ [smoke] Logout: FAIL');
      }
    });
  });
}

// k6/tests/03_points_api.test.js
// ═══════════════════════════════════════════════════════
// 測試案例：/api/points 點數 API 完整功能 + 效能
// ═══════════════════════════════════════════════════════
//
// 執行：
//   k6 run k6/tests/03_points_api.test.js
//
// 場景：模擬真實用戶讀取點數、扣點的高低峰混合流量

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { BASE_URL, ACCOUNTS, COMMON_THRESHOLDS } from '../config.js';
import { TEST_PAYLOADS } from '../test_data.js';
import { login, authHeaders } from '../helpers/auth.js';
import { generateHmacHeaders } from '../helpers/hmac.js';

const pointsReadOk  = new Counter('points_read_ok');
const pointsWriteOk = new Counter('points_write_ok');
const pointsAuthFail = new Counter('points_auth_fail');
const readLatency   = new Trend('points_read_latency_ms', true);
const writeLatency  = new Trend('points_write_latency_ms', true);

export const options = {
  scenarios: {
    // 高流量讀取場景（用戶頻繁查餘額）
    read_heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 30 },
        { duration: '30s', target: 80 },
        { duration: '15s', target: 0 },
      ],
      tags: { scenario: 'read_heavy' },
    },
    // 低頻寫入場景（交易扣點）
    write_sparse: {
      executor: 'constant-arrival-rate',
      rate: 5,           // 每秒 5 次寫入請求
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 10,
      maxVUs: 20,
      tags: { scenario: 'write_sparse' },
    },
  },
  thresholds: {
    ...COMMON_THRESHOLDS,
    'http_req_duration{name:points_get}': ['p(95)<300', 'p(99)<600'],
    'http_req_duration{name:points_post}': ['p(95)<500', 'p(99)<1000'],
    'points_read_ok': ['count>10'],
    'points_auth_fail': ['count<5'],
  },
};

// ─── Setup: 登入取得 session ───────────────────────────
export function setup() {
  const result = login(ACCOUNTS.student);
  if (!result) {
    return { sessionCookie: '', userId: '' };
  }
  return {
    sessionCookie: result.sessionCookie,
    userId: result.profile.id || result.profile.roid_id || '',
  };
}

export default function (data) {
  const { sessionCookie, userId } = data;

  if (!sessionCookie || !userId) {
    pointsAuthFail.add(1);
    return;
  }

  group('Points API Tests', () => {

    // ── TC-POINTS-001: 查詢自己的點數餘額 ───────────
    group('TC-POINTS-001: GET points - own user', () => {
      const start = Date.now();
      const res = http.get(
        `${BASE_URL}/api/points?userId=${userId}`,
        {
          headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
          tags: { name: 'points_get' },
        }
      );
      readLatency.add(Date.now() - start);

      const passed = check(res, {
        'GET points: status 200': (r) => r.status === 200,
        'GET points: ok=true': (r) => {
          try { return JSON.parse(r.body).ok === true; } catch { return false; }
        },
        'GET points: has balance': (r) => {
          try {
            const b = JSON.parse(r.body).balance;
            return typeof b === 'number' && b >= 0;
          } catch { return false; }
        },
      });

      if (passed) pointsReadOk.add(1);
      else pointsAuthFail.add(1);
    });

    // ── TC-POINTS-002: 查詢他人點數（應被拒絕）──────
    group('TC-POINTS-002: GET points - other user should be 403', () => {
      const res = http.get(
        `${BASE_URL}/api/points?userId=another-user-id-that-does-not-match`,
        {
          headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
          tags: { name: 'points_get_other' },
        }
      );
      check(res, {
        'GET other user points: status 403': (r) => r.status === 403,
      });
    });

    // ── TC-POINTS-003: HMAC 服務查詢任意用戶點數 ──────
    group('TC-POINTS-003: GET points via HMAC (system service)', () => {
      const path = '/api/points';
      const headers = generateHmacHeaders('GET', path, '');

      const res = http.get(
        `${BASE_URL}${path}?userId=${userId}`,
        { headers, tags: { name: 'points_get_hmac' } }
      );
      check(res, {
        'HMAC GET points: not 401': (r) => r.status !== 401,
        'HMAC GET points: status 200 or 403': (r) => [200, 403].includes(r.status),
      });
    });

    // ── TC-POINTS-004: 點數加法（僅 scenario=write_sparse 執行）
    if (__ENV.K6_SCENARIO === 'write_sparse') {
      group('TC-POINTS-004: POST points add (system HMAC)', () => {
        const path = '/api/points';
        const body = JSON.stringify({
          userId,
          ...TEST_PAYLOADS.points_add,
        });
        const headers = generateHmacHeaders('POST', path, body);

        const start = Date.now();
        const res = http.post(`${BASE_URL}${path}`, body, {
          headers,
          tags: { name: 'points_post' },
        });
        writeLatency.add(Date.now() - start);

        const passed = check(res, {
          'POST points: status 200': (r) => r.status === 200,
          'POST points: ok=true': (r) => {
            try { return JSON.parse(r.body).ok === true; } catch { return false; }
          },
        });

        if (passed) pointsWriteOk.add(1);
      });
    }

    // ── TC-POINTS-005: 缺少 userId 參數 ──────────────
    group('TC-POINTS-005: GET points - missing userId param', () => {
      const res = http.get(
        `${BASE_URL}/api/points`,
        {
          headers: { Cookie: sessionCookie },
          tags: { name: 'points_missing_uid' },
        }
      );
      check(res, {
        'missing userId: status 400': (r) => r.status === 400,
      });
    });
  });

  sleep(Math.random() * 0.5 + 0.1);
}

// ─── Teardown ──────────────────────────────────────────
export function teardown(data) {
  if (data.sessionCookie) {
    http.post(`${BASE_URL}/api/logout`, '{}', {
      headers: { Cookie: data.sessionCookie, 'Content-Type': 'application/json' },
    });
  }
}

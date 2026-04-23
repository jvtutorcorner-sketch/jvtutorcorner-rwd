// k6/tests/02_hmac_auth.test.js
// ═══════════════════════════════════════════════════════
// 測試案例：HMAC 服務間 API 認證
// ═══════════════════════════════════════════════════════
//
// 執行：
//   k6 run -e API_HMAC_SECRET=jv_hmac_secret_change_in_production_2024 k6/tests/02_hmac_auth.test.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { BASE_URL, COMMON_THRESHOLDS } from '../config.js';
import { generateHmacHeaders } from '../helpers/hmac.js';

const hmacSuccess = new Counter('hmac_success_total');
const hmacFail    = new Counter('hmac_fail_total');
const hmacReject  = new Rate('hmac_reject_rate');   // 無效簽名被拒絕的比率

export const options = {
  scenarios: {
    hmac_calls: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
    },
  },
  thresholds: {
    ...COMMON_THRESHOLDS,
    'http_req_duration{name:hmac_points_get}': ['p(95)<400'],
    'hmac_reject_rate': ['rate>0.99'], // 無效簽名 99%+ 要被拒絕
  },
};

// 測試用 userId（只讀，不影響真實資料）
const TEST_USER_ID = __ENV.TEST_USER_ID || 'system-test-user';

export default function () {
  group('HMAC Auth Tests', () => {

    // ── TC-HMAC-001: 正確 HMAC 簽名 GET ───────────────
    group('TC-HMAC-001: Valid HMAC GET /api/points', () => {
      const path = '/api/points';
      const headers = generateHmacHeaders('GET', path, '');

      const res = http.get(
        `${BASE_URL}${path}?userId=${TEST_USER_ID}`,
        { headers, tags: { name: 'hmac_points_get' } }
      );

      const passed = check(res, {
        'HMAC GET: status 200 or 403': (r) => r.status === 200 || r.status === 403,
        'HMAC GET: not 401': (r) => r.status !== 401,
      });

      if (passed) {
        hmacSuccess.add(1);
      } else {
        hmacFail.add(1);
        console.error(`[hmac] GET failed: ${res.status} ${res.body}`);
      }
    });

    // ── TC-HMAC-002: 正確 HMAC 簽名 POST ──────────────
    group('TC-HMAC-002: Valid HMAC POST /api/points (dry-run with system user)', () => {
      const path = '/api/points';
      const body = JSON.stringify({
        userId: TEST_USER_ID,
        action: 'add',
        amount: 0,             // 加 0 點：不改變資料，純驗證認證
        reason: 'k6-hmac-test',
      });
      const headers = generateHmacHeaders('POST', path, body);

      const res = http.post(`${BASE_URL}${path}`, body, {
        headers,
        tags: { name: 'hmac_points_post' },
      });

      check(res, {
        'HMAC POST: not 401 or 403': (r) => r.status !== 401 && r.status !== 403,
        'HMAC POST: ok response': (r) => [200, 201, 400].includes(r.status),
      });
    });

    // ── TC-HMAC-003: 無效簽名（應被拒絕）────────────
    group('TC-HMAC-003: Invalid HMAC signature should be rejected', () => {
      const res = http.get(
        `${BASE_URL}/api/points?userId=${TEST_USER_ID}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Timestamp': String(Date.now()),
            'X-Api-Signature': 'deadbeef1234567890abcdef', // 假簽名
          },
          tags: { name: 'hmac_invalid_sig' },
        }
      );

      const rejected = check(res, {
        'invalid sig: status 401 or 403': (r) => r.status === 401 || r.status === 403,
      });
      hmacReject.add(rejected ? 1 : 0);
    });

    // ── TC-HMAC-004: 過期時間戳（重放攻擊）────────────
    group('TC-HMAC-004: Expired timestamp (replay attack) should be rejected', () => {
      const path = '/api/points';
      // 6 分鐘前的時間戳（超出 5 分鐘容許範圍）
      const oldTimestamp = String(Date.now() - 6 * 60 * 1000);
      const { hmac } = require('k6/crypto');
      const secret   = __ENV.API_HMAC_SECRET || 'jv_hmac_secret_change_in_production_2024';
      const message  = `GET\n${path}\n${oldTimestamp}\n`;
      const fakeSig  = hmac('sha256', secret, message, 'hex');

      const res = http.get(
        `${BASE_URL}${path}?userId=${TEST_USER_ID}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Timestamp': oldTimestamp,
            'X-Api-Signature': fakeSig,
          },
          tags: { name: 'hmac_replay' },
        }
      );

      check(res, {
        'replay attack: status 401 or 403': (r) => r.status === 401 || r.status === 403,
      });
    });

    // ── TC-HMAC-005: 缺少 HMAC Headers 且無 Cookie ───
    group('TC-HMAC-005: Missing headers without session should return 401', () => {
      const res = http.get(
        `${BASE_URL}/api/points?userId=${TEST_USER_ID}`,
        {
          headers: { 'Content-Type': 'application/json' },
          tags: { name: 'hmac_no_headers' },
        }
      );
      check(res, {
        'no auth headers: status 401': (r) => r.status === 401,
      });
    });
  });

  sleep(0.5);
}

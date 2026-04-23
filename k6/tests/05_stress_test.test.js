// k6/tests/05_stress_test.test.js
// ═══════════════════════════════════════════════════════
// 壓力測試：尋找系統的臨界點（spike + stress + soak）
// ═══════════════════════════════════════════════════════
//
// 執行（預設 stress）：
//   k6 run k6/tests/05_stress_test.test.js
//
// 指定場景：
//   k6 run -e SCENARIO=spike k6/tests/05_stress_test.test.js
//   k6 run -e SCENARIO=soak  k6/tests/05_stress_test.test.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { BASE_URL, ACCOUNTS, JSON_HEADERS, COMMON_THRESHOLDS } from '../config.js';
import { login } from '../helpers/auth.js';
import { generateHmacHeaders } from '../helpers/hmac.js';

const errorRate    = new Rate('error_rate');
const p99Latency   = new Trend('p99_latency', true);
const requestOk    = new Counter('request_ok');
const requestError = new Counter('request_error');

// ─── 場景選擇 ─────────────────────────────────────────
const SCENARIO = __ENV.SCENARIO || 'stress';

const SCENARIOS = {
  // 壓力測試：逐步增量到臨界點
  stress: {
    ramping_vus: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m',  target: 100  },  // 熱身
        { duration: '5m',  target: 200  },  // 加壓
        { duration: '5m',  target: 300  },  // 持續壓力
        { duration: '2m',  target: 400  },  // 極限測試
        { duration: '2m',  target: 0    },  // 冷卻
      ],
    },
  },
  // 突刺測試：模擬瞬間高峰（如搶票）
  spike: {
    spike_vus: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 10  },   // 正常基線
        { duration: '1m',  target: 10  },
        { duration: '10s', target: 1000 },  // 突刺！
        { duration: '3m',  target: 1000 },  // 維持峰值
        { duration: '10s', target: 10  },   // 回落
        { duration: '3m',  target: 10  },   // 恢復觀察
        { duration: '10s', target: 0   },
      ],
    },
  },
  // 浸泡測試：長時間低負載（找記憶體洩漏 / session 過期問題）
  soak: {
    soak_vus: {
      executor: 'constant-vus',
      vus: 20,
      duration: '2h',
    },
  },
};

export const options = {
  scenarios: SCENARIOS[SCENARIO] || SCENARIOS.stress,
  thresholds: {
    // 壓力測試允許稍寬的容差
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    http_req_failed: ['rate<0.05'],    // 壓力情境允許 5% 失敗率
    error_rate: ['rate<0.05'],
    request_ok: ['count>100'],
  },
};

// ─── Setup: 預先登入取得 session ────────────────────────
export function setup() {
  const attempts = [ACCOUNTS.student, ACCOUNTS.teacher, ACCOUNTS.admin];
  for (const account of attempts) {
    const result = login(account);
    if (result) {
      return {
        sessionCookie: result.sessionCookie,
        userId: result.profile.id || result.profile.roid_id || '',
      };
    }
  }
  return { sessionCookie: '', userId: '' };
}

// ─── 工作負載定義 ────────────────────────────────────
const ENDPOINTS = [
  { method: 'GET',  url: (uid) => `/api/courses`,              weight: 40 }, // 40% 瀏覽課程
  { method: 'GET',  url: (uid) => `/api/auth/me`,              weight: 20 }, // 20% Session 驗證
  { method: 'GET',  url: (uid) => `/api/points?userId=${uid}`, weight: 20 }, // 20% 查點數
  { method: 'GET',  url: (uid) => `/api/ping`,                 weight: 10 }, // 10% 健康檢查
  { method: 'POST', url: (uid) => `/api/login`,                weight: 10 }, // 10% 登入（重新）
];

function pickEndpoint() {
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (const ep of ENDPOINTS) {
    cumulative += ep.weight;
    if (rand < cumulative) return ep;
  }
  return ENDPOINTS[0];
}

export default function (data) {
  const { sessionCookie, userId } = data;
  const ep = pickEndpoint();

  let res;
  const url = `${BASE_URL}${ep.url(userId)}`;

  if (ep.method === 'GET') {
    res = http.get(url, {
      headers: sessionCookie
        ? { Cookie: sessionCookie, 'Content-Type': 'application/json' }
        : JSON_HEADERS,
      tags: { endpoint: ep.url('uid') },
    });
  } else if (ep.method === 'POST' && url.includes('/api/login')) {
    res = http.post(url, JSON.stringify({
      email: ACCOUNTS.student.email,
      password: ACCOUNTS.student.password,
      captchaValue: ACCOUNTS.student.captchaValue,
    }), {
      headers: JSON_HEADERS,
      tags: { endpoint: 'login' },
    });
  } else {
    return;
  }

  p99Latency.add(res.timings.duration);

  const ok = check(res, {
    'stress: status not 5xx': (r) => r.status < 500,
    'stress: response time < 3s': (r) => r.timings.duration < 3000,
  });

  if (ok) {
    requestOk.add(1);
    errorRate.add(0);
  } else {
    requestError.add(1);
    errorRate.add(1);
    if (res.status >= 500) {
      console.error(`[stress] 5xx from ${ep.method} ${url}: ${res.status} body=${res.body?.slice(0, 200)}`);
    }
  }

  // 浸泡測試加較長 sleep，降低平均 RPS
  const sleepTime = SCENARIO === 'soak' ? Math.random() * 3 + 1 : Math.random() * 0.5 + 0.1;
  sleep(sleepTime);
}

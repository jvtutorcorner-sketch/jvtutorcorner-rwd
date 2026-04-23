// k6/tests/04_courses_api.test.js
// ═══════════════════════════════════════════════════════
// 測試案例：/api/courses 課程 API
// ═══════════════════════════════════════════════════════
//
// 執行：
//   k6 run k6/tests/04_courses_api.test.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL, ACCOUNTS, JSON_HEADERS, COMMON_THRESHOLDS } from '../config.js';
import { login } from '../helpers/auth.js';

const coursesReadOk = new Counter('courses_read_ok');
const listLatency   = new Trend('courses_list_latency_ms', true);
const detailLatency = new Trend('courses_detail_latency_ms', true);

export const options = {
  scenarios: {
    browse_courses: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 40 },
        { duration: '40s', target: 100 }, // 模擬高峰 100 人同時瀏覽課程
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    ...COMMON_THRESHOLDS,
    'http_req_duration{name:courses_list}': ['p(95)<600', 'p(99)<1200'],
    'http_req_duration{name:courses_detail}': ['p(95)<400'],
    'courses_read_ok': ['count>10'],
  },
};

let COURSE_IDS = []; // 從列表 API 動態取得

export function setup() {
  // 以 student 登入來測試已授權的課程存取
  const result = login(ACCOUNTS.student);
  const sessionCookie = result ? result.sessionCookie : '';

  // 預先取得課程清單，供 detail 測試用
  const listRes = http.get(`${BASE_URL}/api/courses`, { headers: JSON_HEADERS });
  try {
    const body = JSON.parse(listRes.body);
    if (body.ok && Array.isArray(body.data)) {
      COURSE_IDS = body.data.slice(0, 10).map((c) => c.id).filter(Boolean);
    }
  } catch {}

  return { sessionCookie, courseIds: COURSE_IDS };
}

export default function (data) {
  const { sessionCookie, courseIds } = data;

  group('Courses API Tests', () => {

    // ── TC-COURSES-001: 公開課程列表（不需登入）────────
    group('TC-COURSES-001: GET /api/courses - public list', () => {
      const start = Date.now();
      const res = http.get(`${BASE_URL}/api/courses`, {
        headers: JSON_HEADERS,
        tags: { name: 'courses_list' },
      });
      listLatency.add(Date.now() - start);

      const passed = check(res, {
        'courses list: status 200': (r) => r.status === 200,
        'courses list: ok=true': (r) => {
          try { return JSON.parse(r.body).ok === true; } catch { return false; }
        },
        'courses list: data is array': (r) => {
          try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; }
        },
        'courses list: response time < 1s': (r) => r.timings.duration < 1000,
      });

      if (passed) coursesReadOk.add(1);
    });

    // ── TC-COURSES-002: 課程詳細資訊 ────────────────
    group('TC-COURSES-002: GET /api/courses?id=xxx - detail', () => {
      if (!courseIds || courseIds.length === 0) return;

      const randomId = courseIds[Math.floor(Math.random() * courseIds.length)];
      const start = Date.now();
      const res = http.get(
        `${BASE_URL}/api/courses?id=${encodeURIComponent(randomId)}`,
        { headers: JSON_HEADERS, tags: { name: 'courses_detail' } }
      );
      detailLatency.add(Date.now() - start);

      check(res, {
        'course detail: status 200': (r) => r.status === 200,
        'course detail: has course object': (r) => {
          try { return !!JSON.parse(r.body).course; } catch { return false; }
        },
      });
    });

    // ── TC-COURSES-003: 不存在的課程 ID ─────────────
    group('TC-COURSES-003: GET non-existent course', () => {
      const res = http.get(
        `${BASE_URL}/api/courses?id=nonexistent-course-id-xyz`,
        { headers: JSON_HEADERS, tags: { name: 'courses_not_found' } }
      );
      check(res, {
        'not found: status 404': (r) => r.status === 404,
      });
    });

    // ── TC-COURSES-004: 篩選特定老師的課程 ──────────
    group('TC-COURSES-004: GET courses by teacherId', () => {
      const res = http.get(
        `${BASE_URL}/api/courses?teacherId=lin@test.com`,
        { headers: JSON_HEADERS, tags: { name: 'courses_by_teacher' } }
      );
      check(res, {
        'by teacher: status 200': (r) => r.status === 200,
        'by teacher: ok=true': (r) => {
          try { return JSON.parse(r.body).ok === true; } catch { return false; }
        },
      });
    });

    // ── TC-COURSES-005: 並行請求穩定性 ──────────────
    group('TC-COURSES-005: Concurrent requests stability', () => {
      const responses = http.batch([
        ['GET', `${BASE_URL}/api/courses`, null, { tags: { name: 'courses_batch_1' } }],
        ['GET', `${BASE_URL}/api/courses`, null, { tags: { name: 'courses_batch_2' } }],
        ['GET', `${BASE_URL}/api/courses`, null, { tags: { name: 'courses_batch_3' } }],
      ]);

      responses.forEach((res, i) => {
        check(res, {
          [`batch ${i + 1}: status 200`]: (r) => r.status === 200,
        });
      });
    });
  });

  sleep(Math.random() * 1 + 0.2);
}

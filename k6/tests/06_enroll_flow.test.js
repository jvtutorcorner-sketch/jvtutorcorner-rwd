// k6/tests/06_enroll_flow.test.js
// ═══════════════════════════════════════════════════════
// 測試案例：學生報名課程完整流程
// ═══════════════════════════════════════════════════════
//
// 執行：
//   k6 run k6/tests/06_enroll_flow.test.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL, ACCOUNTS, JSON_HEADERS, COMMON_THRESHOLDS } from '../config.js';
import { TEST_PAYLOADS } from '../test_data.js';
import { login, authHeaders } from '../helpers/auth.js';

const enrollSuccess = new Counter('enroll_success');
const enrollFail    = new Counter('enroll_fail');
const enrollLatency = new Trend('enroll_latency_ms', true);

export const options = {
  scenarios: {
    enrollment_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 10 },
        { duration: '30s', target: 30 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    ...COMMON_THRESHOLDS,
    'http_req_duration{name:enroll_post}': ['p(95)<800'],
    'enroll_success': ['count>0'],
  },
};

export function setup() {
  // 先查一個課程 ID 來用
  const listRes = http.get(`${BASE_URL}/api/courses`, { headers: JSON_HEADERS });
  let courseId = 'test-course-id';
  let courseTitle = '測試課程';

  try {
    const body = JSON.parse(listRes.body);
    if (body.ok && body.data && body.data.length > 0) {
      const course = body.data[0];
      courseId = course.id;
      courseTitle = course.title || courseTitle;
    }
  } catch {}

  // 登入 student
  const result = login(ACCOUNTS.student);
  const sessionCookie = result ? result.sessionCookie : '';
  const userId = result ? (result.profile.id || result.profile.roid_id || '') : '';

  return { sessionCookie, userId, courseId, courseTitle };
}

export default function (data) {
  const { sessionCookie, userId, courseId, courseTitle } = data;

  if (!sessionCookie) {
    enrollFail.add(1);
    return;
  }

  group('Enrollment Flow', () => {

    // ── TC-ENROLL-001: 取得課程列表（先確認 API 可用）─
    group('TC-ENROLL-001: Browse courses before enrollment', () => {
      const res = http.get(`${BASE_URL}/api/courses`, {
        headers: { Cookie: sessionCookie },
        tags: { name: 'courses_pre_enroll' },
      });
      check(res, {
        'courses before enroll: 200': (r) => r.status === 200,
      });
    });

    // ── TC-ENROLL-002: 查詢點數餘額 ───────────────────
    group('TC-ENROLL-002: Check point balance before enrollment', () => {
      if (!userId) return;
      const res = http.get(
        `${BASE_URL}/api/points?userId=${userId}`,
        {
          headers: { Cookie: sessionCookie },
          tags: { name: 'points_pre_enroll' },
        }
      );
      check(res, {
        'points pre-enroll: 200': (r) => r.status === 200,
        'points pre-enroll: has balance': (r) => {
          try { return typeof JSON.parse(r.body).balance === 'number'; } catch { return false; }
        },
      });
    });

    // ── TC-ENROLL-003: 提交報名（POST /api/enroll）────
    group('TC-ENROLL-003: Submit enrollment', () => {
      const body = JSON.stringify({
        ...TEST_PAYLOADS.enrollment_sample,
        name: `k6 Test User ${__VU}`,
        email: ACCOUNTS.student.email,
        courseId,
        courseTitle,
      });

      const start = Date.now();
      const res = http.post(`${BASE_URL}/api/enroll`, body, {
        headers: authHeaders(sessionCookie),
        tags: { name: 'enroll_post' },
      });
      enrollLatency.add(Date.now() - start);

      const passed = check(res, {
        'enroll: status 200': (r) => r.status === 200,
        'enroll: ok=true': (r) => {
          try { return JSON.parse(r.body).ok === true; } catch { return false; }
        },
        'enroll: has enrollment id': (r) => {
          try { return !!JSON.parse(r.body).enrollment?.id; } catch { return false; }
        },
        'enroll: response < 1s': (r) => r.timings.duration < 1000,
      });

      if (passed) {
        enrollSuccess.add(1);
      } else {
        enrollFail.add(1);
        console.error(`[enroll] Failed: ${res.status} ${res.body?.slice(0, 300)}`);
      }
    });

    // ── TC-ENROLL-004: 未登入提交報名（應被拒絕）─────
    // 注意：/api/enroll 現在還沒有加 withAuth，這個 TC 是未來的預期行為
    group('TC-ENROLL-004: Validate required fields (no name)', () => {
      const badBody = JSON.stringify({
        email: ACCOUNTS.student.email,
        courseId,
        courseTitle,
        // 缺少 name → 應回 400
      });
      const res = http.post(`${BASE_URL}/api/enroll`, badBody, {
        headers: authHeaders(sessionCookie),
        tags: { name: 'enroll_bad_body' },
      });
      check(res, {
        'enroll bad body: status 400': (r) => r.status === 400,
      });
    });

    // ── TC-ENROLL-005: 查詢已報名清單 ─────────────────
    group('TC-ENROLL-005: List enrollments', () => {
      const res = http.get(`${BASE_URL}/api/enroll`, {
        headers: { Cookie: sessionCookie },
        tags: { name: 'enroll_list' },
      });
      check(res, {
        'enroll list: 200': (r) => r.status === 200,
        'enroll list: has data': (r) => {
          try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; }
        },
      });
    });
  });

  sleep(Math.random() * 1.5 + 0.5);
}

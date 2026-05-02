/**
 * Production Load Testing Script using k6
 * ========================================
 *
 * 用途：針對正式環境 (https://www.jvtutorcorner.com) 進行真正的負載測試
 * 測試場景：模擬多個並發用戶登入、進入教室、進行白板同步
 *
 * 前置條件：
 *   - 安裝 k6: https://k6.io/docs/getting-started/installation/
 *   - 配置 .env.production 文件中的認證信息
 *
 * 使用方式：
 *   # 基礎負載測試（10 個虛擬用戶，30 秒持續）
 *   k6 run .agents/skills/classroom-room-whiteboard-sync/scripts/production_load_test.js
 *
 *   # 自定義並發用戶數
 *   k6 run -e VUSER=50 .agents/skills/classroom-room-whiteboard-sync/scripts/production_load_test.js
 *
 *   # 進行壓力測試（逐步增加用戶）
 *   k6 run -e TEST_TYPE=stress .agents/skills/classroom-room-whiteboard-sync/scripts/production_load_test.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// ─────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'https://www.jvtutorcorner.com';
const TEST_TYPE = __ENV.TEST_TYPE || 'load'; // 'load', 'stress', 'spike'
const VUSER = parseInt(__ENV.VUSER || '10'); // Virtual Users
const DURATION = __ENV.DURATION || '30s'; // Test duration

function requireEnv(name) {
  const value = __ENV[name];
  if (!value) {
    throw new Error(`[config] Missing required env var: ${name}`);
  }
  return value;
}

const TEST_CONFIG = {
  teacher: {
    email: requireEnv('QA_TEACHER_EMAIL'),
    password: requireEnv('QA_TEACHER_PASSWORD'),
  },
  student: {
    email: requireEnv('QA_STUDENT_EMAIL'),
    password: requireEnv('QA_STUDENT_PASSWORD'),
  },
  bypassSecret: requireEnv('LOGIN_BYPASS_SECRET'),
};

// ─────────────────────────────────────────────────────────────────────
// Custom Metrics
// ─────────────────────────────────────────────────────────────────────

const loginErrorRate = new Rate('login_error_rate');
const classroomEntryErrorRate = new Rate('classroom_entry_error_rate');
const whiteboardSyncErrorRate = new Rate('whiteboard_sync_error_rate');
const loginDuration = new Trend('login_duration_ms');
const classroomEntryDuration = new Trend('classroom_entry_duration_ms');
const whiteboardSyncDuration = new Trend('whiteboard_sync_duration_ms');
const activeUsers = new Gauge('active_users');
const loginAttempts = new Counter('login_attempts_total');

// ─────────────────────────────────────────────────────────────────────
// Test Scenarios
// ─────────────────────────────────────────────────────────────────────

export const options = {
  stages: (() => {
    switch (TEST_TYPE) {
      case 'smoke':
        // Quick sanity check
        return [
          { duration: '10s', target: 2 },
          { duration: '10s', target: 2 },
          { duration: '10s', target: 0 },
        ];

      case 'load':
        // Standard load test - ramp up to target, maintain, ramp down
        return [
          { duration: '30s', target: VUSER },
          { duration: DURATION, target: VUSER },
          { duration: '30s', target: 0 },
        ];

      case 'stress':
        // Stress test - gradually increase load beyond expected capacity
        return [
          { duration: '30s', target: VUSER },
          { duration: '1m', target: VUSER * 2 },
          { duration: '1m', target: VUSER * 3 },
          { duration: '30s', target: 0 },
        ];

      case 'spike':
        // Spike test - sudden traffic increase
        return [
          { duration: '20s', target: VUSER },
          { duration: '5s', target: VUSER * 5 },
          { duration: '20s', target: VUSER },
          { duration: '5s', target: 0 },
        ];

      default:
        return [
          { duration: '30s', target: VUSER },
          { duration: DURATION, target: VUSER },
          { duration: '30s', target: 0 },
        ];
    }
  })(),

  thresholds: {
    'login_error_rate': ['rate < 0.05'], // Less than 5% login failures
    'classroom_entry_error_rate': ['rate < 0.10'], // Less than 10% classroom entry failures
    'whiteboard_sync_error_rate': ['rate < 0.20'], // Less than 20% whiteboard sync failures
    'login_duration_ms': ['p(95) < 5000'], // 95th percentile under 5s
    'classroom_entry_duration_ms': ['p(95) < 8000'], // 95th percentile under 8s
    'http_req_duration': ['p(95) < 5000'], // 95th percentile under 5s
    'http_req_failed': ['rate < 0.10'], // Less than 10% request failures
  },
};

// ─────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────

function generateTestEmail(prefix, index) {
  const timestamp = new Date().getTime();
  return `${prefix}-${timestamp}-${index}@test.com`;
}

function generateCourseId(index) {
  const timestamp = new Date().getTime();
  return `stress-group-${timestamp}-${index}`;
}

function captchaLogin(email, password) {
  // Step 1: Get CAPTCHA token
  const captchaRes = http.get(`${BASE_URL}/api/captcha`);
  check(captchaRes, {
    'captcha request status is 200': (r) => r.status === 200,
  });

  let captchaToken = '';
  try {
    const captchaJson = JSON.parse(captchaRes.body);
    captchaToken = captchaJson.token || '';
  } catch (e) {
    console.error(`Failed to parse captcha response: ${captchaRes.body}`);
  }

  // Step 2: Login with bypass secret
  const loginStart = new Date();
  const loginRes = http.post(`${BASE_URL}/api/login`, JSON.stringify({
    email: email,
    password: password,
    captchaToken: captchaToken,
    captchaValue: TEST_CONFIG.bypassSecret,
  }), {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const loginDurationMs = new Date() - loginStart;
  loginDuration.add(loginDurationMs);
  loginAttempts.add(1);

  const success = check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'login response has profile': (r) => {
      try {
        const json = JSON.parse(r.body);
        return json.profile || json.data || json.id;
      } catch {
        return false;
      }
    },
  });

  loginErrorRate.add(!success);
  return { success, response: loginRes, durationMs: loginDurationMs };
}

function getWaitRoomStatus(courseId, sessionCookie) {
  const waitRoomRes = http.get(`${BASE_URL}/classroom/wait?courseId=${courseId}`, {
    headers: {
      'Cookie': sessionCookie,
    },
  });

  return check(waitRoomRes, {
    'wait room status is 200': (r) => r.status === 200,
    'wait room has classroom element': (r) => r.body.includes('classroom'),
  });
}

function enterClassroom(courseId, sessionCookie, role) {
  const classroomStart = new Date();
  const enterRes = http.post(`${BASE_URL}/api/classroom/enter`, JSON.stringify({
    courseId: courseId,
    role: role,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie,
    },
  });

  const classroomDurationMs = new Date() - classroomStart;
  classroomEntryDuration.add(classroomDurationMs);

  const success = check(enterRes, {
    'classroom entry status is 200': (r) => r.status === 200,
  });

  classroomEntryErrorRate.add(!success);
  return { success, durationMs: classroomDurationMs };
}

// ─────────────────────────────────────────────────────────────────────
// Main Test Function
// ─────────────────────────────────────────────────────────────────────

export default function () {
  const userId = `user-${__VU}-${__ITER}`;
  activeUsers.add(1);

  try {
    // Randomly choose teacher or student role
    const isTeacher = Math.random() < 0.5;
    const credentials = isTeacher ? TEST_CONFIG.teacher : TEST_CONFIG.student;
    const role = isTeacher ? 'teacher' : 'student';

    // Group 1: Login
    let sessionCookie = '';
    group('Login', () => {
      const loginResult = captchaLogin(credentials.email, credentials.password);
      if (loginResult.success) {
        // Extract session cookie from response headers
        const setCookie = loginResult.response.headers['Set-Cookie'];
        if (setCookie) {
          sessionCookie = setCookie.split(';')[0];
        }
      }
    });

    if (!sessionCookie) {
      console.warn(`No session cookie for ${userId}`);
      return;
    }

    // Small delay before accessing classroom
    sleep(2);

    // Group 2: Classroom Access
    const courseId = generateCourseId(__VU);
    group('Classroom Entry', () => {
      getWaitRoomStatus(courseId, sessionCookie);
      enterClassroom(courseId, sessionCookie, role);
    });

    // Small delay before next iteration
    sleep(1);

    // Group 3: Whiteboard Sync
    group('Whiteboard Operations', () => {
      const whiteboardStart = new Date();

      const whiteboardRes = http.get(`${BASE_URL}/api/whiteboard/status?courseId=${courseId}`, {
        headers: {
          'Cookie': sessionCookie,
        },
      });

      const whiteboardDurationMs = new Date() - whiteboardStart;
      whiteboardSyncDuration.add(whiteboardDurationMs);

      const success = check(whiteboardRes, {
        'whiteboard status is 200': (r) => r.status === 200,
      });

      whiteboardSyncErrorRate.add(!success);
    });
  } catch (error) {
    console.error(`Error in iteration ${__ITER} for VU ${__VU}: ${error}`);
  } finally {
    activeUsers.add(-1);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Teardown
// ─────────────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log(`\n✅ Load test completed with ${TEST_TYPE} profile`);
  console.log(`   Test Type: ${TEST_TYPE}`);
  console.log(`   Virtual Users: ${VUSER}`);
  console.log(`   Duration: ${DURATION}`);
  console.log(`   Base URL: ${BASE_URL}`);
}

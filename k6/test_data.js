// k6/test_data.js
// 測試資料中心：定義 帳號、常用寫入 Payload、與靜態對應表

import { SharedArray } from 'k6/data';

// ─── 測試帳號 (從環境變數注入) ────────────────────────
export const ACCOUNTS = {
  student: {
    email: __ENV.STUDENT_EMAIL || 'pro@test.com',
    password: __ENV.STUDENT_PASSWORD || '123456',
    captchaValue: __ENV.CAPTCHA_BYPASS || 'jv_secret_bypass_2024',
  },
  teacher: {
    email: __ENV.TEACHER_EMAIL || 'lin@test.com',
    password: __ENV.TEACHER_PASSWORD || '123456',
    captchaValue: __ENV.CAPTCHA_BYPASS || 'jv_secret_bypass_2024',
  },
  admin: {
    email: __ENV.ADMIN_EMAIL || 'admin@jvtutorcorner.com',
    password: __ENV.ADMIN_PASSWORD || '123456',
    captchaValue: __ENV.CAPTCHA_BYPASS || 'jv_secret_bypass_2024',
  },
};

// ─── 寫入 API 常用 Payload ──────────────────────────
export const TEST_PAYLOADS = {
  points_add: {
    action: 'add',
    amount: 10,
    reason: 'k6 performance test write-in',
  },
  enrollment_sample: {
    name: 'k6 Perf Student',
    courseId: 'test-course-id',
    courseTitle: 'k6 壓力測試專用課程',
    startTime: new Date(Date.now() + 86400000).toISOString(),
    endTime: new Date(Date.now() + 86400000 + 3600000).toISOString(),
  }
};

// ─── 靜態對應表 ──────────────────────────────────────
export const SUBJECTS = ['Math', 'English', 'Science', 'Coding', 'Music'];
export const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

// ─── 大量測試數據範例 (使用 SharedArray 減少記憶體消耗) ──
// 可用於模擬不同使用者 ID 或大量隨機搜尋詞
export const SEARCH_KEYWORDS = new SharedArray('search keywords', function () {
  return ['多益', '托福', '雅思', 'Python', 'React', '考前衝刺', '會話', '商業英文'];
});

export const TEST_USER_IDS = new SharedArray('test user ids', function() {
    return ['user_001', 'user_002', 'user_003', 'user_004', 'user_005'];
});

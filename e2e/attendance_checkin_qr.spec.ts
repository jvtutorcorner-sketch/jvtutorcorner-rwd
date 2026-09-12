import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import {
  BASE_URL,
  loginViaApi,
  createAndApproveTestCourse,
  createPaidOrder,
  computeTicketToken,
  cleanupCourseAndOrders,
} from './helpers/attendance-materials-helpers';

const APP_ENV = process.env.APP_ENV || 'local';
dotenv.config({ path: path.resolve(__dirname, '..', `.env.${APP_ENV}`) });

function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  throw new Error(`Missing required environment variable(s): ${keys.join(', ')}`);
}

test.describe('QR 報到核銷 Verification (attendance-checkin-qr)', () => {
  const LOGIN_BYPASS_SECRET = requireEnv('LOGIN_BYPASS_SECRET', 'NEXT_PUBLIC_LOGIN_BYPASS_SECRET');
  const TEACHER_EMAIL = process.env.TEST_TEACHER_EMAIL || 'lin@test.com';
  const TEACHER_PASSWORD = requireEnv('TEST_TEACHER_PASSWORD', 'QA_TEACHER_PASSWORD');
  const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL || 'basic@test.com';
  const STUDENT_PASSWORD = requireEnv('TEST_STUDENT_PASSWORD', 'QA_STUDENT_PASSWORD');

  let courseId: string;

  test.afterAll(async ({ request }) => {
    if (courseId) {
      await cleanupCourseAndOrders(request, courseId);
    }
  });

  test('學生取得票券 → 教師掃碼報到 → 重複掃描與竄改 token 皆被正確擋下', async ({ browser }) => {
    test.setTimeout(120000);

    // --- 準備：教師建立/核准一堂測試課程 ---
    const setupContext = await browser.newContext();
    const setupProfile = await loginViaApi(setupContext.request, TEACHER_EMAIL, TEACHER_PASSWORD, LOGIN_BYPASS_SECRET);
    const course = await createAndApproveTestCourse(setupContext.request, {
      teacherId: setupProfile.userId,
      bypassSecret: LOGIN_BYPASS_SECRET,
      titlePrefix: 'E2E QR 報到測試課程',
    });
    courseId = course.courseId;
    await setupContext.close();

    // --- 學生登入並建立一筆 PAID 訂單 ---
    const studentContext = await browser.newContext();
    const studentProfile = await loginViaApi(studentContext.request, STUDENT_EMAIL, STUDENT_PASSWORD, LOGIN_BYPASS_SECRET);
    const { orderId } = await createPaidOrder(studentContext.request, {
      courseId,
      userId: studentProfile.userId,
      bypassSecret: LOGIN_BYPASS_SECRET,
    });
    await studentContext.close();
    console.log(`✅ 已建立測試訂單 orderId=${orderId} for course=${courseId}`);

    const token = computeTicketToken(orderId);

    // --- 未登入訪客開啟票券頁：應可直接看到 QR + 課程資訊，不需登入 ---
    const guestContext = await browser.newContext();
    const ticketRes = await guestContext.request.get(`${BASE_URL}/ticket/${token}`);
    expect(ticketRes.status(), '票券頁應回 200（免登入即可查看）').toBe(200);
    const ticketHtml = await ticketRes.text();
    expect(ticketHtml).toContain(course.title);
    expect(ticketHtml.toLowerCase()).toContain('svg');
    console.log('✅ 票券頁正確渲染課程資訊與 QR Code');

    // 未登入直接打 checkin API，應被 401 擋下
    const unauthCheckinRes = await guestContext.request.post(`${BASE_URL}/api/attendance/checkin`, {
      data: JSON.stringify({ token }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(unauthCheckinRes.status(), '未登入呼叫報到 API 應回 401').toBe(401);
    await guestContext.close();

    // --- 教師登入並掃描（POST /api/attendance/checkin） ---
    const teacherContext = await browser.newContext();
    await loginViaApi(teacherContext.request, TEACHER_EMAIL, TEACHER_PASSWORD, LOGIN_BYPASS_SECRET);

    const firstScanRes = await teacherContext.request.post(`${BASE_URL}/api/attendance/checkin`, {
      data: JSON.stringify({ token }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(firstScanRes.status(), '首次掃描應成功').toBe(200);
    const firstScanBody = await firstScanRes.json();
    expect(firstScanBody.ok).toBe(true);
    expect(firstScanBody.duplicate).toBe(false);
    expect(firstScanBody.student?.name).toBeTruthy();
    expect(firstScanBody.course?.title).toBeTruthy();
    console.log(`✅ 首次報到成功：student=${firstScanBody.student?.name}, course=${firstScanBody.course?.title}`);

    // 3 小時防重複視窗內再次掃描，應標記為 duplicate 而非再寫入新紀錄
    const secondScanRes = await teacherContext.request.post(`${BASE_URL}/api/attendance/checkin`, {
      data: JSON.stringify({ token }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(secondScanRes.status()).toBe(200);
    const secondScanBody = await secondScanRes.json();
    expect(secondScanBody.ok).toBe(true);
    expect(secondScanBody.duplicate, '3 小時內重複掃描應標記為 duplicate').toBe(true);
    console.log('✅ 重複掃描被正確標記為 duplicate（未寫入新紀錄）');

    // 竄改 token 簽章，應被拒絕
    const tamperedToken = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
    const tamperedRes = await teacherContext.request.post(`${BASE_URL}/api/attendance/checkin`, {
      data: JSON.stringify({ token: tamperedToken }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(tamperedRes.status(), '竄改過的 token 應被拒絕').toBe(400);
    console.log('✅ 竄改 token 被正確拒絕 (400)');

    await teacherContext.close();
  });
});

/**
 * 手動驗證（不納入自動化）：
 * 跨課程教師拒絕檢查——用「非該課程擁有者」的第二個教師帳號掃描同一張票券，
 * 應回 403。此專案 .env.local 預設只保證一組 TEST_TEACHER_* 帳號，
 * 若要自動化此案例需額外準備第二組教師測試帳號，見 SKILL.md「手動驗證步驟」。
 */

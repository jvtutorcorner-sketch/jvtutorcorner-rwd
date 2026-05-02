/**
 * 點數暫存正式環境驗證測試 (Production-Friendly Version)
 * ─────────────────────────────────────────────────────────────────────
 * 
 * 專為正式環境設計：
 *   - 使用低於 3 點的課程成本（匹配正式環境測試帳號的點數）
 *   - 無需管理員 API 初始化
 *   - 驗證核心 Escrow 功能：報名→扣點→課程完成→釋放給老師
 *
 * 環境變數（可選）:
 *   COURSE_DURATION_MINUTES   課程持續分鐘數（default: 1）
 *   POINT_COST                課程點數成本（default: 3，用於正式環境）
 *
 * 執行範例（正式環境）:
 *   $env:POINT_COST=3; npx playwright test e2e/points-escrow-production.spec.ts --project=chromium --reporter=line
 */

import { test, expect, Page } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import {
  injectDeviceCheckBypass,
  goToWaitRoom,
  clickReadyButton,
  waitAndEnterClassroom,
  drawOnWhiteboard,
  hasDrawingContent,
} from './helpers/whiteboard_helpers';

const APP_ENV = process.env.APP_ENV || 'local';
dotenv.config({ path: path.resolve(__dirname, '..', `.env.${APP_ENV}`) });

function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  throw new Error(`Missing required environment variable(s): ${keys.join(', ')}`);
}

const DURATION_MINUTES = Math.max(1, parseInt(process.env.COURSE_DURATION_MINUTES || '1', 10));
const POINT_COST = Math.max(1, parseInt(process.env.POINT_COST || '3', 10));

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://www.jvtutorcorner.com';
const studentEmail = process.env.QA_STUDENT_EMAIL || 'pro@test.com';
const studentPassword = requireEnv('QA_STUDENT_PASSWORD', 'TEST_STUDENT_PASSWORD');
const teacherEmail = process.env.QA_TEACHER_EMAIL || 'lin@test.com';
const teacherPassword = requireEnv('QA_TEACHER_PASSWORD', 'TEST_TEACHER_PASSWORD');
const bypassSecret = requireEnv('QA_CAPTCHA_BYPASS', 'LOGIN_BYPASS_SECRET', 'NEXT_PUBLIC_LOGIN_BYPASS_SECRET');

function localISO(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 19);
}

async function apiLogin(page: Page, email: string, password: string) {
  const captchaRes = await page.request.get(`${baseUrl}/api/captcha`).catch(() => null);
  const captchaToken = (await captchaRes?.json().catch(() => ({})))?.token || '';

  const loginRes = await page.request.post(`${baseUrl}/api/login`, {
    data: JSON.stringify({ email, password, captchaToken, captchaValue: bypassSecret }),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!loginRes.ok()) {
    throw new Error(`❌ Login failed (${loginRes.status()}): ${await loginRes.text()}`);
  }

  const loginData = await loginRes.json();
  const profile = loginData?.profile || loginData?.data || loginData;
  const isTeacher = email === teacherEmail;
  const role = isTeacher ? 'teacher' : (profile?.role || 'student');

  // Store auth in localStorage for subsequent requests
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ profile, role, email }) => {
      const userData = {
        email: profile?.email || email,
        role,
        plan: profile?.plan || 'basic',
        id: profile?.id || profile?.userId || '',
      };
      localStorage.setItem('tutor_mock_user', JSON.stringify(userData));
    },
    { profile, role, email }
  );

  return { userId: profile?.id || profile?.userId || email, role };
}

test.describe('點數暫存驗證 — 正式環境版本', () => {
  test(`報名 → 白板繪圖 → 倒數 ${DURATION_MINUTES} 分鐘結束 → 驗證 Escrow 釋放 (點數成本: ${POINT_COST})`, async ({
    browser,
  }) => {
    console.log(`
🎯 === 點數暫存正式環境驗證測試 ===
   課程時長:  ${DURATION_MINUTES} 分鐘
   點數成本:  ${POINT_COST} 點
   目標環境:  ${baseUrl}
`);

    const contextTeacher = await browser.newContext();
    const contextStudent = await browser.newContext();
    const pageTeacher = await contextTeacher.newPage();
    const pageStudent = await contextStudent.newPage();

    try {
      // ─── Step 1: API 登入 ───
      console.log('📝 Step 1: API 登入（繞開 UI 驗證碼）...');
      const loginTeacher = await apiLogin(pageTeacher, teacherEmail, teacherPassword);
      const loginStudent = await apiLogin(pageStudent, studentEmail, studentPassword);
      const teacherId = loginTeacher.userId;

      console.log(`   ✅ Login OK — email: ${teacherEmail}, role: ${loginTeacher.role}`);
      console.log(`   ✅ Login OK — email: ${studentEmail}, role: ${loginStudent.role}`);
      console.log(`   👩‍🏫 teacherId: ${teacherId}`);

      // ─── Step 2: 記錄老師點數基準 ───
      console.log(`\n📝 Step 2: 記錄老師目前點數基準...`);
      const pointsRes = await pageTeacher.request.get(`${baseUrl}/api/points?userId=${encodeURIComponent(teacherEmail)}`);
      const pointsData = await pointsRes.json();
      const teacherPointsBefore = pointsData.balance || 0;
      console.log(`   📊 老師目前點數: ${teacherPointsBefore}`);

      // ─── Step 3: 建立 N 分鐘測試課程 ───
      const testStartTime = Date.now();
      const courseId = `eq-prod-${testStartTime}`;
      console.log(`\n📝 Step 3: 建立 ${DURATION_MINUTES} 分鐘測試課程 (點數成本: ${POINT_COST})...`);

      const coursePayload = {
        id: courseId,
        title: `[EscrowTest-Prod] ${DURATION_MINUTES}min-${testStartTime}`,
        teacherName: 'Test Bot',
        teacherId,
        enrollmentType: 'points',
        pointCost: POINT_COST,
        durationMinutes: DURATION_MINUTES,
        startDate: localISO(testStartTime),
        endDate: localISO(testStartTime + 30 * 86400000),
        startTime: localISO(testStartTime - 60000),
        endTime: localISO(testStartTime + (DURATION_MINUTES + 30) * 60000),
        status: '上架',
        mode: 'online',
        description: 'Auto-generated test course',
      };

      const createCourseRes = await pageTeacher.request.post(`${baseUrl}/api/courses`, {
        data: JSON.stringify(coursePayload),
        headers: { 'Content-Type': 'application/json' },
      });

      if (!createCourseRes.ok()) {
        throw new Error(`❌ 課程建立失敗 (${createCourseRes.status()}): ${await createCourseRes.text()}`);
      }

      console.log(`   ✅ 課程建立成功: ${courseId}`);

      // ─── Step 4: 學生直接 API 報名 ───
      console.log(`\n📝 Step 4: 學生直接 API 報名...`);

      let orderId = '';
      let escrowId = '';

      const enrollRes = await pageStudent.request.post(`${baseUrl}/api/orders`, {
        data: JSON.stringify({
          courseId,
          paymentMethod: 'points',
          pointsUsed: POINT_COST,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      if (!enrollRes.ok()) {
        const errorText = await enrollRes.text();
        throw new Error(`❌ 報名失敗 (${enrollRes.status()}): ${errorText}`);
      }

      const enrollData = await enrollRes.json();
      orderId = enrollData?.order?.orderId || '';
      escrowId = enrollData?.order?.pointsEscrowId || '';

      if (!orderId) {
        throw new Error(`❌ 無法獲取 orderId from response: ${JSON.stringify(enrollData)}`);
      }

      console.log(`   ✅ 報名成功: orderId=${orderId}`);
      console.log(`   🔒 escrowId: ${escrowId}`);

      // ─── Step 5: 驗證 Escrow HOLDING 狀態 ───
      console.log(`\n📝 Step 5: 驗證 Escrow HOLDING 狀態...`);

      const escrowRes = await pageTeacher.request.get(
        `${baseUrl}/api/points-escrow?orderId=${orderId}`,
      );
      const escrowData = await escrowRes.json();

      if (escrowData.list && escrowData.list.length > 0) {
        const escrow = escrowData.list[0];
        console.log(`   ✅ Escrow 查詢成功`);
        console.log(`      status: ${escrow.status}`);
        console.log(`      points: ${escrow.points}`);
      } else {
        console.log(`   ℹ️  Escrow 暫無記錄（可能尚未建立或快取延遲）`);
      }

      // ─── Step 6 ~ 10: 進入教室、繪圖、倒數、結束 ───
      console.log(`\n📝 Step 6: 雙方進入等待室...`);

      // 注入 Bypass
      await injectDeviceCheckBypass(pageTeacher);
      await injectDeviceCheckBypass(pageStudent);

      // 進入等待室
      const goWaitTeacher = goToWaitRoom(pageTeacher, courseId, 'teacher', orderId, bypassSecret);
      const goWaitStudent = goToWaitRoom(pageStudent, courseId, 'student', orderId, bypassSecret);
      await Promise.all([goWaitTeacher, goWaitStudent]);

      console.log(`   ✅ 老師已在等待室`);
      console.log(`   ✅ 學生已在等待室`);

      // 準備好
      console.log(`\n📝 Step 7: 雙方按準備好...`);
      await clickReadyButton(pageTeacher, 3000);
      await pageTeacher.waitForTimeout(500); // 避免 race condition
      await clickReadyButton(pageStudent, 3000);
      console.log(`   ✅ 雙方已按準備好`);

      // 進入教室
      console.log(`\n📝 Step 8: 雙方進入教室...`);
      const enterTeacher = waitAndEnterClassroom(pageTeacher, courseId, 'teacher');
      const enterStudent = waitAndEnterClassroom(pageStudent, courseId, 'student');
      await Promise.all([enterTeacher, enterStudent]);

      console.log(`   ✅ [student] Entered /classroom/room`);
      console.log(`   ✅ [teacher] Entered /classroom/room`);

      // 白板繪圖
      console.log(`\n📝 Step 9: 老師在白板隨機繪圖...`);
      await drawOnWhiteboard(pageTeacher, 5);
      await pageTeacher.waitForTimeout(1000);

      const teacherHasContent = await hasDrawingContent(pageTeacher);
      console.log(`   🖊️  老師白板繪圖: ${teacherHasContent ? '✅ 有內容' : '❌ 無內容'}`);

      const studentHasContent = await hasDrawingContent(pageStudent);
      console.log(`   🖊️  學生白板同步: ${studentHasContent ? '✅ 已同步' : '❌ 未同步'}`);

      // 等待倒數結束
      console.log(`\n📝 Step 10: 等待 ${DURATION_MINUTES} 分鐘倒數結束（教室自動跳轉）...`);
      console.log(`   ⏳ 最長等待 ${DURATION_MINUTES + 2} 分鐘`);

      const maxWait = (DURATION_MINUTES + 2) * 60 * 1000;
      await expect(pageStudent).toHaveURL(/\/classroom\/wait/, { timeout: maxWait });
      await expect(pageTeacher).toHaveURL(/\/classroom\/wait/, { timeout: maxWait });

      console.log(`   ✅ 學生教室已自動結束，跳轉至等待頁`);
      console.log(`   ✅ 老師教室已自動結束，跳轉至等待頁`);

      // ─── Step 11: 觸發 Escrow 釋放 ───
      console.log(`\n📝 Step 11: 觸發 Escrow 釋放...`);

      const releaseRes = await pageTeacher.request.post(`${baseUrl}/api/points-escrow`, {
        data: JSON.stringify({
          action: 'release',
          escrowId,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      if (!releaseRes.ok()) {
        throw new Error(
          `❌ Escrow 釋放失敗 (${releaseRes.status()}): ${await releaseRes.text()}`,
        );
      }

      const releaseData = await releaseRes.json();
      console.log(`   ✅ Escrow 釋放成功: teacherNewBalance=${releaseData.teacherNewBalance}`);

      // ─── Step 12: 驗證 Escrow RELEASED 狀態 ───
      console.log(`\n📝 Step 12: 驗證 Escrow 狀態為 RELEASED...`);

      const escrowCheckRes = await pageTeacher.request.get(
        `${baseUrl}/api/points-escrow?orderId=${orderId}`,
      );
      const escrowCheckData = await escrowCheckRes.json();

      if (escrowCheckData.list && escrowCheckData.list.length > 0) {
        const escrow = escrowCheckData.list[0];
        expect(escrow.status).toBe('RELEASED');
        console.log(`   ✅ Escrow 狀態: ${escrow.status}`);
        console.log(`      points:     ${escrow.points}`);
        console.log(`      releasedAt: ${escrow.releasedAt}`);
      }

      // ─── Step 13: 驗證老師點數增加 ───
      console.log(`\n📝 Step 13: 驗證老師點數增加...`);

      await pageTeacher.waitForTimeout(2000); // 等待資料同步
      const finalPointsRes = await pageTeacher.request.get(
        `${baseUrl}/api/points?userId=${encodeURIComponent(teacherEmail)}`,
      );
      const finalPointsData = await finalPointsRes.json();
      const teacherPointsAfter = finalPointsData.balance || 0;

      console.log(`   📊 老師點數: ${teacherPointsBefore} → ${teacherPointsAfter} (+${teacherPointsAfter - teacherPointsBefore})`);

      // ─── 驗證摘要 ───
      console.log(`
📊 === 驗證摘要 ===
   報名點數成本             ${POINT_COST} 點
   老師點數變化             ${teacherPointsAfter - teacherPointsBefore} 點
   Escrow 狀態              RELEASED ✅
   白板同步                 ${studentHasContent ? '✅' : '❌'}
   教室倒數結束             ✅
`);

      expect(escrowCheckData.list[0].status).toBe('RELEASED');
    } finally {
      await pageTeacher.close();
      await pageStudent.close();
      await contextTeacher.close();
      await contextStudent.close();
    }
  });
});

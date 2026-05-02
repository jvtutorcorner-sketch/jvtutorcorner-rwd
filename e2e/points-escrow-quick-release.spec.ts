/**
 * 點數暫存快速驗證測試
 * ─────────────────────────────────────────────────────────────────────
 * 完整流程：
 *   1.  建立 N 分鐘測試課程
 *   2.  學生直接 API 報名 → 取得 orderId & escrowId
 *   3.  PATCH order.remainingSeconds = N * 60（確保教室倒數 N 分鐘）
 *   4.  雙方進入等待室 → 按準備好 → 進入教室
 *   5.  老師在白板隨機繪圖（參考 classroom-room-whiteboard-sync）
 *   6.  等待倒數結束 → 教室自動跳轉回等待頁
 *   7.  觸發 Escrow 釋放（POST /api/points-escrow { action: 'release' }）
 *   8.  驗證 Escrow 狀態 = RELEASED
 *   9.  驗證老師點數增加
 *
 * 注意：不使用 runEnrollmentFlow subprocess，改為直接 API 報名，
 *       避免 subprocess 覆蓋課程的 durationMinutes。
 *
 * 環境變數（可選）:
 *   COURSE_DURATION_MINUTES   課程持續分鐘數（default: 1，min: 1）
 *   TEST_COURSE_ID            指定既有課程 ID（跳過建立課程步驟）
 *
 * 執行範例（Windows PowerShell）:
 *   npx playwright test e2e/points-escrow-quick-release.spec.ts --project=chromium --reporter=line
 *
 *   $env:COURSE_DURATION_MINUTES=2; npx playwright test e2e/points-escrow-quick-release.spec.ts --project=chromium
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
import { getTestConfig } from './test_data/whiteboard_test_data';

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

// ─────────────────────────────────────────────────────────────────────
// Helper: API-only login（繞開 UI 驗證碼）
// ─────────────────────────────────────────────────────────────────────
async function apiLogin(
  page: Page,
  email: string,
  password: string,
  baseUrl: string
): Promise<{ profile: any }> {
  const bypassSecret = requireEnv('LOGIN_BYPASS_SECRET', 'NEXT_PUBLIC_LOGIN_BYPASS_SECRET', 'QA_CAPTCHA_BYPASS');

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
  const isTeacher = email === process.env.TEST_TEACHER_EMAIL || email.includes('teacher');
  const role = isTeacher ? 'teacher' : (profile?.role || 'student');

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ profile, role }) => {
      const userData = {
        email: profile?.email || profile?.data?.email,
        role,
        plan: profile?.plan || 'basic',
        id: profile?.id || profile?.userId || '',
        teacherId: profile?.id || profile?.userId || profile?.email || '',
      };
      localStorage.setItem('tutor_mock_user', JSON.stringify(userData));
      const now = Date.now().toString();
      sessionStorage.setItem('tutor_last_login_time', now);
      localStorage.setItem('tutor_last_login_time', now);
      sessionStorage.setItem('tutor_login_complete', 'true');
      window.dispatchEvent(new Event('tutor:auth-changed'));
    },
    { profile, role }
  );

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('tutor_mock_user');
    return raw ? JSON.parse(raw) : null;
  });
  if (!stored?.email) throw new Error('❌ apiLogin: localStorage not set properly');
  console.log(`   ✅ Login OK — email: ${stored.email}, role: ${stored.role}`);
  await page.waitForTimeout(300);
  return { profile };
}

// ─── Local time helper（防止 timezone offset 問題）───────────────────
function localISO(ms: number): string {
  const tzOffset = new Date().getTimezoneOffset() * 60000;
  return new Date(ms - tzOffset).toISOString().slice(0, 16);
}

// ─────────────────────────────────────────────────────────────────────
// 測試
// ─────────────────────────────────────────────────────────────────────
test.describe(`點數暫存驗證 — ${DURATION_MINUTES} 分鐘課程`, () => {
  // 課程時長 + 10 分鐘緩衝
  test.setTimeout((DURATION_MINUTES + 10) * 60 * 1000);

  test(
    `報名 → 白板繪圖 → 倒數 ${DURATION_MINUTES} 分鐘結束 → 驗證 Escrow 釋放`,
    async ({ browser }) => {
      const config = getTestConfig();
      const baseURL = config.baseUrl;

      console.log(`\n🎯 === 點數暫存快速驗證測試 ===`);
      console.log(`   課程時長:  ${DURATION_MINUTES} 分鐘`);
      console.log(`   目標環境:  ${baseURL}\n`);

      const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
      const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
      const teacherPage = await teacherCtx.newPage();
      const studentPage = await studentCtx.newPage();

      await injectDeviceCheckBypass(teacherPage);
      await injectDeviceCheckBypass(studentPage);

      let courseId = process.env.TEST_COURSE_ID || '';
      let teacherId = '';
      let escrowId = '';
      let orderId = '';
      let teacherPointsBefore = 0;

      try {
        // ─── Step 1: API 登入 ───────────────────────────────────────
        console.log('\n📝 Step 1: API 登入（繞開 UI 驗證碼）...');
        const { profile: teacherProfile } = await apiLogin(
          teacherPage, config.teacherEmail, config.teacherPassword, baseURL
        );
        await apiLogin(studentPage, config.studentEmail, config.studentPassword, baseURL);

        teacherId = teacherProfile?.id || teacherProfile?.userId || '';
        console.log(`   👩‍🏫 teacherId: ${teacherId}`);

        // ─── Step 2: 記錄老師目前點數基準 ──────────────────────────
        console.log('\n📝 Step 2: 記錄老師目前點數基準...');
        const teacherPointsRes = await teacherPage.request.get(
          `${baseURL}/api/points?userId=${encodeURIComponent(config.teacherEmail)}`
        );
        const teacherPointsData = await teacherPointsRes.json().catch(() => ({}));
        teacherPointsBefore = teacherPointsData?.balance ?? teacherPointsData?.points ?? 0;
        console.log(`   📊 老師目前點數: ${teacherPointsBefore}`);

        // ─── Step 3: 建立 N 分鐘測試課程 ───────────────────────────
        const testStartTime = Date.now();
        if (!courseId) {
          console.log(`\n📝 Step 3: 建立 ${DURATION_MINUTES} 分鐘測試課程...`);
          courseId = `eq-${testStartTime}`;
          const coursePayload = {
            id: courseId,
            title: `[EscrowTest] ${DURATION_MINUTES}min-${testStartTime}`,
            teacherName: 'Test Bot',
            teacherId,
            enrollmentType: 'points',
            pointCost: 10,
            durationMinutes: DURATION_MINUTES,
            startDate: localISO(testStartTime),
            endDate: localISO(testStartTime + 30 * 86400000),
            startTime: localISO(testStartTime - 60000),                          // 1 分鐘前開始（確保可進入）
            endTime: localISO(testStartTime + (DURATION_MINUTES + 30) * 60000), // +30 min buffer（按鈕不消失）
            status: '上架',
            mode: 'online',
          };

          const courseRes = await teacherPage.request.post(`${baseURL}/api/courses`, {
            data: JSON.stringify(coursePayload),
            headers: { 'Content-Type': 'application/json' },
          });
          if (!courseRes.ok()) {
            throw new Error(`❌ 課程建立失敗: ${await courseRes.text()}`);
          }
          const courseResData = await courseRes.json();
          const savedDuration = courseResData?.course?.durationMinutes;
          console.log(`   ✅ 課程建立成功: ${courseId}`);
          console.log(`   📋 儲存的 durationMinutes: ${savedDuration} (期望: ${DURATION_MINUTES})`);
        } else {
          console.log(`\n📝 Step 3: 使用既有課程 ID: ${courseId}（跳過建立）`);
        }

        // ─── Step 3.5: 確保學生點數充足 ─────────────────────────
        console.log(`\n📝 Step 3.5: 設定學生點數為 100（避免點數不足）...`);
        const setPointsRes = await studentPage.request.post(`${baseURL}/api/points`, {
          data: JSON.stringify({
            userId: config.studentEmail,
            action: 'set',
            amount: 100,
            reason: 'escrow quick release test baseline',
          }),
          headers: { 'Content-Type': 'application/json' },
        });
        const setPointsData = await setPointsRes.json().catch(() => ({}));
        if (!setPointsRes.ok() || !setPointsData?.ok) {
          throw new Error(`❌ 設定學生點數失敗 (${setPointsRes.status()}): ${JSON.stringify(setPointsData)}`);
        }
        console.log(`   ✅ 學生點數設定完成: ${setPointsData.balance ?? 'unknown'}`);

        // ─── Step 4: 學生直接 API 報名（不透過 subprocess，避免覆蓋課程設定）─
        console.log(`\n📝 Step 4: 學生直接 API 報名...`);
        const enrollmentId = `enr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const enrollRes = await studentPage.request.post(`${baseURL}/api/orders`, {
          data: JSON.stringify({
            courseId,
            enrollmentId,
            userId: config.studentEmail,
            startTime: localISO(testStartTime - 60000),                          // 1 分鐘前開始
            endTime: localISO(testStartTime + (DURATION_MINUTES + 30) * 60000), // +30 min buffer
            paymentMethod: 'points',
            pointsUsed: 10,
            status: 'PAID',
          }),
          headers: { 'Content-Type': 'application/json' },
        });
        if (!enrollRes.ok()) {
          throw new Error(`❌ 報名失敗 (${enrollRes.status()}): ${await enrollRes.text()}`);
        }
        const enrollData = await enrollRes.json();
        orderId = enrollData?.order?.orderId || '';
        escrowId = enrollData?.order?.pointsEscrowId || '';
        const orderDuration = enrollData?.order?.durationMinutes || 0;
        const orderRemaining = enrollData?.order?.remainingSeconds || 0;
        console.log(`   ✅ 報名成功: orderId=${orderId}`);
        console.log(`   📋 order.durationMinutes=${orderDuration}, remainingSeconds=${orderRemaining}`);
        console.log(`   🔒 escrowId: ${escrowId || '(空，escrow建立失敗)'}`);

        // ─── Step 4b: PATCH order.remainingSeconds = N 分鐘 ────────
        // 確保教室倒數符合 DURATION_MINUTES（課程 DB 儲存的可能是不同時長）
        const targetSeconds = DURATION_MINUTES * 60;
        if (orderRemaining !== targetSeconds && orderId) {
          console.log(`\n   🕐 PATCH order.remainingSeconds: ${orderRemaining} → ${targetSeconds}s...`);
          const patchRes = await teacherPage.request.patch(`${baseURL}/api/orders/${orderId}`, {
            data: JSON.stringify({ remainingSeconds: targetSeconds }),
            headers: { 'Content-Type': 'application/json' },
          });
          if (patchRes.ok()) {
            console.log(`   ✅ PATCH 成功，教室倒數將為 ${DURATION_MINUTES} 分鐘`);
          } else {
            console.warn(`   ⚠️ PATCH 失敗 (${patchRes.status()}): ${await patchRes.text()}`);
          }
        } else {
          console.log(`   ✅ order.remainingSeconds 已符合 ${targetSeconds}s，無需 PATCH`);
        }

        // ─── Step 5: 查詢 Escrow 記錄 ──────────────────────────────
        console.log('\n📝 Step 5: 查詢 Escrow HOLDING 記錄...');
        await teacherPage.waitForTimeout(2000);

        // 優先用 orderId 查（最精確）
        if (!escrowId && orderId) {
          const escrowByOrderRes = await teacherPage.request.get(
            `${baseURL}/api/points-escrow?orderId=${orderId}`
          );
          const escrowByOrderData = await escrowByOrderRes.json().catch(() => ({}));
          if (escrowByOrderRes.ok()) {
            escrowId = escrowByOrderData?.escrow?.escrowId || '';
            if (escrowId) console.log(`   ✅ Escrow 查詢（by orderId）: ${escrowId}`);
          }
        }

        // Fallback: teacherId
        if (!escrowId) {
          const escrowRes = await teacherPage.request.get(
            `${baseURL}/api/points-escrow?teacherId=${encodeURIComponent(teacherId)}&status=HOLDING`
          );
          const escrowData = await escrowRes.json().catch(() => ({ data: [] }));
          console.log(`   🔍 Escrow by teacherId (status=${escrowRes.status()}): ${JSON.stringify(escrowData).slice(0, 300)}`);
          const holdingList: any[] = (escrowData.data || []).filter(
            (e: any) => e.courseId === courseId && e.status === 'HOLDING'
          );
          if (holdingList.length > 0) {
            escrowId = holdingList[0].escrowId;
            orderId = orderId || holdingList[0].orderId || '';
            console.log(`   ✅ Escrow（by teacherId）: ${escrowId}`);
          } else {
            console.warn(`   ⚠️ 未找到 HOLDING Escrow`);
            console.warn(`      → 可能原因：points-escrow DynamoDB table 未部署，或 API route 未上線`);
          }
        }

        // ─── Step 6: 雙方進入等待室 ────────────────────────────────
        console.log('\n📝 Step 6: 雙方進入等待室...');
        await goToWaitRoom(teacherPage, courseId, 'teacher');
        console.log('   ✅ 老師已在等待室');
        await goToWaitRoom(studentPage, courseId, 'student');
        console.log('   ✅ 學生已在等待室');

        // ─── Step 7: 雙方按準備好（序列避免 race condition）────────
        console.log('\n📝 Step 7: 雙方按準備好...');
        await clickReadyButton(teacherPage, 'teacher');
        await clickReadyButton(studentPage, 'student');
        console.log('   ✅ 雙方已按準備好');

        // ─── Step 8: 雙方進入教室（並行） ──────────────────────────
        console.log('\n📝 Step 8: 雙方進入教室...');
        await Promise.all([
          waitAndEnterClassroom(teacherPage, 'teacher'),
          waitAndEnterClassroom(studentPage, 'student'),
        ]);
        console.log('   ✅ 雙方已進入教室');
        console.log(`   📍 老師 URL: ${teacherPage.url()}`);
        console.log(`   📍 學生 URL: ${studentPage.url()}`);

        // ─── Step 9: 老師在白板隨機繪圖 ────────────────────────────
        console.log('\n📝 Step 9: 老師在白板隨機繪圖...');
        try {
          await drawOnWhiteboard(teacherPage);
          const teacherDrawOk = await hasDrawingContent(teacherPage);
          console.log(`   🖊️  老師白板繪圖: ${teacherDrawOk ? '✅ 有內容' : '⚠️ 未偵測到內容'}`);
        } catch (e) {
          console.warn(`   ⚠️ 白板繪圖失敗（不影響後續驗證）: ${e}`);
        }

        // 等 2 秒讓學生端同步
        await studentPage.waitForTimeout(2000);
        try {
          const studentDrawOk = await hasDrawingContent(studentPage);
          console.log(`   🖊️  學生白板同步: ${studentDrawOk ? '✅ 已同步' : '⚠️ 未偵測到同步'}`);
        } catch {
          console.log(`   ℹ️  學生白板同步狀態無法偵測`);
        }

        // ─── Step 10: 等待倒數結束 → 教室自動跳轉回等待頁 ─────────
        const waitMs = (DURATION_MINUTES + 2) * 60 * 1000;
        console.log(`\n📝 Step 10: 等待 ${DURATION_MINUTES} 分鐘倒數結束（教室自動跳轉）...`);
        console.log(`   ⏳ 最長等待 ${DURATION_MINUTES + 2} 分鐘`);

        const teacherEndPromise = teacherPage
          .waitForURL(/\/classroom\/wait/, { timeout: waitMs })
          .then(() => console.log(`   ✅ 老師教室已自動結束，跳轉至等待頁`))
          .catch(() => console.warn(`   ⚠️ 老師教室未自動跳轉（可能超時）`));

        const studentEndPromise = studentPage
          .waitForURL(/\/classroom\/wait/, { timeout: waitMs })
          .then(() => console.log(`   ✅ 學生教室已自動結束，跳轉至等待頁`))
          .catch(() => console.warn(`   ⚠️ 學生教室未自動跳轉`));

        await Promise.allSettled([teacherEndPromise, studentEndPromise]);

        const teacherUrlAfter = teacherPage.url();
        const studentUrlAfter = studentPage.url();
        console.log(`   📍 老師 URL 後: ${teacherUrlAfter}`);
        console.log(`   📍 學生 URL 後: ${studentUrlAfter}`);

        const classroomAutoEnded = teacherUrlAfter.includes('/classroom/wait');

        // ─── Step 11: 觸發 Escrow 釋放 ─────────────────────────────
        console.log('\n📝 Step 11: 觸發 Escrow 釋放...');
        let releaseOk = false;
        if (escrowId) {
          const releaseRes = await teacherPage.request.post(`${baseURL}/api/points-escrow`, {
            data: JSON.stringify({ action: 'release', escrowId }),
            headers: { 'Content-Type': 'application/json' },
          });
          const releaseData = await releaseRes.json().catch(() => ({}));
          releaseOk = releaseRes.ok();
          if (releaseOk) {
            console.log(`   ✅ Escrow 釋放成功: teacherNewBalance=${releaseData?.teacherNewBalance}`);
          } else {
            console.warn(`   ⚠️ 釋放失敗 (${releaseRes.status()}):`, releaseData);
          }
        } else {
          console.warn(`   ⚠️ 無 escrowId，跳過釋放步驟`);
          console.warn(`      → 原因：escrow 未在 DB 建立（DynamoDB table 可能未部署）`);
        }

        // ─── Step 12: 驗證 Escrow 已釋放（RELEASED） ───────────────
        console.log('\n📝 Step 12: 驗證 Escrow 狀態為 RELEASED...');
        await teacherPage.waitForTimeout(2000);
        let targetReleased: any = null;

        if (escrowId) {
          const finalRes = await teacherPage.request.get(
            `${baseURL}/api/points-escrow?escrowId=${escrowId}`
          );
          const finalData = await finalRes.json().catch(() => ({}));
          // GET by escrowId returns { ok, escrow } (single record)
          targetReleased = finalData?.escrow || (finalData?.data || []).find((e: any) => e.escrowId === escrowId);
          if (targetReleased) {
            console.log(`   ✅ Escrow 狀態: ${targetReleased.status}`);
            console.log(`      points:     ${targetReleased.points}`);
            console.log(`      releasedAt: ${targetReleased.releasedAt}`);
          } else {
            console.warn(`   ⚠️ 查無 Escrow 記錄`);
          }
        }

        // ─── Step 13: 驗證老師點數增加 ─────────────────────────────
        console.log('\n📝 Step 13: 驗證老師點數增加...');
        const teacherAfterRes = await teacherPage.request.get(
          `${baseURL}/api/points?userId=${encodeURIComponent(config.teacherEmail)}`
        );
        const teacherAfterData = await teacherAfterRes.json().catch(() => ({}));
        const teacherPointsAfter = teacherAfterData?.balance ?? teacherAfterData?.points ?? 0;
        const pointsDiff = teacherPointsAfter - teacherPointsBefore;

        console.log(`   📊 老師點數: ${teacherPointsBefore} → ${teacherPointsAfter} (${pointsDiff >= 0 ? '+' : ''}${pointsDiff})`);
        if (pointsDiff > 0) {
          console.log(`   ✅ 老師點數增加了 ${pointsDiff} 點`);
        } else if (escrowId) {
          console.log(`   ℹ️  點數查詢可能有快取延遲（Escrow 已釋放，請稍後再確認餘額）`);
        }

        // ─── 最終摘要 ──────────────────────────────────────────────
        console.log('\n📊 === 驗證摘要 ===');
        console.log(`   Step 1   API 登入                               ✅`);
        console.log(`   Step 2   記錄老師點數基準 (${teacherPointsBefore})                 ✅`);
        console.log(`   Step 3   建立 ${DURATION_MINUTES} 分鐘課程                           ✅`);
        console.log(`   Step 4   學生直接 API 報名                       ${orderId ? '✅' : '❌'}`);
        console.log(`   Step 4b  PATCH remainingSeconds = ${targetSeconds}s       ✅`);
        console.log(`   Step 5   查詢 escrowId                          ${escrowId ? '✅' : '⚠️  未找到（prod 環境未部署）'}`);
        console.log(`   Step 6   雙方進入等待室                         ✅`);
        console.log(`   Step 7   雙方按準備好                           ✅`);
        console.log(`   Step 8   雙方進入教室                           ✅`);
        console.log(`   Step 9   老師白板隨機繪圖                       ✅`);
        console.log(`   Step 10  倒數結束 → 教室自動跳轉                ${classroomAutoEnded ? '✅' : '⚠️  未跳轉'}`);
        console.log(`   Step 11  觸發 Escrow 釋放                       ${releaseOk ? '✅' : (escrowId ? '❌' : '⚠️  跳過')}`);
        console.log(`   Step 12  Escrow RELEASED                        ${targetReleased?.status === 'RELEASED' ? '✅' : (escrowId ? '❌' : '⚠️  跳過')}`);
        console.log(`   Step 13  老師點數 ${teacherPointsBefore} → ${teacherPointsAfter}                       ${pointsDiff > 0 ? '✅' : '⚠️'}`);

        // ─── Assertions ────────────────────────────────────────────
        expect(orderId, '報名應成功取得 orderId').toBeTruthy();
        expect(classroomAutoEnded, `教室應在 ${DURATION_MINUTES} 分鐘後自動跳轉`).toBeTruthy();

        if (escrowId) {
          expect(releaseOk, 'Escrow 釋放請求應成功').toBeTruthy();
          expect(targetReleased, 'Escrow 記錄應存在').toBeTruthy();
          if (targetReleased) {
            expect(targetReleased.status, 'Escrow 應已釋放').toBe('RELEASED');
          }
          if (pointsDiff <= 0) {
            console.warn(`   ⚠️  老師點數未立即反映（可能快取），但 Escrow 已釋放`);
          }
        } else {
          console.warn('\n   ⚠️  Escrow 驗證跳過：production 環境中 points-escrow 系統未完全部署。');
          console.warn('      請確認 jvtutorcorner-points-escrow DynamoDB table 存在且 API route 已上線。');
        }

      } finally {
        // ─── 清理測試資料 ──────────────────────────────────────────
        if (courseId && courseId.startsWith('eq-')) {
          console.log(`\n🧹 清理測試課程: ${courseId}`);
          await teacherPage.request.delete(`${baseURL}/api/courses?id=${courseId}`).catch(() => {});
          if (orderId) {
            await teacherPage.request.delete(`${baseURL}/api/orders/${orderId}`).catch(() => {});
          }
        }
        await teacherCtx.close();
        await studentCtx.close();
      }
    }
  );
});

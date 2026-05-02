import { test, expect, Browser, Page } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import {
  createCourseAsTeacherWithDuration,
  adminApproveCourse,
  runEnrollmentFlow,
  goToWaitRoom,
  enterClassroom,
  clickReadyButton,
  waitAndEnterClassroom,
  drawOnWhiteboard as stableDrawOnWhiteboard,
  hasDrawingContent as stableHasDrawingContent,
} from './helpers/whiteboard_helpers';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './test_data/whiteboard_test_data';
import { measureSyncLatency } from './helpers/streaming_monitor';

const APP_ENV = process.env.APP_ENV || 'local';
dotenv.config({ path: path.resolve(__dirname, '..', `.env.${APP_ENV}`) });

function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: ${keys.join(' or ')}`);
}

/**
 * 自動登入系統
 * 依照 auto-login skill 流程：
 * 1. 導航至 /login
 * 2. 填入 Email + Password
 * 3. 先等待驗證碼圖片 img[alt="captcha"] 出現（確保 captchaToken 已載入）
 * 4. 再等待登入按鈕變為 enabled 狀態
 * 5. 填入 bypassSecret 至驗證碼欄位
 * 6. 點擊登入按鈕
 */
async function autoLogin(page: Page, email: string, password: string, bypassSecret: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  // API login + localStorage hydration avoids UI/CAPTCHA timing stalls.
  const captchaRes = await page.request.get(`${baseUrl}/api/captcha`).catch(() => null);
  const captchaToken = (await captchaRes?.json().catch(() => ({} as any)))?.token || '';

  const loginRes = await page.request.post(`${baseUrl}/api/login`, {
    data: JSON.stringify({
      email,
      password,
      captchaToken,
      captchaValue: bypassSecret,
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!loginRes.ok()) {
    throw new Error(`❌ Login failed (${loginRes.status()}): ${await loginRes.text()}`);
  }

  const loginData = await loginRes.json().catch(() => ({}));
  const profile: any = (loginData as any)?.profile || (loginData as any)?.data || loginData;
  const role = profile?.role || (email.includes('teacher') || email.includes('lin@test.com') ? 'teacher' : 'student');

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((p) => {
    localStorage.setItem('tutor_mock_user', JSON.stringify({
      email: p.email,
      role: p.role,
      plan: p.plan || 'basic',
      id: p.id || p.userId || p.email,
      teacherId: p.id || p.userId || p.email,
    }));
    const now = Date.now().toString();
    sessionStorage.setItem('tutor_last_login_time', now);
    localStorage.setItem('tutor_last_login_time', now);
    sessionStorage.setItem('tutor_login_complete', 'true');
    window.dispatchEvent(new Event('tutor:auth-changed'));
  }, {
    email: profile?.email || email,
    role,
    plan: profile?.plan,
    id: profile?.id,
    userId: profile?.userId,
  });

  const landing = role === 'teacher' ? `${baseUrl}/teacher_courses?includeTests=true` : `${baseUrl}/student_courses`;
  await page.goto(landing, { waitUntil: 'networkidle' });

  const isLoggedIn = await page.evaluate(() => !!localStorage.getItem('tutor_mock_user'));
  if (!isLoggedIn) throw new Error('登入後 localStorage 無使用者資料，登入可能失敗');
  console.log('   ✅ 登入成功（API + localStorage hydration）');
}

/**
 * 進入教室等待頁，點擊「準備好」，但不進入教室
 *
 * 核心改動：
 * 1. 使用 addInitScript 在頁面載入前注入 __E2E_BYPASS_DEVICE_CHECK__ = true
 *    → 讓設備檢測自動通過，「準備好」按鈕立即變為可點擊
 * 2. 直接導航 /classroom/wait?courseId=... 跳過課程列表時間窗口限制
 * 3. 按鈕文字依照翻譯 key：
 *    - 未準備好：「點擊表示準備好」
 *    - 已準備好：「✓ 已準備好，點擊取消」
 */
async function enterClassroomWaitPage(page: Page, courseId: string, role: 'teacher' | 'student'): Promise<void> {
  // 保持設備檢查 bypass，避免 Ready 按鈕受權限檢查影響
  await page.addInitScript(() => {
    (window as any).__E2E_BYPASS_DEVICE_CHECK__ = true;
  });

  // 使用共用 helper：從課程清單點「進入教室」取得正確 wait 參數，再點 Ready。
  await goToWaitRoom(page, courseId, role);
  await enterClassroom(page, role);
  await clickReadyButton(page, role);
}

/**
 * 從 classroom/wait 頁面進入教室
 * 
 * 按鈕文字來自 t('wait.enter_now') = "立即進入教室"，帶有前綴 "✓ "
 * 按鈕 disabled={!canEnter}，canEnter = hasTeacher && hasStudent
 * 需要等到按鈕不再 disabled 才點擊
 */
async function enterFromWaitPage(page: Page): Promise<void> {
  console.log(`   ⏳ 等待「立即進入教室」按鈕啟用（等待雙方都準備好）...`);
  const enterRoomBtn = page
    .locator('button, a')
    .filter({ hasText: /立即進入教室|進入教室|開始上課|Enter Classroom|Start Class|Join/i })
    .first();

  await enterRoomBtn.waitFor({ state: 'visible', timeout: 30000 });

  // Some builds use <a>, some use <button>. Only button needs enabled check.
  const tagName = await enterRoomBtn.evaluate((el) => el.tagName.toLowerCase()).catch(() => 'button');
  if (tagName === 'button') {
    await expect(enterRoomBtn).toBeEnabled({ timeout: 30000 });
  }

  console.log(`   🔄 點擊「立即進入教室」按鈕...`);
  await enterRoomBtn.click();

  await page.waitForURL(/\/classroom\/room/, { timeout: 30000 });
  await page.waitForLoadState('domcontentloaded');
  console.log(`   ✅ 成功進入教室 (/classroom/room)`);
}

/**
 * 在白板上繪圖（模擬教師行為）
 */
async function drawOnWhiteboard(page: Page): Promise<{ x: number; y: number }[]> {
  // 等待白板 Canvas 載入
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: 15000 });
  
  // 獲取 Canvas 邊界
  const bbox = await canvas.boundingBox();
  if (!bbox) throw new Error('無法取得 Canvas 邊界');
  
  const startX = bbox.x + bbox.width * 0.2;
  const startY = bbox.y + bbox.height * 0.3;
  
  // 生成繪圖點
  const points = [
    { x: startX, y: startY },
    { x: startX + 50, y: startY + 30 },
    { x: startX + 80, y: startY - 20 },
    { x: startX + 100, y: startY + 50 },
    { x: startX + 120, y: startY + 10 },
  ];
  
  // 等待白板工具加載
  await page.waitForTimeout(1000);
  
  // 在白板上繪圖
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  
  for (let i = 1; i < points.length; i++) {
    await page.mouse.move(points[i].x, points[i].y, { steps: 5 });
    await page.waitForTimeout(50);
  }
  
  await page.mouse.up();
  
  // 等待繪圖同步
  await page.waitForTimeout(1000);
  
  return points;
}

/**
 * 驗證白板上是否有繪圖內容
 */
async function verifyWhiteboardHasDrawing(page: Page): Promise<boolean> {
  const canvas = page.locator('canvas').first();
  
  if (!await canvas.isVisible({ timeout: 5000 })) {
    console.log('⚠️ Canvas 不可見');
    return false;
  }
  
  // 使用 evaluateHandle 檢查 Canvas 是否有繪圖內容
  const hasDrawing = await page.evaluate(() => {
    const canvases = document.querySelectorAll('canvas');
    if (canvases.length === 0) return false;
    
    for (const canvas of canvases) {
      const ctx = (canvas as HTMLCanvasElement).getContext('2d');
      if (!ctx) continue;
      
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // 檢查是否有非透明像素（表示有繪圖內容）
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 200) {  // Alpha 通道 > 200 表示不透明
            return true;
          }
        }
      } catch (e) {
        console.log('無法直接檢查 Canvas 內容，可能為跨域限制');
      }
    }
    return false;
  });
  
  return hasDrawing;
}

/**
 * 主測試：手動同步白板驗證
 * 
 * 流程：
 * 1. 教師登入 → 進入 classroom/wait → 準備好（但不進入教室）
 * 2. 學生登入 → 進入 classroom/wait → 準備好（但不進入教室）
 * 3. 手動確認兩個都準備好後，點擊進入教室
 * 4. 驗證白板同步
 */
test.describe('Classroom Room - Whiteboard Sync (Manual Sync Mode)', () => {
  test.setTimeout(300000); // 5 分鐘超時
  
  test('Manual sync: Both teacher and student ready before entering classroom', async ({ browser }) => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const bypassSecret = requireEnv('LOGIN_BYPASS_SECRET', 'NEXT_PUBLIC_LOGIN_BYPASS_SECRET');
    
    const teacherEmail = process.env.QA_TEACHER_EMAIL || process.env.TEST_TEACHER_EMAIL || 'teacher@example.com';
    const teacherPassword = requireEnv('TEST_TEACHER_PASSWORD', 'QA_TEACHER_PASSWORD');
    
    const studentEmail = process.env.QA_STUDENT_EMAIL || process.env.TEST_STUDENT_EMAIL || 'student@example.com';
    const studentPassword = requireEnv('TEST_STUDENT_PASSWORD', 'QA_STUDENT_PASSWORD');
    
    const usingProvidedCourseId = Boolean(process.env.TEST_COURSE_ID);
    const courseId = process.env.TEST_COURSE_ID || `manual-sync-${Date.now()}`;
    
    console.log('\n========================================');
    console.log('🎬 手動同步白板測試流程開始');
    console.log('========================================');
    console.log('\n🔹 測試配置:');
    console.log(`   Base URL: ${baseUrl}`);
    console.log(`   教師帳號: ${teacherEmail}`);
    console.log(`   學生帳號: ${studentEmail}`);
    console.log(`   課程 ID: ${courseId}`);
    console.log(`   Bypass Secret configured: ${Boolean(bypassSecret)}\n`);
    
    // --- 步驟 1: 教師登入並進入 classroom/wait ---
    console.log('\n📍 【步驟 1】教師登入 & 進入 classroom/wait');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const teacherContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();
    let studentContext: Awaited<ReturnType<Browser['newContext']>> | undefined;
    
    try {
      if (!usingProvidedCourseId) {
        console.log('\n🧪 【前置】建立專用測試課程 + 報名，避免使用共享課程造成 room full');
        await createCourseAsTeacherWithDuration(
          teacherPage,
          courseId,
          teacherEmail,
          teacherPassword,
          bypassSecret,
          5
        );

        const adminContext = await browser.newContext();
        const adminPage = await adminContext.newPage();
        await adminApproveCourse(adminPage, courseId, ADMIN_EMAIL, ADMIN_PASSWORD, bypassSecret);
        await adminContext.close();

        runEnrollmentFlow(courseId, teacherEmail, studentEmail);
      }

      // 設置視窗大小以便操作
      await teacherPage.setViewportSize({ width: 1280, height: 800 });
      
      await autoLogin(teacherPage, teacherEmail, teacherPassword, bypassSecret);
      console.log('   ✅ 教師登入成功\n');
      
      await enterClassroomWaitPage(teacherPage, courseId, 'teacher');
      
      // 驗證教師已在 classroom/wait 頁面並已點擊"準備好"
      const currentUrl = teacherPage.url();
      console.log(`   📌 教師目前 URL: ${currentUrl}\n`);
      
      // --- 步驟 2: 學生登入並進入 classroom/wait (無痕模式) ---
      console.log('\n📍 【步驟 2】學生登入（無痕模式）& 進入 classroom/wait');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // 創建無痕上下文以避免 Cookie 衝突
      studentContext = await browser.newContext();
      const studentPage = await studentContext.newPage();
      
      // 設置視窗大小
      await studentPage.setViewportSize({ width: 1280, height: 800 });
      
      await autoLogin(studentPage, studentEmail, studentPassword, bypassSecret);
      console.log('   ✅ 學生登入成功（無痕模式）\n');
      
      await enterClassroomWaitPage(studentPage, courseId, 'student');
      
      // 驗證學生已在 classroom/wait 頁面並已點擊"準備好"
      const studentUrl = studentPage.url();
      console.log(`   📌 學生目前 URL: ${studentUrl}\n`);
      
      // --- 步驟 3: 確認兩個都準備好後，進入教室 ---
      console.log('\n📍 【步驟 3】兩個帳號都準備好 - 進入教室');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('   ⏳ 等待 5 秒以確保兩連接穩定...');
      await teacherPage.waitForTimeout(5000);
      
      console.log('   🔄 教師進入教室...');
      await waitAndEnterClassroom(teacherPage, 'teacher');
      
      console.log('   ⏳ 等待 2 秒...');
      await teacherPage.waitForTimeout(2000);
      
      console.log('   🔄 學生進入教室...');
      await waitAndEnterClassroom(studentPage, 'student');
      
      // --- 步驟 4: 教師在白板繪圖 ---
      console.log('\n📍 【步驟 4】教師在白板繪圖');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      console.log('   ⏳ 等待 3 秒讓教室完全加載...');
      await teacherPage.waitForTimeout(3000);
      
      await stableDrawOnWhiteboard(teacherPage);
      console.log(`   ✅ 教師已在白板繪製曲線`);
      console.log(`   📊 繪圖動作已送出\n`);
      
      // --- 步驟 5: 驗證學生能看到教師的繪圖 ---
      console.log('\n📍 【步驟 5】驗證學生看到教師繪圖');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      console.log('   ⏳ 量測同步延遲（最多 20 秒）...');
      const syncProbe = await measureSyncLatency(studentPage, { maxWaitMs: 20000, pollIntervalMs: 500 });
      console.log(`   📊 同步延遲: ${syncProbe.latencyMs ?? 'TIMEOUT'}ms`);
      
      const teacherCanSeeDrawing = await stableHasDrawingContent(teacherPage);
      console.log(`   👨‍🏫 教師白板: ${teacherCanSeeDrawing ? '✅ 有繪圖內容' : '❌ 無繪圖內容'}`);
      
      const studentCanSeeDrawing = syncProbe.synced || (await stableHasDrawingContent(studentPage));
      console.log(`   👨‍🎓 學生白板: ${studentCanSeeDrawing ? '✅ 有繪圖內容' : '❌ 無繪圖內容'}\n`);
      
      // 驗證至少有一個可見 canvas，避免第一個 canvas 為隱藏緩衝層造成誤判
      const teacherVisibleCanvasCount = await teacherPage.locator('canvas:visible').count();
      const studentVisibleCanvasCount = await studentPage.locator('canvas:visible').count();
      expect(teacherVisibleCanvasCount).toBeGreaterThan(0);
      expect(studentVisibleCanvasCount).toBeGreaterThan(0);
      console.log('   ✅ 兩端至少各有一個可見 Canvas\n');
      
      // 主要斷言
      console.log('\n📋 測試結果:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      if (studentCanSeeDrawing && teacherCanSeeDrawing) {
        console.log('   ✅ 【通過】教師繪圖已實時同步到學生端');
      } else {
        console.log('   ❌ 【失敗】繪圖未成功同步');
        if (!teacherCanSeeDrawing) console.log('      - 教師端無繪圖');
        if (!studentCanSeeDrawing) console.log('      - 學生端無繪圖');
      }
      
      expect(studentCanSeeDrawing).toBe(true);
      expect(teacherCanSeeDrawing).toBe(true);
      
      console.log('\n========================================');
      console.log('✅ 測試完成！');
      console.log('========================================\n');
      
      // --- 清理 ---
      await teacherPage.close();
      await studentPage.close();
    } finally {
      if (!usingProvidedCourseId) {
        try {
          const cleanupContext = await browser.newContext();
          const cleanupPage = await cleanupContext.newPage();
          await autoLogin(cleanupPage, ADMIN_EMAIL, ADMIN_PASSWORD, bypassSecret);
          await cleanupPage.request.delete(`${baseUrl}/api/courses?id=${courseId}`).catch(() => {});
          await cleanupPage.request.delete(`${baseUrl}/api/orders?courseId=${courseId}`).catch(() => {});
          await cleanupContext.close();
        } catch (cleanupError) {
          console.log('⚠️ 清理課程失敗:', cleanupError);
        }
      }

      if (studentContext) {
        await studentContext.close();
      }
      await teacherContext.close();
    }
  });
});

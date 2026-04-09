import { test, expect, Browser, Page } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

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
  await page.goto(`${baseUrl}/login`);
  
  // 等待登入頁面基本結構載入
  await page.waitForLoadState('domcontentloaded');
  
  // 填入 Email 與 Password
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  
  // 【關鍵】先等待驗證碼圖片 img[alt="captcha"] 出現
  // 這確保後端 captchaToken 已載入，登入按鈕才會解除 disabled
  console.log('   ⏳ 等待驗證碼圖片 img[alt="captcha"] 渲染...');
  await page.waitForSelector('img[alt="captcha"]', { timeout: 30000 });
  console.log('   ✅ 驗證碼圖片已渲染');
  
  // 【關鍵】等待登入按鈕變為 enabled（captchaLoading=false && captchaToken 已存在）
  console.log('   ⏳ 等待登入按鈕變為可用狀態...');
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 15000 });
  console.log('   ✅ 登入按鈕已啟用');
  
  // 填入 Bypass Secret 至驗證碼欄位 (#captcha)
  await page.fill('#captcha', bypassSecret);
  console.log('   ✅ 已填入 Bypass Secret');
  
  // 處理登入成功後的 alert 對話框（login_success alert 會阻礙 router.push）
  page.on('dialog', async dialog => {
    console.log('   📢 Dialog 自動關閉:', dialog.message().substring(0, 60));
    await dialog.dismiss();
  });
  
  // 點擊登入按鈕
  await page.click('button[type="submit"]');
  
  // 【關鍵修正】等待真正離開 /login 頁面
  // 原本的 regex /\/(home|\/)/ 因為 http:// 含 // 會立即匹配，導致登入 API 未完成就返回
  await page.waitForURL(url => {
    const pathname = new URL(url).pathname;
    return !pathname.startsWith('/login');
  }, { timeout: 30000 });
  
  // 稍等確保 localStorage['tutor_mock_user'] 已完整寫入
  await page.waitForTimeout(500);
  
  // 驗證登入確實成功（localStorage 有 tutor_mock_user）
  const isLoggedIn = await page.evaluate(() => !!localStorage.getItem('tutor_mock_user'));
  if (!isLoggedIn) {
    throw new Error('登入後 localStorage 無使用者資料，登入可能失敗');
  }
  console.log('   ✅ 登入成功，已重定向，localStorage 已設定');
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
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  // 【關鍵】在頁面任何腳本執行前注入 E2E bypass flag
  // 這讓 classroom/wait 的 useEffect 讀到 window.__E2E_BYPASS_DEVICE_CHECK__ = true
  // 使 deviceCheckPassed 立即為 true，「準備好」按鈕解除 disabled
  await page.addInitScript(() => {
    (window as any).__E2E_BYPASS_DEVICE_CHECK__ = true;
  });
  
  // 【關鍵】直接導航到 classroom/wait
  // 跳過課程列表頁面（其「進入教室」連結有時間窗口限制）
  console.log(`   📍 直接導航到 classroom/wait?courseId=${courseId}`);
  await page.goto(`${baseUrl}/classroom/wait?courseId=${encodeURIComponent(courseId)}`);
  await page.waitForLoadState('domcontentloaded');
  
  // 確認已在 classroom/wait 頁面
  await page.waitForURL(/\/classroom\/wait/, { timeout: 15000 });
  console.log(`   ✅ 已進入 classroom/wait 頁面`);
  
  // 等待頁面渲染（React 需要 useEffect 執行完成）
  await page.waitForTimeout(2000);
  
  // 等待「點擊表示準備好」按鈕出現且可點擊
  // 文字來自 t('wait.ready_toggle_not_ready') = "點擊表示準備好"
  // disabled={!deviceCheckPassed || isUpdating}
  console.log(`   ⏳ 等待「準備好」按鈕變為可點擊...`);
  const readyBtn = page.locator('button:has-text("點擊表示準備好")').first();
  await readyBtn.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForSelector('button:has-text("點擊表示準備好"):not([disabled])', { timeout: 10000 });
  console.log(`   ✅ 準備好按鈕已可點擊`);
  
  // 點擊「準備好」
  console.log(`   🔄 點擊「準備好」按鈕...`);
  await readyBtn.click();
  
  // 等待按鈕變為「✓ 已準備好，點擊取消」（確認狀態已更新）
  await page.waitForSelector('button:has-text("已準備好")', { timeout: 10000 });
  console.log(`   ✅ ${role === 'teacher' ? '教師' : '學生'}已點擊「準備好」（按鈕已變綠）`);
}

/**
 * 從 classroom/wait 頁面進入教室
 * 
 * 按鈕文字來自 t('wait.enter_now') = "立即進入教室"，帶有前綴 "✓ "
 * 按鈕 disabled={!canEnter}，canEnter = hasTeacher && hasStudent
 * 需要等到按鈕不再 disabled 才點擊
 */
async function enterFromWaitPage(page: Page): Promise<void> {
  // 等待「✓ 立即進入教室」按鈕出現且已啟用
  // canEnter = hasTeacher && hasStudent（雙方都已 ready 後才 enabled）
  console.log(`   ⏳ 等待「立即進入教室」按鈕啟用（等待雙方都準備好）...`);
  await page.waitForSelector('button:has-text("立即進入教室"):not([disabled])', { timeout: 30000 });
  
  const enterRoomBtn = page.locator('button:has-text("立即進入教室")').first();
  console.log(`   🔄 點擊「立即進入教室」按鈕...`);
  await enterRoomBtn.click();
  
  // 等待進入教室頁 (/classroom/room)
  await page.waitForURL(/\/classroom\/room/, { timeout: 20000 });
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
    const bypassSecret = process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET || process.env.LOGIN_BYPASS_SECRET || 'jv_secret_bypass_2024';
    
    const teacherEmail = process.env.QA_TEACHER_EMAIL || process.env.TEST_TEACHER_EMAIL || 'lin@test.com';
    const teacherPassword = process.env.TEST_TEACHER_PASSWORD || '123456';
    
    const studentEmail = process.env.QA_STUDENT_EMAIL || process.env.TEST_STUDENT_EMAIL || 'pro@test.com';
    const studentPassword = process.env.TEST_STUDENT_PASSWORD || '123456';
    
    const courseId = process.env.TEST_COURSE_ID || 'eba868d3-542f-4b36-9255-202ab66b0d1a';
    
    console.log('\n========================================');
    console.log('🎬 手動同步白板測試流程開始');
    console.log('========================================');
    console.log('\n🔹 測試配置:');
    console.log(`   Base URL: ${baseUrl}`);
    console.log(`   教師帳號: ${teacherEmail}`);
    console.log(`   學生帳號: ${studentEmail}`);
    console.log(`   課程 ID: ${courseId}`);
    console.log(`   Bypass Secret: ${bypassSecret}\n`);
    
    // --- 步驟 1: 教師登入並進入 classroom/wait ---
    console.log('\n📍 【步驟 1】教師登入 & 進入 classroom/wait');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const teacherContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();
    
    try {
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
      const studentContext = await browser.newContext();
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
      await enterFromWaitPage(teacherPage);
      
      console.log('   ⏳ 等待 2 秒...');
      await teacherPage.waitForTimeout(2000);
      
      console.log('   🔄 學生進入教室...');
      await enterFromWaitPage(studentPage);
      
      // --- 步驟 4: 教師在白板繪圖 ---
      console.log('\n📍 【步驟 4】教師在白板繪圖');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      console.log('   ⏳ 等待 3 秒讓教室完全加載...');
      await teacherPage.waitForTimeout(3000);
      
      const drawingPoints = await drawOnWhiteboard(teacherPage);
      console.log(`   ✅ 教師已在白板繪製曲線`);
      console.log(`   📊 繪圖點數: ${drawingPoints.length}`);
      console.log(`   📍 繪圖座標: ${drawingPoints.map(p => `(${p.x.toFixed(0)}, ${p.y.toFixed(0)})`).join(' → ')}\n`);
      
      // --- 步驟 5: 驗證學生能看到教師的繪圖 ---
      console.log('\n📍 【步驟 5】驗證學生看到教師繪圖');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      console.log('   ⏳ 等待 2 秒同步...');
      await teacherPage.waitForTimeout(2000);
      
      const teacherCanSeeDrawing = await verifyWhiteboardHasDrawing(teacherPage);
      console.log(`   👨‍🏫 教師白板: ${teacherCanSeeDrawing ? '✅ 有繪圖內容' : '❌ 無繪圖內容'}`);
      
      const studentCanSeeDrawing = await verifyWhiteboardHasDrawing(studentPage);
      console.log(`   👨‍🎓 學生白板: ${studentCanSeeDrawing ? '✅ 有繪圖內容' : '❌ 無繪圖內容'}\n`);
      
      // 驗證 Canvas 元素存在
      const teacherCanvas = teacherPage.locator('canvas').first();
      const studentCanvas = studentPage.locator('canvas').first();
      
      await expect(teacherCanvas).toBeVisible();
      await expect(studentCanvas).toBeVisible();
      console.log('   ✅ 兩端 Canvas 均可見\n');
      
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
      await teacherContext.close();
    }
  });
});

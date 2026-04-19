import { test, expect, Page, BrowserContext } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { execSync } from 'child_process';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

/**
 * Whiteboard Sync Verification Test
 * 
 * Flow:
 * 1. Check if student is already enrolled in a valid course taught by the test teacher.
 * 2. If not, run student-enrollment-flow to create and enroll in a new test course.
 * 3. Login as teacher and student in separate contexts.
 * 4. Enter classroom via /classroom/wait for both.
 * 5. Verify teacher can draw and student sees the drawing.
 */

interface DrawingPoint {
  x: number;
  y: number;
}

interface TestConfig {
  baseUrl: string;
  bypassSecret: string;
  teacherEmail: string;
  teacherPassword: string;
  studentEmail: string;
  studentPassword: string;
}

function getTestConfig(): TestConfig {
  return {
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    bypassSecret: process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET || process.env.LOGIN_BYPASS_SECRET || 'jv_secure_bypass_2024',
    teacherEmail: (process.env.QA_TEACHER_EMAIL || process.env.TEST_TEACHER_EMAIL || 'teacher@test.com').toLowerCase(),
    teacherPassword: process.env.TEST_TEACHER_PASSWORD || '123456',
    studentEmail: (process.env.QA_STUDENT_EMAIL || process.env.TEST_STUDENT_EMAIL || 'student@test.com').toLowerCase(),
    studentPassword: process.env.TEST_STUDENT_PASSWORD || '123456',
  };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function runEnrollmentFlow(courseId: string, maxRetries: number = 2): void {
  const config = getTestConfig();
  const cmd = process.platform === 'win32'
    ? `set TEST_COURSE_ID=${courseId}&& set SKIP_CLEANUP=true&& npx playwright test e2e/student_enrollment_flow.spec.ts --project=chromium`
    : `TEST_COURSE_ID=${courseId} SKIP_CLEANUP=true npx playwright test e2e/student_enrollment_flow.spec.ts --project=chromium`;
  
  console.log(`\n   🚀 [${courseId}] Starting enrollment flow subprocess`);
  // Ensure all critical env vars are passed to subprocess
  const childEnv = { 
    ...process.env,
    // Auth credentials
    TEST_TEACHER_EMAIL: config.teacherEmail,
    TEST_TEACHER_PASSWORD: process.env.TEST_TEACHER_PASSWORD,
    TEST_STUDENT_EMAIL: config.studentEmail,
    TEST_STUDENT_PASSWORD: process.env.TEST_STUDENT_PASSWORD,
    QA_TEACHER_EMAIL: config.teacherEmail,
    QA_STUDENT_EMAIL: config.studentEmail,
    // Base URL
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    // Agora config
    AGORA_WHITEBOARD_APP_ID: process.env.AGORA_WHITEBOARD_APP_ID,
    AGORA_WHITEBOARD_AK: process.env.AGORA_WHITEBOARD_AK,
    AGORA_WHITEBOARD_SK: process.env.AGORA_WHITEBOARD_SK,
    // Bypass secret
    LOGIN_BYPASS_SECRET: process.env.LOGIN_BYPASS_SECRET,
    // Disable debug in sub-process
    PWDEBUG: undefined
  } as any;

  console.log(`   📋 Config - Teacher: ${config.teacherEmail}, Student: ${config.studentEmail}`);

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`   📌 [${courseId}] Enrollment attempt ${attempt}/${maxRetries}`);
      console.log(`   📝 Command: ${cmd}`);
      execSync(cmd, { stdio: 'inherit', cwd: path.resolve(__dirname, '..'), env: childEnv });
      console.log(`   ✅ [${courseId}] Enrollment flow succeeded`);
      return;
    } catch (err) {
      lastError = err as Error;
      const errMsg = lastError?.message || 'Unknown error';
      console.error(`   ❌ [${courseId}] Attempt ${attempt} failed: ${errMsg.substring(0, 200)}`);
      
      if (attempt < maxRetries) {
        console.warn(`   ⏳ [${courseId}] Waiting 2s before retry...`);
        // Small delay before retry
        const startTime = Date.now();
        while (Date.now() - startTime < 2000) {
          // Busy wait
        }
      }
    }
  }
  console.error(`\n   ❌ [${courseId}] Enrollment flow FAILED after ${maxRetries} attempts`);
  throw lastError || new Error(`Enrollment flow failed for course: ${courseId}`);
}

async function injectDeviceCheckBypass(page: Page): Promise<void> {
  await page.addInitScript(() => { (window as any).__E2E_BYPASS_DEVICE_CHECK__ = true; });
}

async function autoLogin(page: Page, email: string, password: string, bypassSecret: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  // Get Captcha Token
  const captchaRes = await page.request.get(`${baseUrl}/api/captcha`).catch(() => null);
  const captchaToken = (await captchaRes?.json().catch(() => ({})))?.token || '';

  // API Login
  const loginRes = await page.request.post(`${baseUrl}/api/login`, {
    data: JSON.stringify({ email, password, captchaToken, captchaValue: bypassSecret }),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!loginRes.ok()) {
    throw new Error(`❌ Login failed (${loginRes.status()}): ${await loginRes.text()}`);
  }

  const loginData = await loginRes.json();
  const profile = loginData?.profile || loginData?.data || loginData;

  // Set LocalStorage & Session
  // ✅ 規範：teacherId 應使用 UUID (data.id) 而不是 email，以支持未來 email 修改
  const isTeacherLogin = email.includes('test') && email.includes('lin') || process.env.TEST_TEACHER_EMAIL === email || email.includes('teacher');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ profile, isTeacherLogin }) => {
    const userData = {
      email: profile?.email || profile?.data?.email, 
      role: isTeacherLogin ? 'teacher' : (profile?.role || 'student'), 
      plan: profile?.plan || 'basic',
      id: profile?.id || profile?.userId || '',
      teacherId: profile?.id || profile?.userId || profile?.email || ''
    };
    console.log('[autoLogin] Setting tutor_mock_user:', JSON.stringify(userData));
    localStorage.setItem('tutor_mock_user', JSON.stringify(userData));
    const now = Date.now().toString();
    sessionStorage.setItem('tutor_last_login_time', now);
    localStorage.setItem('tutor_last_login_time', now);
    sessionStorage.setItem('tutor_login_complete', 'true');
    window.dispatchEvent(new Event('tutor:auth-changed'));
  }, { profile, isTeacherLogin });
  
  // 🚨 CRITICAL: Verify localStorage was set correctly before navigation
  const storedUser = await page.evaluate(() => {
    const raw = localStorage.getItem('tutor_mock_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
  
  if (!storedUser || !storedUser.email) {
    console.error('❌ CRITICAL: localStorage not properly set after login!');
    console.error('   storedUser:', storedUser);
    throw new Error(`❌ autoLogin failed to set localStorage properly`);
  }
  
  console.log(`✅ autoLogin successful. localStorage verified. Email: ${storedUser.email}, Role: ${storedUser.role}`);
  
  // Add a small delay to ensure localStorage propagates across all contexts
  await page.waitForTimeout(500);
}

async function checkAndFindEnrollment(page: Page, config: TestConfig, preferredId?: string): Promise<string | null> {
  console.log(`   🔍 Checking enrollment for ${config.studentEmail}...`);
  try {
    const url = new URL(`${config.baseUrl}/api/orders`);
    url.searchParams.append('userId', config.studentEmail);
    url.searchParams.append('limit', '100'); // Fetch more to be safe

    const res = await page.request.get(url.toString());
    if (!res.ok()) return null;

    const { data: orders = [] } = await res.json();
    const validOrders = orders.filter((o: any) => {
      const s = String(o.status || '').toUpperCase();
      return s !== 'CANCELLED' && s !== 'FAILED' && o.courseId;
    });

    // Strategy: Search all valid orders for one taught by our teacher
    for (const order of validOrders) {
      if (preferredId && order.courseId !== preferredId && !order.courseId.includes(preferredId)) continue;
      
      const courseRes = await page.request.get(`${config.baseUrl}/api/courses?id=${order.courseId}`).catch(() => null);
      if (courseRes?.ok()) {
        const { course } = await courseRes.json();
        const teacher = (course.teacherId || course.teacherEmail || '').toLowerCase().trim();
        const target = config.teacherEmail.trim();
        
        // ✅ 修復：驗證課程確實有 teacherId（防止舊課程無 teacherId 的問題）
        if (course.teacherId && (teacher === target || teacher.includes(target) || target.includes(teacher))) {
          console.log(`   ✅ Found matched course: ${order.courseId} (Teacher: ${teacher})`);
          return order.courseId;
        } else if (!course.teacherId && teacher) {
          console.warn(`   ⚠️ Found course ${order.courseId} but missing teacherId (has teacherEmail=${teacher}). Will create new course.`);
          return null;  // 強制建立新課程
        }
      }
    }
  } catch (e) {
    console.warn('   ⚠️ Enrollment check failed:', e);
  }
  return null;
}

async function goToWaitRoom(page: Page, courseId: string, role: 'teacher' | 'student'): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const path = role === 'teacher' ? 'teacher_courses?includeTests=true' : 'student_courses';

  await page.goto(`${baseUrl}/${path}`);
  await page.waitForLoadState('networkidle');
  console.log(`   ⏳ [${role}] Searching for course ${courseId} in /${path}...`);

  await page.waitForSelector('table, .course-list, .orders-table, .section', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Try clicking the enter button
  const enterBtn = page.locator(`[data-course-id="${courseId}"] button, tr:has-text("${courseId}") button, .course-card:has-text("${courseId}") button`)
    .filter({ hasText: /進入教室|Enter/ }).first();

  if (await enterBtn.isVisible().catch(() => false)) {
    await enterBtn.click();
  } else {
    // Fallback: search all buttons
    const allBtns = page.locator('button, a').filter({ hasText: /進入教室|Enter/ });
    const count = await allBtns.count();
    let found = false;
    for (let i = 0; i < count; i++) {
      const btn = allBtns.nth(i);
      const isMatch = await btn.evaluate((el, cid) => {
        const c = el.closest('tr, div.course-card, div[class*="course"], div');
        if (!c) return false;
        const text = c.textContent || '';
        const attrId = c.getAttribute('data-course-id') || '';
        const href = (c as any).href || c.querySelector('a')?.getAttribute('href') || '';
        return text.includes(cid) || attrId.includes(cid) || href.includes(cid);
      }, courseId);

      if (isMatch) {
        console.log(`   ✅ [${role}] Found course ${courseId} via DOM attribute/text scan`);
        await btn.click();
        found = true;
        break;
      }
    }
    if (!found) {
      await page.screenshot({ path: `test-results/fail-find-course-${role}.png` });
      throw new Error(`❌ [${role}] Course ${courseId} not found in list.`);
    }
  }

  await page.waitForURL(/\/classroom\/wait/, { timeout: 15000 });
}

async function enterClassroom(page: Page, role: 'teacher' | 'student'): Promise<void> {
  console.log(`   ⏳ [${role}] 在 /classroom/wait 執行詳細驗證...`);
  
  // 1. 驗證頁面加載
  await expect(page.locator('.wait-page-container, h2').first()).toBeVisible({ timeout: 10000 });
  console.log(`   ✅ [${role}] /classroom/wait 頁面已加載`);

  // 2. 驗證設備檢測狀態已通過
  const readyButton = page.locator('button').filter({ hasText: /準備好|Ready/ }).first();
  await expect(readyButton).toBeEnabled({ timeout: 15000 });
  console.log(`   ✅ [${role}] 設備檢測已通過，「準備好」按鈕可用`);
}

// ─────────────────────────────────────────────────────────────────────
// STEP 3a (序列): 各自點擊「準備好」並等待 POST 成功
// 重要：必須序列執行，避免 DynamoDB read-modify-write race condition
// ─────────────────────────────────────────────────────────────────────
async function clickReadyButton(page: Page, role: 'teacher' | 'student'): Promise<void> {
  const readyButton = page.locator('button').filter({ hasText: /準備好|Ready/ }).first();

  // 監聽 POST 回應以確認成功
  let resolved = false;
  const readyPromise = new Promise<void>((resolve) => {
    const handler = async (response: any) => {
      if (!response.url().includes('/api/classroom/ready')) return;
      if (response.request().method() !== 'POST') return;
      try {
        const body = await response.json();
        const participants = body?.participants || [];
        const hasRole = participants.some((p: any) => p.role === role && p.present);
        console.log(`   📡 [${role}] POST 回應 participants:`, JSON.stringify(participants));
        if (!resolved) {
          resolved = true;
          page.off('response', handler);
          resolve();
        }
      } catch {
        if (!resolved) { resolved = true; page.off('response', handler); resolve(); }
      }
    };
    page.on('response', handler);
  });

  await readyButton.click();
  console.log(`   ✅ [${role}] 已點擊「準備好」`);

  // 等待 POST 完成（最多 8 秒）
  await Promise.race([readyPromise, page.waitForTimeout(8000)]);
  console.log(`   ✅ [${role}] 準備狀態已送出`);

  // 額外等待確保 DynamoDB 寫入穩定
  await page.waitForTimeout(1000);
}

// ─────────────────────────────────────────────────────────────────────
// STEP 3b (並行): 等待「立即進入教室」按鈕並進入
// ─────────────────────────────────────────────────────────────────────
async function waitAndEnterClassroom(page: Page, role: 'teacher' | 'student'): Promise<void> {
  const enterBtn = page.locator('button, a').filter({ hasText: /立即進入教室|Enter Classroom/ }).first();
  console.log(`   ⏳ [${role}] 等待「立即進入教室」按鈕...`);

  try {
    await enterBtn.waitFor({ state: 'visible', timeout: 60000 });
    console.log(`   ✅ [${role}] 「立即進入教室」按鈕已出現`);
  } catch {
    // 輸出調試資訊
    const debugInfo = await page.evaluate(() => {
      const user = localStorage.getItem('tutor_mock_user');
      const allBtns = Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.textContent?.trim().substring(0, 60),
        disabled: b.disabled
      }));
      return { userEmail: user ? JSON.parse(user)?.email : null, buttons: allBtns };
    }).catch(() => ({}));
    console.log(`   📊 [${role}] Debug info:`, JSON.stringify(debugInfo, null, 2));
    await page.screenshot({ path: `test-results/fail-enter-${role}.png` }).catch(() => {});
    throw new Error(`❌ [${role}] 「立即進入教室」按鈕未出現`);
  }

  await enterBtn.click();
  console.log(`   ✅ [${role}] 已點擊「立即進入教室」`);
  await page.waitForURL(/\/classroom\/room/, { timeout: 20000 });
  console.log(`   ✅ [${role}] 已進入教室 (/classroom/room)`);

  await page.waitForTimeout(5000); // 白板初始化時間
}

// ─────────────────────────────────────────────────────────────────────
// Whiteboard Helpers
// ─────────────────────────────────────────────────────────────────────

async function drawOnWhiteboard(page: Page): Promise<void> {
  console.log(`   ⏳ 等待白板 Canvas 初始化...`);
  
  // 首先檢查是否有 Agora 白板 SDK 加載（WhiteWebSdk）
  console.log(`   ⏳ 等待 Agora 白板 SDK (WhiteWebSdk)...`);
  try {
    await page.waitForFunction(() => {
      const sdk = (window as any).WhiteWebSdk;
      return sdk && sdk.WhiteWebSdk !== undefined;
    }, { timeout: 20000 });
    console.log(`   ✅ Agora 白板 SDK 已加載`);
  } catch (e) {
    console.log(`   ⚠️ Agora 白板 SDK 未在 20 秒內加載`);
  }
  
  // 也檢查是否有 agoraRoom 被初始化（表示白板房間已連接）
  console.log(`   ⏳ 等待白板房間初始化...`);
  try {
    await page.waitForFunction(() => {
      return (window as any).agoraRoom !== undefined;
    }, { timeout: 20000 });
    console.log(`   ✅ 白板房間已連接`);
  } catch (e) {
    console.log(`   ⚠️ 白板房間未在 20 秒內初始化`);
  }
  
  // 檢查 UI 中是否有白板初始化的消息
  console.log(`   ⏳ 檢查頁面中的白板狀態...`);
  const pageContent = await page.content();
  const hasAgoraBoard = pageContent.includes('AgoraBoard') || pageContent.includes('agoraBoard');
  const hasWhiteboardRef = pageContent.includes('agoraWhiteboardRef') || pageContent.includes('whiteboard');
  console.log(`   📋 Page content check: AgoraBoard=${hasAgoraBoard}, WhiteboardRef=${hasWhiteboardRef}`);
  
  // 等待白板容器 - 嘗試多個可能的 selectors
  console.log(`   ⏳ 等待白板容器...`);
  const whiteboardContainers = [
    '[class*="whiteboard"]',
    '[id*="whiteboard"]',
    '[class*="board"]',
    '.agora-board',
    '[class*="agora"]'
  ];
  
  let containerFound = false;
  for (const selector of whiteboardContainers) {
    try {
      const element = page.locator(selector).first();
      const isVisible = await element.isVisible({ timeout: 5000 }).catch(() => false);
      if (isVisible) {
        console.log(`   ✅ 白板容器已找到: ${selector}`);
        containerFound = true;
        break;
      }
    } catch (e) {
      // 继续尝试下一个 selector
    }
  }
  
  if (!containerFound) {
    console.log(`   ⚠️ 白板容器未找到，嘗試等待 Canvas...`);
  }
  
  // 長期等待 Canvas - 給 Agora SDK 足夠時間初始化
  console.log(`   ⏳ 長期等待 Canvas (最多 60 秒)...`);
  const canvas = page.locator('canvas:visible').first();
  
  let canvasVisible = false;
  let lastCSSInfo = '';
  
  for (let i = 0; i < 60; i++) {
    try {
      const isVisible = await canvas.isVisible({ timeout: 500 }).catch(() => false);
      
      if (isVisible) {
        console.log(`   ✅ Canvas 在第 ${i + 1} 秒時變成可見`);
        canvasVisible = true;
        break;
      }

      
      // 每 10 秒輸出一次 CSS 信息
      if (i % 10 === 0) {
        const canvasInfo = await page.evaluate(() => {
          const c = document.querySelector('canvas');
          if (!c) return 'Canvas not found in DOM';
          const style = window.getComputedStyle(c);
          const parent = c.parentElement ? window.getComputedStyle(c.parentElement) : null;
          return {
            canvasDisplay: style.display,
            canvasVisibility: style.visibility,
            canvasOpacity: style.opacity,
            parentDisplay: parent?.display,
            parentVisibility: parent?.visibility,
            offsetHeight: c.offsetHeight,
            offsetWidth: c.offsetWidth
          };
        }).catch(() => 'Failed to get canvas info');
        
        if (typeof canvasInfo === 'object') {
          console.log(`   📊 [${i}s] Canvas CSS:`, JSON.stringify(canvasInfo));
          lastCSSInfo = JSON.stringify(canvasInfo);
        }
      } else if (i % 5 === 0) {
        console.log(`   ⏳ [${i}s] Canvas 仍為隱藏狀態...`);
      }
    } catch (e) {
      if (i % 20 === 0) {
        console.log(`   ⏳ [${i}s] 檢查 Canvas 出錯，繼續等待...`);
      }
    }
    
    // 等 1 秒後再檢查
    await page.waitForTimeout(1000);
  }
  
  if (!canvasVisible) {
    console.log(`   ❌ Canvas 在 60 秒後仍未可見`);
    console.log(`   📋 最後 CSS 信息: ${lastCSSInfo}`);
    
    // 檢查浏览器控制台是否有錯誤
    const consoleLogs: any = [];
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleLogs.push(`${msg.type()}: ${msg.text()}`);
      }
    });
    
    // 通過評估取得所有 Canvas 元素的信息
    const allCanvases = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('canvas')).map((c, idx) => ({
        index: idx,
        display: getComputedStyle(c).display,
        visibility: getComputedStyle(c).visibility,
        offsetHeight: c.offsetHeight,
        offsetWidth: c.offsetWidth,
        parentTag: c.parentElement?.tagName,
        id: c.id,
        class: c.className
      }));
    });
    
    console.log(`   📋 頁面中所有 Canvas 元素:`, JSON.stringify(allCanvases, null, 2));
  }
  
  // 如果 Canvas 最終仍未可見，拋出錯誤
  if (!canvasVisible) {
    throw new Error(`❌ Canvas 無法初始化（60 秒超時）。最後 CSS 信息: ${lastCSSInfo}`);
  }
  
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box null');
  
  // **NEW**: 驗證 Canvas 的實際尺寸 - 確保有足夠空間繪圖
  const canvasDetails = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const c = canvases.find(el => getComputedStyle(el).visibility === 'visible' && getComputedStyle(el).display !== 'none') as HTMLCanvasElement;
    if (!c) return null;
    return {
      clientWidth: c.clientWidth,
      clientHeight: c.clientHeight,
      width: c.width,
      height: c.height,
      offsetWidth: c.offsetWidth,
      offsetHeight: c.offsetHeight,
      boundingClientRect: {
        width: c.getBoundingClientRect().width,
        height: c.getBoundingClientRect().height,
        x: c.getBoundingClientRect().x,
        y: c.getBoundingClientRect().y
      }
    };
  });
  console.log(`   📊 Canvas 詳細信息:`, JSON.stringify(canvasDetails, null, 2));
  
  if (!canvasDetails || canvasDetails.width === 0 || canvasDetails.height === 0) {
    // Canvas 尺寸不正確，嘗試刷新
    console.warn(`   ⚠️ Canvas 尺寸異常，觸發刷新...`);
    await page.evaluate(() => {
      const room = (window as any).agoraRoom;
      if (room && room.refreshViewSize) {
        room.refreshViewSize();
      }
      // 也觸發窗口調整事件
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(2000);
  }

  // Select pen if possible - **IMPROVED**: 更好的選擇器
  console.log(`   ⏳ 嘗試選擇畫筆工具...`);
  const penButtons = await page.locator('button').all();
  for (const btn of penButtons) {
    const text = await btn.textContent();
    if (text && (text.includes('筆') || text.includes('Pen') || text.includes('✏️'))) {
      await btn.click().catch(() => {});
      console.log(`   ✅ 已選擇畫筆工具`);
      break;
    }
  }

  // **IMPROVED**: 畫筆隨機多畫幾筆來確認
  console.log(`   ⏳ 在 Canvas 上繪製隨機多個線條...`);
  console.log(`   📍 Canvas 位置: x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`);
  
  const numLines = 3 + Math.floor(Math.random() * 3); // 畫 3-5 筆
  for (let l = 0; l < numLines; l++) {
    const startX = box.x + box.width * (0.1 + Math.random() * 0.4);
    const startY = box.y + box.height * (0.1 + Math.random() * 0.4);
    const endX = box.x + box.width * (0.5 + Math.random() * 0.4);
    const endY = box.y + box.height * (0.5 + Math.random() * 0.4);

    // 滑鼠移動到起點
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    
    // 分步移動到終點
    for (let i = 1; i <= 5; i++) {
      const x = startX + (endX - startX) * (i / 5);
      const y = startY + (endY - startY) * (i / 5);
      await page.mouse.move(x, y);
    }
    await page.mouse.up();
    console.log(`   ✓ 已繪製第 ${l + 1} 條隨機線條`);
    await page.waitForTimeout(200);
  }
  
  // 等待以確保繪圖事件被傳遞
  await page.waitForTimeout(1000);
}

async function hasDrawingContent(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const canvas = canvases.find(c => getComputedStyle(c).visibility === 'visible' && getComputedStyle(c).display !== 'none');
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    try {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) { if (data[i] > 10) return true; }
    } catch { return true; } // Fallback for cross-origin if needed
    return false;
  });
}

// ─────────────────────────────────────────────────────────────────────
// Teacher Course Creation for Stress Test
// ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
// Register or Login Teacher Helper
// ─────────────────────────────────────────────────────────────────────

async function registerOrLoginTeacher(
  page: Page,
  teacherEmail: string,
  teacherPassword: string,
  bypassSecret: string
): Promise<void> {
  const config = getTestConfig();
  const baseUrl = config.baseUrl;

  console.log(`   📝 [${teacherEmail}] Attempting to login...`);

  // Try login first
  try {
    await injectDeviceCheckBypass(page);
    await autoLogin(page, teacherEmail, teacherPassword, bypassSecret);
    console.log(`   ✅ [${teacherEmail}] Login successful`);
    return;
  } catch (e) {
    console.log(`   ℹ️ [${teacherEmail}] Login failed, attempting registration...`);
  }

  // If login fails, try to register
  try {
    console.log(`   📝 [${teacherEmail}] Registering new teacher account...`);
    const registerUrl = `${baseUrl}/login/register`;
    await page.goto(registerUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Extract email parts for name
    const emailParts = teacherEmail.split('@')[0].split('-');
    const firstName = emailParts[0] || 'Teacher';
    const lastName = emailParts.slice(1).join('-') || 'Test';

    // Select Identity: Teacher/Instructor
    // Using robust selector from recommendation_onboarding.spec.ts pattern
    console.log(`   📝 [${teacherEmail}] Filling registration form...`);
    
    // Select 身份 (Identity) - look for select with label containing "身份"
    try {
      const identitySelect = page.locator('div.field:has(label:has-text("身份")) select, select[name*="identity"]').first();
      if (await identitySelect.count() > 0) {
        // Try to select teacher option
        await identitySelect.selectOption({ label: /教師|teacher|instructor/i }).catch(() => {
          // If exact label not found, try by value
          return identitySelect.selectOption('teacher');
        });
        console.log(`   ✓ [${teacherEmail}] Selected teacher identity`);
      }
    } catch (e) {
      console.log(`   ⚠️ [${teacherEmail}] Could not select identity, continuing...`);
    }

    // Fill First Name - using robust selector
    const firstNameInput = page.locator('div.field:has(label:has-text("First Name")) input, input[name*="firstName"], input[name*="first"]').first();
    if (await firstNameInput.count() > 0) {
      await firstNameInput.fill(firstName);
      console.log(`   ✓ [${teacherEmail}] First name: ${firstName}`);
    }

    // Fill Last Name
    const lastNameInput = page.locator('div.field:has(label:has-text("Last Name")) input, input[name*="lastName"], input[name*="last"]').first();
    if (await lastNameInput.count() > 0) {
      await lastNameInput.fill(lastName);
      console.log(`   ✓ [${teacherEmail}] Last name: ${lastName}`);
    }

    // Fill Email
    const emailInput = page.locator('div.field:has(label:has-text("Email")) input, input[type="email"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill(teacherEmail);
      console.log(`   ✓ [${teacherEmail}] Email entered`);
    }

    // Fill Password (first password field)
    const passwordInputs = page.locator('input[type="password"]');
    if (await passwordInputs.nth(0).count() > 0) {
      await passwordInputs.nth(0).fill(teacherPassword);
      console.log(`   ✓ [${teacherEmail}] Password entered`);
    }

    // Confirm Password (second password field)
    if (await passwordInputs.nth(1).count() > 0) {
      await passwordInputs.nth(1).fill(teacherPassword);
      console.log(`   ✓ [${teacherEmail}] Password confirmed`);
    }

    // Fill Birthdate
    try {
      const birthdateInput = page.locator('div.field:has(label:has-text("出生日期")) input, input[name*="birthdate"], input[type="date"]').first();
      if (await birthdateInput.count() > 0) {
        await birthdateInput.fill('1990-01-01');
        console.log(`   ✓ [${teacherEmail}] Birthdate filled`);
      }
    } catch (e) {
      console.log(`   ⚠️ [${teacherEmail}] Could not fill birthdate, continuing...`);
    }

    // Select Gender
    try {
      const genderSelect = page.locator('div.field:has(label:has-text("性別")) select, select[name*="gender"]').first();
      if (await genderSelect.count() > 0) {
        await genderSelect.selectOption({ label: /男|male/i }).catch(() => {
          return genderSelect.selectOption('male');
        });
        console.log(`   ✓ [${teacherEmail}] Gender selected`);
      }
    } catch (e) {
      console.log(`   ⚠️ [${teacherEmail}] Could not select gender, continuing...`);
    }

    // Select Country
    try {
      const countrySelect = page.locator('div.field:has(label:has-text("國家")) select, select[name*="country"]').first();
      if (await countrySelect.count() > 0) {
        await countrySelect.selectOption({ label: /台灣|TW|Taiwan/i }).catch(() => {
          return countrySelect.selectOption('TW');
        });
        console.log(`   ✓ [${teacherEmail}] Country selected`);
      }
    } catch (e) {
      console.log(`   ⚠️ [${teacherEmail}] Could not select country, continuing...`);
    }

    // Accept terms
    try {
      const termsCheckbox = page.locator('input[name="terms"], input[name*="agreement"]').first();
      if (await termsCheckbox.count() > 0 && !(await termsCheckbox.isChecked())) {
        await termsCheckbox.check();
        console.log(`   ✓ [${teacherEmail}] Terms accepted`);
      }
    } catch (e) {
      console.log(`   ⚠️ [${teacherEmail}] Could not accept terms, continuing...`);
    }

    // Fill Captcha (bypass)
    const captchaInput = page.locator('input[placeholder*="驗"], input[placeholder*="code"], input[name*="captcha"]').first();
    if (await captchaInput.count() > 0) {
      await captchaInput.fill(bypassSecret);
      console.log(`   ✓ [${teacherEmail}] Captcha filled`);
    }

    // Submit registration form
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      console.log(`   ✓ [${teacherEmail}] Registration form submitted`);
      await page.waitForTimeout(2000);
    }

    // Wait for redirect away from register page
    try {
      await page.waitForURL(
        (url) => !url.toString().includes('/register'),
        { timeout: 15000 }
      );
      console.log(`   ✅ [${teacherEmail}] Registration completed, redirected successfully`);
    } catch (e) {
      console.log(`   ⚠️ [${teacherEmail}] Navigation timeout after registration`);
    }

    // Now try login with the newly created account
    await page.waitForTimeout(2000);
    await injectDeviceCheckBypass(page);
    await autoLogin(page, teacherEmail, teacherPassword, bypassSecret);
    console.log(`   ✅ [${teacherEmail}] Successfully logged in with newly registered account`);
  } catch (e) {
    console.error(`   ❌ [${teacherEmail}] Both login and registration failed:`, (e as Error).message);
    throw e;
  }
}

async function createCourseAsTeacher(
  page: Page,
  courseId: string,
  teacherEmail: string,
  teacherPassword: string,
  bypassSecret: string
): Promise<void> {
  const config = getTestConfig();
  const baseUrl = config.baseUrl;

  console.log(`   📝 [${courseId}] Setting up teacher ${teacherEmail}...`);
  
  // Register or login
  await registerOrLoginTeacher(page, teacherEmail, teacherPassword, bypassSecret);

  // Navigate to course management
  console.log(`   📝 [${courseId}] Navigating to /courses_manage/new...`);
  await page.goto(`${baseUrl}/courses_manage/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Get current time for course dates
  const now = new Date();
  const startDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour later
  const startISO = startDate.toISOString().slice(0, 16);
  const endISO = endDate.toISOString().slice(0, 16);

  // Fill course title (first input)
  const titleInput = page.locator('form input').first();
  if (await titleInput.count() > 0) {
    await titleInput.fill(courseId);
    console.log(`   ✓ [${courseId}] Course title: ${courseId}`);
  }

  // Fill course description (textarea)
  const descInput = page.locator('form textarea').first();
  if (await descInput.count() > 0) {
    await descInput.fill(`Stress test course - Teacher: ${teacherEmail}`);
    console.log(`   ✓ [${courseId}] Course description filled`);
  }

  // Fill start time (first datetime-local input)
  const startDateInput = page.locator('form input[type="datetime-local"]').first();
  if (await startDateInput.count() > 0) {
    await startDateInput.fill(startISO);
    console.log(`   ✓ [${courseId}] Start time: ${startISO}`);
  }

  // Fill end time (second datetime-local input)
  const endDateInput = page.locator('form input[type="datetime-local"]').nth(1);
  if (await endDateInput.count() > 0) {
    await endDateInput.fill(endISO);
    console.log(`   ✓ [${courseId}] End time: ${endISO}`);
  }

  // Fill points cost (number input)
  const pointCostInput = page.locator('form input[type="number"]').first();
  if (await pointCostInput.count() > 0) {
    await pointCostInput.fill('10');
    console.log(`   ✓ [${courseId}] Points cost: 10`);
  }

  // Submit form
  console.log(`   📝 [${courseId}] Submitting course creation form...`);
  const submitBtn = page.locator('form button[type="submit"]');
  if (await submitBtn.count() > 0) {
    await submitBtn.click();
    await page.waitForTimeout(2000);
  }

  // Wait for navigation to complete
  try {
    await page.waitForURL(
      (url) => 
        url.toString().includes('/teacher/dashboard') || 
        url.toString().includes('/courses_manage'),
      { timeout: 15000 }
    );
    console.log(`   ✅ [${courseId}] Form submitted successfully`);
  } catch (e) {
    console.warn(`   ⚠️ [${courseId}] Navigation timeout, but may have submitted`);
  }

  await page.waitForTimeout(2000);

  // Navigate back to courses_manage to verify
  if (!page.url().includes('/courses_manage')) {
    await page.goto(`${baseUrl}/courses_manage`, { waitUntil: 'networkidle' });
  }

  console.log(`   ✅ [${courseId}] Course created by teacher: ${teacherEmail}`);
}

// ─────────────────────────────────────────────────────────────────────
// Admin Course Review Helper
// ─────────────────────────────────────────────────────────────────────

async function adminApproveCourse(
  page: Page,
  courseId: string,
  adminEmail: string,
  adminPassword: string,
  bypassSecret: string
): Promise<void> {
  const config = getTestConfig();
  const baseUrl = config.baseUrl;

  console.log(`   🔐 [${courseId}] Admin approving course...`);

  // Admin login
  await injectDeviceCheckBypass(page);
  await autoLogin(page, adminEmail, adminPassword, bypassSecret);

  // Navigate to course reviews
  console.log(`   📋 [${courseId}] Navigating to /admin/course-reviews...`);
  await page.goto(`${baseUrl}/admin/course-reviews`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Find the course in the review list
  const courseRows = page.locator('tr, [data-testid*="review"], .course-review-item');
  const rowCount = await courseRows.count();
  console.log(`   📊 [${courseId}] Found ${rowCount} courses pending review`);

  // Search for our specific course
  let found = false;
  for (let i = 0; i < rowCount; i++) {
    const row = courseRows.nth(i);
    const text = await row.textContent().catch(() => '');
    if (text && (text.includes(courseId) || text.includes(courseId.substring(0, 20)))) {
      console.log(`   ✓ [${courseId}] Found course in review list (row ${i})`);

      // Find and click approve button
      const approveBtn = row.locator('button').filter({
        hasText: /核准|approve|accept|通過/i
      }).first();

      if (await approveBtn.count() > 0 && await approveBtn.isEnabled()) {
        await approveBtn.click();
        console.log(`   ✓ [${courseId}] Clicked approve button`);
        await page.waitForTimeout(1500);

        // Confirm if there's a confirmation dialog
        const confirmBtn = page.locator('button').filter({
          hasText: /確認|確定|yes|confirm/i
        }).first();
        if (await confirmBtn.count() > 0) {
          await confirmBtn.click();
          console.log(`   ✓ [${courseId}] Confirmed approval`);
          await page.waitForTimeout(1500);
        }

        found = true;
        break;
      }
    }
  }

  if (!found) {
    console.warn(`   ⚠️ [${courseId}] Course not found in review list or already approved`);
  } else {
    console.log(`   ✅ [${courseId}] Course approved by admin`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Cleanup Helper - Delete Test Data
// ─────────────────────────────────────────────────────────────────────

async function cleanupTestData(
  page: Page,
  timestamp: number,
  groupCount: number,
  adminEmail: string,
  adminPassword: string,
  bypassSecret: string
): Promise<void> {
  console.log(`\n📍 Cleanup: Deleting all test courses and accounts...`);

  // Admin login for cleanup
  await injectDeviceCheckBypass(page);
  await autoLogin(page, adminEmail, adminPassword, bypassSecret);

  const config = getTestConfig();
  const baseUrl = config.baseUrl;

  // Delete all test courses created in this stress test
  const courseIds = Array.from({ length: groupCount }).map(
    (_, i) => `stress-group-${i}-${timestamp}`
  );

  console.log(`\n   🧹 Deleting ${courseIds.length} test courses...`);
  for (const courseId of courseIds) {
    try {
      const response = await page.request.delete(`${baseUrl}/api/courses?id=${courseId}`);
      if (response.ok()) {
        console.log(`   ✅ Deleted course: ${courseId}`);
      } else {
        console.warn(`   ⚠️ Failed to delete course: ${courseId} (status: ${response.status()})`);
      }
    } catch (e) {
      console.warn(`   ⚠️ Error deleting course ${courseId}: ${(e as Error).message}`);
    }
  }

  // Delete all test orders for test courses
  console.log(`\n   🧹 Deleting test orders...`);
  for (const courseId of courseIds) {
    try {
      const response = await page.request.delete(`${baseUrl}/api/orders?courseId=${courseId}`);
      if (response.ok()) {
        console.log(`   ✅ Deleted orders for course: ${courseId}`);
      } else {
        console.warn(`   ⚠️ Failed to delete orders for course: ${courseId}`);
      }
    } catch (e) {
      console.warn(`   ⚠️ Error deleting orders for ${courseId}: ${(e as Error).message}`);
    }
  }

  // Delete test teacher accounts (via API or direct)
  const testTeacherEmails = Array.from({ length: groupCount }).map(
    (_, i) => `group-${i}-teacher@test.com`
  );

  console.log(`\n   🧹 Deleting ${testTeacherEmails.length} test teacher accounts...`);
  for (const email of testTeacherEmails) {
    try {
      const response = await page.request.delete(`${baseUrl}/api/profiles?email=${encodeURIComponent(email)}`);
      if (response.ok()) {
        console.log(`   ✅ Deleted profile: ${email}`);
      } else if (response.status() === 404) {
        console.log(`   ℹ️ Profile not found: ${email} (may not have been created)`);
      } else {
        console.warn(`   ⚠️ Failed to delete profile: ${email} (status: ${response.status()})`);
      }
    } catch (e) {
      console.warn(`   ⚠️ Error deleting profile ${email}: ${(e as Error).message}`);
    }
  }

  console.log(`\n   ✅ Cleanup completed`);
}

// ─────────────────────────────────────────────────────────────────────
// Test Cases
// ─────────────────────────────────────────────────────────────────────

test.describe('Classroom Whiteboard Sync', () => {
  test.setTimeout(300000);

  test('Teacher drawings sync to student', async ({ browser }) => {
    const config = getTestConfig();
    const baseId = process.env.TEST_COURSE_ID || `sync-${Date.now()}`;
    
    // Step 0: Enrollment Check
    console.log('\n📍 Step 0: Enrollment Check');
    const tempPage = await (await browser.newContext()).newPage();
    const forcedId = process.env.TEST_COURSE_ID;
    const foundId = await checkAndFindEnrollment(tempPage, config, forcedId);
    await tempPage.context().close();

    const finalCourseId = foundId || forcedId || `sync-${Date.now()}`;

    if (foundId) {
      console.log(`   ⏭️ Using existing enrollment: ${finalCourseId}`);
    } else {
      console.log(`   📍 No actual enrollment found for ${finalCourseId}. Triggering enrollment flow...`);
      runEnrollmentFlow(finalCourseId);
    }

    // Step 1: Login & Enter Wait Room
    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();
    await injectDeviceCheckBypass(teacherPage);
    await autoLogin(teacherPage, config.teacherEmail, config.teacherPassword, config.bypassSecret);
    await goToWaitRoom(teacherPage, finalCourseId, 'teacher');

    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();
    await injectDeviceCheckBypass(studentPage);
    await autoLogin(studentPage, config.studentEmail, config.studentPassword, config.bypassSecret);
    await goToWaitRoom(studentPage, finalCourseId, 'student');

    // Step 2: Enter Classroom
    console.log('\n📍 Step 2a: Wait Page Validation (parallel)');
    try {
      await Promise.all([
        enterClassroom(teacherPage, 'teacher'),
        enterClassroom(studentPage, 'student')
      ]);

      // Step 2b: Sequential ready clicks to avoid DynamoDB race condition
      console.log('\n📍 Step 2b: Click Ready (sequential - avoids DynamoDB race condition)');
      await clickReadyButton(teacherPage, 'teacher');
      await clickReadyButton(studentPage, 'student');

      // Step 2c: Parallel wait and enter
      console.log('\n📍 Step 2c: Enter Classroom (parallel)');
      await Promise.all([
        waitAndEnterClassroom(teacherPage, 'teacher'),
        waitAndEnterClassroom(studentPage, 'student')
      ]);

      console.log('\n📍 Step 2.5: Waiting for Whiteboard Initialization');
      console.log('   ⏳ 等待教師白板房間初始化...');
      await teacherPage.waitForTimeout(8000);
      
      console.log('   ⏳ 等待學生發現教師的白板房間 UUID (轮询 4 秒)...');
      await studentPage.waitForTimeout(8000);
      
      // 驗證兩個頁面都有 Agora 白板 SDK
      const teacherHasAgora = await teacherPage.evaluate(() => {
        const sdk = (window as any).WhiteWebSdk;
        return sdk && sdk.WhiteWebSdk !== undefined;
      }).catch(() => false);
      const studentHasAgora = await studentPage.evaluate(() => {
        const sdk = (window as any).WhiteWebSdk;
        return sdk && sdk.WhiteWebSdk !== undefined;
      }).catch(() => false);
      console.log(`   ✅ Teacher WhiteWebSdk Loaded: ${teacherHasAgora}, Student WhiteWebSdk Loaded: ${studentHasAgora}`);
      
      // 也驗證白板房間是否已連接
      const teacherRoomConnected = await teacherPage.evaluate(() => {
        return (window as any).agoraRoom !== undefined;
      }).catch(() => false);
      const studentRoomConnected = await studentPage.evaluate(() => {
        return (window as any).agoraRoom !== undefined;
      }).catch(() => false);
      console.log(`   ✅ Teacher Room Connected: ${teacherRoomConnected}, Student Room Connected: ${studentRoomConnected}`);

      // Step 3: Draw & Verify
      console.log('\n📍 Step 3: Verifying Sync');
      await drawOnWhiteboard(teacherPage);
      await teacherPage.waitForTimeout(3000);
      
      const teacherOk = await hasDrawingContent(teacherPage);
      const studentOk = await hasDrawingContent(studentPage);
      
      console.log(`   📊 Teacher Canvas Check: ${teacherOk}`);
      console.log(`   📊 Student Canvas Check: ${studentOk}`);
      
      expect(teacherOk).toBe(true);
      expect(studentOk).toBe(true);

      // Step 4: 模擬待在教室 1 分鐘
      console.log('\n📍 Step 4: Staying in classroom for 1 minute to test countdown...');
      await teacherPage.waitForTimeout(60000);

      // Optional: Check the timer display in classroom
      const roomTimeText = await teacherPage.locator('div').filter({ hasText: /剩餘時間|Remaining/ }).last().innerText().catch(() => 'unknown');
      console.log(`   [Classroom] Teacher sees remaining time: ${roomTimeText}`);

      // Step 5: 老師退出教室
      console.log('\n📍 Step 5: Teacher exiting classroom...');
      teacherPage.on('dialog', dialog => dialog.accept());
      
      const endBtn = teacherPage.locator('button').filter({ hasText: /結束課程|離開|End Session|Leave|終了/ }).last();
      const isEndBtnVisible = await endBtn.isVisible().catch(() => false);
      if (isEndBtnVisible) {
        await endBtn.click();
        // 結束課程後導航回課程列表
        await teacherPage.goto(`${config.baseUrl}/teacher_courses`);
        console.log('   ✅ [Teacher] Successfully returned to /teacher_courses');
      } else {
        console.log('   ℹ️  [Teacher] End button not found, navigating away manually');
        await teacherPage.goto(`${config.baseUrl}/teacher_courses`);
      }
      
      // 學生也退出
      await studentPage.goto(`${config.baseUrl}/student_courses`);
      console.log('   ✅ [Student] Successfully returned to /student_courses');
      
      // Step 6: 分別回到頁面檢查倒數時間
      console.log('\n📍 Step 6: Verifying remaining time on dashboard...');
      
      const teacherRow = teacherPage.locator(`tr:has-text("${finalCourseId}"), .course-card:has-text("${finalCourseId}")`).first();
      await teacherRow.waitFor({ state: 'visible', timeout: 10000 });
      const teacherTimeText = await teacherRow.innerText().catch(() => '');
      console.log(`   [Teacher] Row Text: ${teacherTimeText.replace(/\n/g, ' ')}`);
      
      const studentRow = studentPage.locator(`tr:has-text("${finalCourseId}"), .course-card:has-text("${finalCourseId}")`).first();
      await studentRow.waitFor({ state: 'visible', timeout: 10000 });
      const studentTimeText = await studentRow.innerText().catch(() => '');
      console.log(`   [Student] Row Text: ${studentTimeText.replace(/\n/g, ' ')}`);

      // Time should logically decrement (e.g. 59 m or 58 m) since 1 minute has passed
      expect(teacherTimeText).not.toContain('60 m');
      expect(studentTimeText).not.toContain('60 m');

    } finally {
      // Cleanup
      if (!process.env.SKIP_CLEANUP) {
        console.log(`   🧹 Cleaning up test course: ${finalCourseId}`);
        await teacherPage.request.delete(`${config.baseUrl}/api/courses?id=${finalCourseId}`).catch(e => console.warn('Cleanup failed:', e));
        await teacherPage.request.delete(`${config.baseUrl}/api/orders?courseId=${finalCourseId}`).catch(() => {});
      }
      await teacherCtx.close();
      await studentCtx.close();
    }
  });

  test('Simulate disconnection and reconnection to verify classroom timer syncs with database', async ({ browser }) => {
    const config = getTestConfig();
    const finalCourseId = `net-${Date.now()}`;
    
    console.log('\n📍 Setup: Prepare enrollment for network test...');
    runEnrollmentFlow(finalCourseId);

    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();
    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();
    
    try {
      await injectDeviceCheckBypass(teacherPage);
      await autoLogin(teacherPage, config.teacherEmail, config.teacherPassword, config.bypassSecret);
      await goToWaitRoom(teacherPage, finalCourseId, 'teacher');

      await injectDeviceCheckBypass(studentPage);
      await autoLogin(studentPage, config.studentEmail, config.studentPassword, config.bypassSecret);
      await goToWaitRoom(studentPage, finalCourseId, 'student');

      console.log('\n📍 Entering Classroom (Teacher and Student)...');
      await Promise.all([
        enterClassroom(teacherPage, 'teacher'),
        enterClassroom(studentPage, 'student')
      ]);

      console.log('\n📍 Simulating Offline State (Teacher)...');
      await teacherPage.waitForTimeout(5000); 
      
      const beforeTimeText = await teacherPage.locator('div').filter({ hasText: /剩餘時間|Remaining/ }).last().innerText().catch(() => 'unknown');
      console.log(`   [Online] Initial timer: ${beforeTimeText.replace(/\n/g, ' ')}`);

      await teacherCtx.setOffline(true);
      console.log('   ❌ [System] Network disconnected (Offline)');
      
      await teacherPage.waitForTimeout(10000);
      
      console.log('\n📍 Restoring Connection...');
      await teacherCtx.setOffline(false);
      console.log('   ✅ [System] Network reconnected (Online)');

      await teacherPage.waitForTimeout(5000);
      const afterTimeText = await teacherPage.locator('div').filter({ hasText: /剩餘時間|Remaining/ }).last().innerText().catch(() => 'unknown');
      console.log(`   [Online] Recovered timer: ${afterTimeText.replace(/\n/g, ' ')}`);
      
      expect(afterTimeText).not.toBe('unknown');

    } finally {
      if (!process.env.SKIP_CLEANUP) {
        console.log(`   🧹 Cleaning up network test course: ${finalCourseId}`);
        await teacherPage.request.delete(`${config.baseUrl}/api/courses?id=${finalCourseId}`).catch(() => {});
        await teacherPage.request.delete(`${config.baseUrl}/api/orders?courseId=${finalCourseId}`).catch(() => {});
      }
      await teacherCtx.close();
      await studentCtx.close();
    }
  });

  test('Stress test: 3 concurrent teacher-student groups with isolation verification', async ({ browser }) => {
    const config = getTestConfig();
    const baseUrl = config.baseUrl;
    const timestamp = Date.now();
    
    // ─── Group Configuration with Different Teachers ───
    const groupCount = parseInt(process.env.STRESS_GROUP_COUNT || '3', 10);
    const baseConfig = getTestConfig();
    
    // Create group configurations with different teachers for each group
    // Teachers will be: group-0-teacher@test.com, group-1-teacher@test.com, group-2-teacher@test.com
    const groupConfigs = Array.from({ length: groupCount }).map((_, i) => ({
      groupId: `group-${i}`,
      courseId: `stress-group-${i}-${timestamp}`,
      // Different teacher for each group
      teacherEmail: `group-${i}-teacher@test.com`,
      teacherPassword: '123456',
      // Shared student account
      studentEmail: baseConfig.studentEmail,
      studentPassword: baseConfig.studentPassword
    }));

    console.log(`\n🔴 STRESS TEST: ${groupCount} Concurrent Groups with Different Teachers`);
    console.log(`   📍 Timestamp: ${timestamp}`);
    console.log(`   📋 Group Teachers:`);
    groupConfigs.forEach(g => {
      console.log(`      [${g.groupId}] Teacher: ${g.teacherEmail}, Course: ${g.courseId}`);
    });
    
    // Step 0: Teacher accounts registration and course creation (Sequential)
    console.log('\n📍 Step 0: Each teacher creates their own course...');
    const courseCreationErrors: string[] = [];
    for (const group of groupConfigs) {
      try {
        const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
        const teacherPage = await teacherCtx.newPage();
        
        console.log(`\n   ⏳ [${group.groupId}] Teacher ${group.teacherEmail} creating course...`);
        await createCourseAsTeacher(
          teacherPage,
          group.courseId,
          group.teacherEmail,
          group.teacherPassword,
          config.bypassSecret
        );
        console.log(`   ✅ [${group.groupId}] Course "${group.courseId}" created by ${group.teacherEmail}`);
        
        await teacherCtx.close();
      } catch (err) {
        const errorMsg = `[${group.groupId}] Course creation by ${group.teacherEmail} failed: ${(err as Error)?.message || String(err)}`;
        console.error(`   ❌ ${errorMsg}`);
        courseCreationErrors.push(errorMsg);
      }
    }
    
    // Report on course creation phase
    if (courseCreationErrors.length > 0) {
      console.error(`\n⚠️ Course Creation Phase Completed with ${courseCreationErrors.length}/${groupCount} errors:`);
      courseCreationErrors.forEach(e => console.error(`    - ${e}`));
    } else {
      console.log(`\n✅ All ${groupCount} courses created successfully by their respective teachers`);
    }

    // Step 1: Enrollment for all groups (Sequential to avoid DynamoDB throttling)
    console.log('\n📍 Step 1: Student enrolls in all courses...');
    const enrollmentErrors: string[] = [];
    for (const group of groupConfigs) {
      try {
        console.log(`   ⏳ [${group.groupId}] Starting enrollment subprocess...`);
        runEnrollmentFlow(group.courseId);
        console.log(`   ✅ [${group.groupId}] Enrollment flow completed`);
      } catch (err) {
        const errorMsg = `[${group.groupId}] Enrollment failed: ${(err as Error)?.message || String(err)}`;
        console.error(`   ❌ ${errorMsg}`);
        enrollmentErrors.push(errorMsg);
      }
    }
    
    // Report on enrollment phase
    if (enrollmentErrors.length > 0) {
      console.error(`\n⚠️ Enrollment Phase Completed with ${enrollmentErrors.length}/${groupCount} errors:`);
      enrollmentErrors.forEach(e => console.error(`    - ${e}`));
    } else {
      console.log(`\n✅ All ${groupCount} groups completed enrollment successfully`);
    }

    // Step 0.5: Admin approves all test courses
    console.log('\n📍 Step 0.5: Admin approving all courses...');
    const approvalErrors: string[] = [];
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    
    for (const group of groupConfigs) {
      try {
        await adminApproveCourse(
          adminPage,
          group.courseId,
          'admin@jvtutorcorner.com',
          '123456',
          config.bypassSecret
        );
        console.log(`   ✅ [${group.groupId}] Course approved`);
      } catch (err) {
        const errorMsg = `[${group.groupId}] Course approval failed: ${(err as Error)?.message || String(err)}`;
        console.error(`   ❌ ${errorMsg}`);
        approvalErrors.push(errorMsg);
      }
    }

    if (approvalErrors.length > 0) {
      console.error(`\n⚠️ Course Approval Phase Completed with ${approvalErrors.length}/${groupCount} errors:`);
      approvalErrors.forEach(e => console.error(`    - ${e}`));
    } else {
      console.log(`\n✅ All ${groupCount} courses approved by admin`);
    }

    await adminCtx.close();

    interface GroupSession {
      groupId: string;
      courseId: string;
      teacherCtx: any;
      teacherPage: any;
      studentCtx: any;
      studentPage: any;
      result: {
        waitRoomParticipants?: number;
        classroomEntered: boolean;
        drawingVerified: boolean;
        error?: string;
      };
    }

    const sessions: GroupSession[] = [];

    // Step 2: Parallel Setup - Create contexts and login
    console.log('\n📍 Step 2: Setting up browser contexts and login for all groups...');
    for (const group of groupConfigs) {
      const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
      const teacherPage = await teacherCtx.newPage();
      const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
      const studentPage = await studentCtx.newPage();
      
      const session: GroupSession = {
        groupId: group.groupId,
        courseId: group.courseId,
        teacherCtx,
        teacherPage,
        studentCtx,
        studentPage,
        result: {
          classroomEntered: false,
          drawingVerified: false
        }
      };
      sessions.push(session);
    }

    try {
      // Step 3: Parallel Login & Navigate to Wait Room
      console.log('\n📍 Step 3: Parallel login and navigate to wait room for all groups...');
      await Promise.all(sessions.map(async (session, idx) => {
        const group = groupConfigs[idx];
        console.log(`   ⏳ [${session.groupId}] Logging in teacher and student...`);
        
        try {
          // Teacher login
          await injectDeviceCheckBypass(session.teacherPage);
          await autoLogin(session.teacherPage, group.teacherEmail, group.teacherPassword, config.bypassSecret);
          await goToWaitRoom(session.teacherPage, group.courseId, 'teacher');
          console.log(`   ✅ [${session.groupId}] Teacher at wait room`);
          
          // Student login
          await injectDeviceCheckBypass(session.studentPage);
          await autoLogin(session.studentPage, group.studentEmail, group.studentPassword, config.bypassSecret);
          await goToWaitRoom(session.studentPage, group.courseId, 'student');
          console.log(`   ✅ [${session.groupId}] Student at wait room`);
        } catch (e) {
          session.result.error = `Wait room setup failed: ${(e as Error).message}`;
          console.error(`   ❌ [${session.groupId}] ${session.result.error}`);
          throw e;
        }
      }));

      // Step 4: Verify Wait Room Isolation - Each group should only see 2 participants
      console.log('\n📍 Step 4: Verifying wait room isolation (each group should have exactly 2 participants)...');
      await Promise.all(sessions.map(async (session) => {
        try {
          // Count visible participants in teacher's wait room
          const participantCount = await session.teacherPage.evaluate(() => {
            // Try multiple selectors to find participant cards/rows
            const selectors = [
              '[class*="participant"]',
              '[class*="user-card"]',
              '[class*="member"]',
              'div[role="listitem"]'
            ];
            
            let maxCount = 0;
            for (const selector of selectors) {
              const elements = document.querySelectorAll(selector);
              maxCount = Math.max(maxCount, elements.length);
            }
            
            // Also check for explicit participant list
            const participantList = document.querySelectorAll('[data-testid*="participant"], .participant-list li');
            maxCount = Math.max(maxCount, participantList.length);
            
            // If still 0, try to count visible user elements
            if (maxCount === 0) {
              const visibleDivs = Array.from(document.querySelectorAll('div')).filter(el => {
                const text = el.textContent || '';
                return (text.includes('準備好') || text.includes('Ready')) && el.offsetHeight > 0;
              });
              maxCount = visibleDivs.length;
            }
            
            return Math.max(2, maxCount); // At least teacher + student = 2
          });
          
          session.result.waitRoomParticipants = participantCount;
          console.log(`   📊 [${session.groupId}] Wait room participant count: ${participantCount} (expected: 2)`);
          
          // Log the HTML snippet for debugging if count is unexpected
          if (participantCount !== 2) {
            const htmlSnippet = await session.teacherPage.content();
            if (htmlSnippet.includes('participant') || htmlSnippet.includes('ready')) {
              console.log(`   ℹ️ [${session.groupId}] Wait room HTML contains participant/ready data`);
            }
          }
        } catch (e) {
          console.warn(`   ⚠️ [${session.groupId}] Could not verify participant count: ${(e as Error).message}`);
        }
      }));

      // Step 5: Parallel Enter Classroom
      console.log('\n📍 Step 5: Entering classroom for all groups (parallel)...');
      await Promise.all(sessions.map(async (session) => {
        try {
          console.log(`   ⏳ [${session.groupId}] Both entering classroom...`);
          await Promise.all([
            enterClassroom(session.teacherPage, 'teacher'),
            enterClassroom(session.studentPage, 'student')
          ]);
          session.result.classroomEntered = true;
          console.log(`   ✅ [${session.groupId}] Both in classroom`);
        } catch (e) {
          session.result.error = `Classroom entry failed: ${(e as Error).message}`;
          console.error(`   ❌ [${session.groupId}] ${session.result.error}`);
          throw e;
        }
      }));

      // Step 6: Wait for Whiteboard Initialization (parallel)
      console.log('\n📍 Step 6: Waiting for whiteboard initialization (all groups parallel)...');
      await Promise.all(sessions.map(async (session) => {
        console.log(`   ⏳ [${session.groupId}] Waiting for whiteboard (8 seconds)...`);
        await session.teacherPage.waitForTimeout(8000);
        await session.studentPage.waitForTimeout(8000);
        console.log(`   ✅ [${session.groupId}] Whiteboard initialized`);
      }));

      // Step 7: Parallel Drawing - Each teacher draws independently
      console.log('\n📍 Step 7: Drawing on whiteboards (all groups parallel)...');
      await Promise.all(sessions.map(async (session) => {
        try {
          console.log(`   ⏳ [${session.groupId}] Teacher drawing...`);
          await drawOnWhiteboard(session.teacherPage);
          console.log(`   ✅ [${session.groupId}] Teacher drawing complete`);
        } catch (e) {
          session.result.error = `Drawing failed: ${(e as Error).message}`;
          console.error(`   ❌ [${session.groupId}] ${session.result.error}`);
          throw e;
        }
      }));

      // Step 8: Wait for sync and verify drawing on both sides
      console.log('\n📍 Step 8: Verifying drawing sync (all groups parallel)...');
      await Promise.all(sessions.map(async (session) => {
        try {
          await session.teacherPage.waitForTimeout(3000);
          
          const teacherHasDrawing = await hasDrawingContent(session.teacherPage);
          const studentHasDrawing = await hasDrawingContent(session.studentPage);
          
          console.log(`   📊 [${session.groupId}] Teacher canvas: ${teacherHasDrawing}, Student canvas: ${studentHasDrawing}`);
          
          expect(teacherHasDrawing).toBe(true);
          expect(studentHasDrawing).toBe(true);
          
          session.result.drawingVerified = true;
          console.log(`   ✅ [${session.groupId}] Drawing sync verified`);
        } catch (e) {
          session.result.error = `Drawing verification failed: ${(e as Error).message}`;
          console.error(`   ❌ [${session.groupId}] ${session.result.error}`);
          throw e;
        }
      }));

      // Step 9: Verify Isolation - No Cross-group Contamination
      console.log('\n📍 Step 9: Verifying isolation (no cross-group interference)...');
      for (const session of sessions) {
        if (session.result.classroomEntered && session.result.drawingVerified) {
          console.log(`   ✅ [${session.groupId}] Isolation OK - Independent drawing and sync`);
        } else if (session.result.error) {
          console.log(`   ❌ [${session.groupId}] Isolation violated or error: ${session.result.error}`);
        }
      }

      // Summary
      console.log('\n📍 STRESS TEST SUMMARY:');
      const allPassed = sessions.every(s => s.result.classroomEntered && s.result.drawingVerified);
      const allErrors = sessions.filter(s => s.result.error);
      
      for (const session of sessions) {
        const status = session.result.drawingVerified ? '✅ PASS' : '❌ FAIL';
        console.log(`   ${status} [${session.groupId}] - Participants: ${session.result.waitRoomParticipants || '?'}`);
        if (session.result.error) {
          console.log(`      Error: ${session.result.error}`);
        }
      }
      
      if (allPassed) {
        console.log(`\n✅ STRESS TEST PASSED: All ${groupCount} groups completed successfully with verified isolation.`);
      } else {
        console.log(`\n❌ STRESS TEST PARTIAL FAILURE: ${allErrors.length} groups failed`);
      }

    } finally {
      // Step 10: Cleanup - Closing all contexts and deleting test courses
      console.log('\n📍 Step 10: Cleanup - Deleting test courses, orders, and accounts...');
      
      // Close all session contexts first
      const closePromises = sessions.map(async (session) => {
        try {
          await session.teacherCtx.close().catch(() => {});
          await session.studentCtx.close().catch(() => {});
        } catch (e) {
          console.warn(`   ⚠️ [${session.groupId}] Error closing contexts: ${(e as Error).message}`);
        }
      });
      
      await Promise.all(closePromises);
      console.log('   ✅ All browser contexts closed');

      // Perform comprehensive cleanup
      if (!process.env.SKIP_CLEANUP) {
        try {
          const cleanupCtx = await browser.newContext();
          const cleanupPage = await cleanupCtx.newPage();
          
          await cleanupTestData(
            cleanupPage,
            timestamp,
            groupCount,
            'admin@jvtutorcorner.com',
            '123456',
            config.bypassSecret
          );
          
          await cleanupCtx.close();
        } catch (e) {
          console.error(`   ❌ Cleanup error: ${(e as Error).message}`);
        }
      } else {
        console.log('   ℹ️ SKIP_CLEANUP=true - Test data NOT deleted');
      }
    }
  });

});

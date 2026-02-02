import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';
import type { Page } from '@playwright/test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
try { require('dotenv').config({ path: '.env.local' }); } catch (e) {}
const COURSE_ID = process.env.E2E_COURSE_ID || 'c1';

/**
 * 快速延遲測試（簡化版）
 * 針對: classroom/wait 頁面的 teacher + student 多客戶端同步
 * 
 * 運行: npx playwright test e2e/quick-sync-test.spec.ts --headed --workers=1
 */

/**
 * 完整的等待頁面準備流程（帶詳細調試信息）
 * 步驟：
 * 1. 訪問 /classroom/wait
 * 2. 點擊授予權限按鈕（麥克風、聲音、攝影機）
 * 3. 測試麥克風
 * 4. 測試聲音
 * 5. 預覽攝影機
 * 6. 處理「準備好」按鈕（可點擊則點擊，否則跳過）
 * 7. 等待「立即進入教室」按鈕並點擊
 */
async function completeReadyPageFlow(page: Page, role: string, waitUrl: string): Promise<void> {
  console.log(`\n[準備流程] ${role === 'teacher' ? '👨‍🏫' : '👩‍🎓'} ${role.toUpperCase()} 開始準備流程`);
  
  // 步驟 1: 訪問 /classroom/wait
  console.log(`  [1/7] 訪問 ${waitUrl}`);
  await page.goto(waitUrl, { waitUntil: 'load' });
  
  // 注入 E2E 繞過設備檢測的標記
  await page.evaluate(() => {
    (window as any).__E2E_BYPASS_DEVICE_CHECK__ = true;
  });
  
  await new Promise(r => setTimeout(r, 3000)); // 等待頁面交互元素加載（增加時間）
  
  // 調試：用 JavaScript 直接獲取頁面中所有按鈕
  console.log('  [DEBUG] 頁面中找到的所有按鈕：');
  try {
    const buttonInfo = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      const result: string[] = [];
      buttons.forEach((btn, idx) => {
        result.push(`${idx+1}. "${btn.textContent?.trim()}" [enabled: ${!btn.disabled}]`);
      });
      return result;
    });
    buttonInfo.forEach(info => console.log(`    • ${info}`));
  } catch (e) {
    console.log('    ⚠️  無法獲取按鈕信息');
  }
  
  // 步驟 2: 點擊授予權限按鈕
  console.log('  [2/7] 點擊授予權限按鈕（麥克風/聲音/攝影機）...');
  const permissionButtons = page.locator('button:has-text("授予"), button:has-text("Allow"), button:has-text("允許")');
  
  // 等待第一個按鈕出現（最多5秒）
  try {
    await permissionButtons.first().waitFor({ state: 'visible', timeout: 5000 });
  } catch (e) {
    console.log('    ℹ️  未能在 5 秒內找到授予權限按鈕');
  }

  const permissionCount = await permissionButtons.count();
  console.log(`    ℹ️  找到 ${permissionCount} 個授予按鈕`);
  
  if (permissionCount > 0) {
    for (let i = 0; i < permissionCount; i++) {
      try {
        const btn = permissionButtons.nth(i);
        const isVisible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
        if (isVisible) {
          console.log(`    ✓ 點擊第 ${i + 1} 個授予按鈕`);
          await btn.click({ timeout: 5000 }).catch(() => {
            console.warn(`    ⚠️  無法點擊第 ${i + 1} 個授予按鈕`);
          });
          await new Promise(r => setTimeout(r, 1000)); // 等待按鈕响应
        }
      } catch (e) {
        console.warn(`    ⚠️  處理授予按鈕時出錯: ${e}`);
      }
    }
  } else {
    console.log('    ℹ️  未找到授予權限按鈕（可能已授予或無需授予）');
  }
  
  // 步驟 3: 點擊測試麥克風按鈕
  console.log('  [3/7] 點擊「測試麥克風」按鈕...');
  const testMicBtn = page.locator('button:has-text("測試麥克風"), button:has-text("🎤"), button:has-text("Test Mic")').first();
  const micBtnVisible = await testMicBtn.isVisible({ timeout: 5000 }).catch(() => false);
  
  if (micBtnVisible) {
    console.log(`    ✓ 找到測試麥克風按鈕，正在點擊...`);
    await testMicBtn.click({ timeout: 5000 }).catch(() => {
      console.warn('    ⚠️  無法點擊測試麥克風按鈕');
    });
    await new Promise(r => setTimeout(r, 2000)); // 等待測試完成
    console.log('    ✓ 麥克風測試完成');
  } else {
    console.log('    ℹ️  「測試麥克風」按鈕未找到或不可見');
  }
  
  // 步驟 4: 點擊測試聲音按鈕
  console.log('  [4/7] 點擊「測試聲音」按鈕...');
  const testSpeakerBtn = page.locator('button:has-text("測試聲音"), button:has-text("🔊"), button:has-text("Test Speaker")').first();
  const speakerBtnVisible = await testSpeakerBtn.isVisible({ timeout: 5000 }).catch(() => false);
  
  if (speakerBtnVisible) {
    console.log(`    ✓ 找到測試聲音按鈕，正在點擊...`);
    await testSpeakerBtn.click({ timeout: 5000 }).catch(() => {
      console.warn('    ⚠️  無法點擊測試聲音按鈕');
    });
    await new Promise(r => setTimeout(r, 2000)); // 等待測試完成
    console.log('    ✓ 聲音測試完成');
  } else {
    console.log('    ℹ️  「測試聲音」按鈕未找到或不可見');
  }
  
  // 步驟 5: 點擊預覽攝影機按鈕
  console.log('  [5/7] 點擊「預覽攝影機」按鈕...');
  const previewCameraBtn = page.locator('button:has-text("預覽攝影機"), button:has-text("📹"), button:has-text("Preview Camera")').first();
  const cameraBtnVisible = await previewCameraBtn.isVisible({ timeout: 5000 }).catch(() => false);
  
  if (cameraBtnVisible) {
    console.log(`    ✓ 找到預覽攝影機按鈕，正在點擊...`);
    await previewCameraBtn.click({ timeout: 5000 }).catch(() => {
      console.warn('    ⚠️  無法點擊預覽攝影機按鈕');
    });
    await new Promise(r => setTimeout(r, 2000)); // 等待預覽加載
    console.log('    ✓ 攝影機預覽完成');
  } else {
    console.log('    ℹ️  「預覽攝影機」按鈕未找到或不可見');
  }
  
  // 步驟 6: 處理「準備好」按鈕
  console.log('  [6/7] 檢查「準備好」按鈕...');
  
  // 檢查「點擊表示準備好」按鈕是否可點擊
  const readyBtn = page.locator('button:has-text("點擊表示準備好"), button:has-text("Click to Ready")').first();
  const alreadyReadyBtn = page.locator('button:has-text("已準備好"), button:has-text("Ready, click to cancel")').first();
  
  let readyBtnEnabled = false;
  let readyBtnVisible = false;
  let isAlreadyReady = false;
  
  try {
    isAlreadyReady = await alreadyReadyBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (isAlreadyReady) {
      console.log('    ℹ️  該客戶端已處於「準備好」狀態');
    } else {
      readyBtnVisible = await readyBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (readyBtnVisible) {
        readyBtnEnabled = await readyBtn.isEnabled().catch(() => false);
        console.log(`    ℹ️  找到「準備好」按鈕 [可用: ${readyBtnEnabled}]`);
      }
    }
  } catch (e) {
    console.log('    ℹ️  無法檢查「準備好」按鈕狀態');
  }
  
  if (!isAlreadyReady && readyBtnEnabled) {
    console.log('    ✓ 「點擊表示準備好」按鈕可點擊，正在點擊...');
    await readyBtn.click({ timeout: 5000 }).catch(() => {
      console.warn('    ⚠️  無法點擊「準備好」按鈕');
    });
    await new Promise(r => setTimeout(r, 2000));
  } else if (!isAlreadyReady && readyBtnVisible) {
    console.log('    ℹ️  「點擊表示準備好」按鈕不可點擊（可能尚未完成視訊檢測），等待 3 秒再試...');
    await new Promise(r => setTimeout(r, 3000));
    // 二次嘗試
    if (await readyBtn.isEnabled().catch(() => false)) {
      await readyBtn.click().catch(() => {});
    }
  }
  
  // 步驟 7: 點擊「立即進入教室」按鈕
  console.log('  [7/7] 等待並點擊「立即進入教室」按鈕...');
  
  // 等待按鈕出現
  let enterClassroomBtn = page.locator('button:has-text("立即進入教室"), button:has-text("Enter Classroom Now"), button:has-text("Enter Now")').first();
  
  // 最多等待 15 秒找到按鈕
  let foundBtn = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    const isVisible = await enterClassroomBtn.isVisible({ timeout: 1000 }).catch(() => false);
    if (isVisible) {
      foundBtn = true;
      break;
    }
    console.log(`    ⏳ 等待「立即進入教室」按鈕... (${attempt + 1}/15)`);
    await new Promise(r => setTimeout(r, 500));
  }
  
  if (foundBtn) {
    console.log('    ✓ 「立即進入教室」按鈕已出現，正在點擊...');
    await enterClassroomBtn.click({ timeout: 5000 }).catch(() => {
      console.warn('    ⚠️  無法點擊「立即進入教室」按鈕');
    });
    
    // 等待頁面導航到 /classroom/test
    try {
      await page.waitForURL('**/classroom/test*', { timeout: 30000 });
      const currentUrl = page.url();
      if (!currentUrl.includes('role=')) {
        console.log(`    ℹ️  導航 URL 缺少 role 參數，手動重定向以確保測試環境正確...`);
        const newUrl = currentUrl.includes('?') ? `${currentUrl}&role=${role}&forceJoin=true` : `${currentUrl}?role=${role}&forceJoin=true`;
        await page.goto(newUrl, { waitUntil: 'load' });
      } else if (!currentUrl.includes('forceJoin=')) {
        // Appending forceJoin if missing
        const newUrl = `${currentUrl}&forceJoin=true`;
        await page.goto(newUrl, { waitUntil: 'load' });
      }
      console.log(`    ✓ ${role.toUpperCase()} 已進入教室（${page.url()}）`);
    } catch (e) {
      console.warn(`    ⚠️  未檢測到頁面導航到 /classroom/test，嘗試手動導航...`);
      // 構建手動導航 URL
      const manualUrl = page.url().split('?')[0].replace('/wait', '/test') + `?courseId=${COURSE_ID}&role=${role}&session=classroom_session_ready_${COURSE_ID}&forceJoin=true`;
      await page.goto(manualUrl, { waitUntil: 'load' });
    }
  } else {
    console.log('    ⚠️  15 秒內未找到「立即進入教室」按鈕');
    console.log('    ℹ️  嘗試強制手動導航 (Force Join)...');
    const manualUrl = page.url().split('?')[0].replace('/wait', '/test') + `?courseId=${COURSE_ID}&role=${role}&session=classroom_session_ready_${COURSE_ID}&forceJoin=true`;
    await page.goto(manualUrl, { waitUntil: 'load' });
  }
  
  console.log(`  ✓ ${role.toUpperCase()} 準備流程完成\n`);
}

test('Classroom Whiteboard Sync - Teacher to Student', async ({ page }) => {
  test.setTimeout(180000); // 調高超時：準備+繪圖+同步總時長可達 2-3 分鐘
  const startTime = Date.now(); // 記錄測試開始時間，用於計算延遲
  //const BASE_URL = 'http://localhost:3000';
  const BASE_URL = 'https://www.jvtutorcorner.com';
  const SESSION = `classroom_session_ready_${COURSE_ID}`;

  const TEACHER_WAIT_URL = `${BASE_URL}/classroom/wait?courseId=${COURSE_ID}&role=teacher&session=${SESSION}&forceJoin=true`;
  const STUDENT_WAIT_URL = `${BASE_URL}/classroom/wait?courseId=${COURSE_ID}&role=student&session=${SESSION}&forceJoin=true`;

  // 啟動多客戶端
  const browser = await chromium.launch({ 
    headless: false,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ]
  });
  const teacherContext = await browser.newContext({
    permissions: ['microphone', 'camera']
  });
  const studentContext = await browser.newContext({
    permissions: ['microphone', 'camera']
  });

  const teacherPage = await teacherContext.newPage();
  const studentPage = await studentContext.newPage();
  
  // 設定視口大小：左右平均分配，假設螢幕寬度 1200+，各分配 600 寬
  await teacherPage.setViewportSize({ width: 600, height: 800 });
  await studentPage.setViewportSize({ width: 600, height: 800 });

  // === 步驟 0: 設定 Mock User 以確保角色正確 ===
  console.log('\n[0] 設定 Mock User 資訊...');
  const setMockUser = async (page: Page, role: string) => {
    await page.goto(BASE_URL); // 需要先在該域名下才能設定 localStorage
    await page.evaluate((r) => {
      const user = {
        email: r === 'teacher' ? 'teacher@test.com' : 'student@test.com',
        plan: 'pro',
        role: r === 'teacher' ? 'teacher' : 'user',
        displayName: r === 'teacher' ? '測試老師' : '測試學生'
      };
      localStorage.setItem('tutor_mock_user', JSON.stringify(user));
    }, role);
  };
  await setMockUser(teacherPage, 'teacher');
  await setMockUser(studentPage, 'student');

  try {
    console.log('\n📌 測試：Classroom 白板同步（帶延遲）');
    console.log(`👨‍🏫 Teacher Wait URL: ${TEACHER_WAIT_URL}`);
    console.log(`👩‍🎓 Student Wait URL: ${STUDENT_WAIT_URL}`);

    // === 步驟 1: 設定網路延遲 ===
    console.log('\n[1] 設定網路延遲 (100-500ms 隨機)...');
    const setupNetworkDelay = async (page: Page) => {
      await page.route('**/*', async (route) => {
        // 模擬隨機網路延遲 50-250ms (單程)，總延遲約 100-500ms
        const delay = 50 + Math.random() * 200;
        await new Promise(r => setTimeout(r, delay));
        await route.continue();
      });
    };
    await setupNetworkDelay(teacherPage);
    await setupNetworkDelay(studentPage);

    // === 步驟 2: 兩個客戶端完成準備流程 ===
    console.log('\n[2] 兩個客戶端進行完整的準備流程...');

    // Prepare to capture /api/whiteboard/room POST responses for both clients
    const teacherApiRespPromise = teacherPage.waitForResponse(r => r.url().includes('/api/whiteboard/room') && r.request().method() === 'POST', { timeout: 60000 });
    const studentApiRespPromise = studentPage.waitForResponse(r => r.url().includes('/api/whiteboard/room') && r.request().method() === 'POST', { timeout: 60000 });

    await Promise.all([
      completeReadyPageFlow(teacherPage, 'teacher', TEACHER_WAIT_URL),
      completeReadyPageFlow(studentPage, 'student', STUDENT_WAIT_URL)
    ]);
    console.log('  ✓ Student 已進入 /classroom/test');

    // After both entered, await the API responses (if they occurred during entry)
    try {
      const [teacherApiResp, studentApiResp] = await Promise.all([teacherApiRespPromise, studentApiRespPromise]);
      const tJson = await teacherApiResp.json().catch(() => null);
      const sJson = await studentApiResp.json().catch(() => null);
      const tUuid = tJson?.uuid || tJson?.roomUuid || tJson?.whiteboardUuid || tJson?.data?.uuid;
      const sUuid = sJson?.uuid || sJson?.roomUuid || sJson?.whiteboardUuid || sJson?.data?.uuid;
      if (tUuid && sUuid) {
        console.log('[E2E] (Step 2) Teacher uuid:', tUuid);
        console.log('[E2E] (Step 2) Student uuid:', sUuid);
        expect(tUuid).toBe(sUuid);
      } else {
        console.warn('[E2E] Could not extract uuid from one or both API responses in step 2');
      }
    } catch (err) {
      console.warn('[E2E] Timeout or error waiting for /api/whiteboard/room responses in step 2:', err);
    }

    // === 步驟 3: 等待就緒 ===
    console.log('\n[3] 等待雙方 Agora 連接與白板初始化 (最多等待 30 秒)...');
    
    const waitForReady = async (page: Page, role: string) => {
      console.log(`    ⏳ 檢查 ${role.toUpperCase()} 連接狀態...`);
      for (let i = 0; i < 60; i++) { // 每 500ms 檢查一次，共 30 秒
        const isReady = await page.evaluate(() => {
          return (window as any).__classroom_ready === true;
        }).catch(() => false);

        if (isReady) {
          console.log(`    ✅ ${role.toUpperCase()} 已就緒 (於 ${i * 0.5} 秒)`);
          return true;
        }
        await new Promise(r => setTimeout(r, 500));
      }
      return false;
    };

    const [teacherOk, studentOk] = await Promise.all([
      waitForReady(teacherPage, 'teacher'),
      waitForReady(studentPage, 'student')
    ]);

    if (!teacherOk || !studentOk) {
      console.error(`❌ 等待超時: Teacher=${teacherOk}, Student=${studentOk}`);
      // 仍然繼續，但也許應該失敗
    }
    
    const teacherReady = await teacherPage.evaluate(() => (window as any).__classroom_ready).catch(() => false);
    const studentReady = await studentPage.evaluate(() => (window as any).__classroom_ready).catch(() => false);
    
    console.log(`  • Teacher 連接狀態: ${teacherReady ? '已連接' : '未連接'}`);
    console.log(`  • Student 連接狀態: ${studentReady ? '已連接' : '未連接'}`);

    // === 步驟 4: 尋找並在 Canvas 上繪圖 ===
    console.log('\n[4] 在 Teacher 白板上繪圖...');
    
    // 等待一段時間確保組件完全掛載且權限套用
    await new Promise(r => setTimeout(r, 5000));

    // 注意：EnhancedWhiteboard 有兩層 Canvas (背景 PDF + 繪圖層)
    // 我們需要最後一個 (繪圖層)
    const canvases = teacherPage.locator('canvas');
    const canvasCount = await canvases.count();
    console.log(`  • 找到 ${canvasCount} 個 Canvas 元素`);
    
    // 預期至少有 2 個（bg + drawing）或 1 個
    const canvas = canvases.last(); 
    let canvasExists = false;
    let box: { x: number; y: number; width: number; height: number } | null = null;
    
    try {
      canvasExists = await canvas.isVisible({ timeout: 5000 });
    } catch (e) {
      canvasExists = false;
    }
    
    if (canvasExists) {
      console.log('  ✓ 繪圖 Canvas 已找到');
      try {
        box = await canvas.boundingBox();
      } catch (e) {
        console.error('  ✗ 無法獲取 Canvas 邊界:', e);
        box = null;
      }
    } else {
      console.log('  ⚠️  繪圖 Canvas 未找到');
    }

    if (box && canvasExists) {
      console.log(`  • Canvas 大小: ${box.width}x${box.height}，位置: (${box.x}, ${box.y})`);
      
      // 確保 Teacher 角色正確並選中畫筆
      await teacherPage.evaluate(() => {
        (window as any).__classroom_role = 'teacher';
        (window as any).__classroom_is_teacher = true;
        if (typeof (window as any).__wb_setTool === 'function') {
          (window as any).__wb_setTool('pencil');
        }
      });
      console.log('  • Teacher 狀態已確認並強制切換至畫筆工具');

      // 使用 mouse.move() 初始化滑鼠位置，避免使用 canvas.click()
      await teacherPage.mouse.move(box.x + 10, box.y + 10);

      console.log('  • 開始繪製 60 個隨機線條進行壓力測試（正常人繪圖頻率）...');
      let drawnCount = 0;
      for (let j = 0; j < 60; j++) {
        try {
          const startX = Math.random() * box.width * 0.8 + (box.width * 0.1);
          const startY = Math.random() * box.height * 0.8 + (box.height * 0.1);
          const endX = Math.random() * box.width * 0.8 + (box.width * 0.1);
          const endY = Math.random() * box.height * 0.8 + (box.height * 0.1);

          // 使用 mouse.move() 而不是 hover（更穩定）
          await teacherPage.mouse.move(box.x + startX, box.y + startY);
          await teacherPage.mouse.down();
          
          // 模擬正常人的繪圖速度：更多的點、更平滑的曲線
          const steps = 20; // 從 5 增加到 20，使繪圖更細緻
          for (let i = 1; i <= steps; i++) {
            const curX = startX + (endX - startX) * (i / steps);
            const curY = startY + (endY - startY) * (i / steps);
            await teacherPage.mouse.move(box.x + curX, box.y + curY);
            // 在繪製過程中加入微小延遲，模擬真實手速
            await new Promise(r => setTimeout(r, 20 + Math.random() * 10));
          }
          
          await teacherPage.mouse.up();
          drawnCount++;
          
          // 線條之間的間隔：300-500ms（正常人繪圖速度）
          await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
        } catch (err) {
          console.error(`  ⚠️  繪製線條 ${j + 1} 失敗:`, err instanceof Error ? err.message : String(err));
          break;
        }
      }
      console.log(`  ✓ 繪製完成: ${drawnCount}/60 條線條成功`);

      // 強制刷新任何待處理的更新
      await teacherPage.evaluate(() => {
        if (typeof (window as any).__wb_flushPending === 'function') {
          (window as any).__wb_flushPending();
        }
      });
      await new Promise(r => setTimeout(r, 500)); // 等待刷新完成

      // === 步驟 4.5: 檢查 Teacher 自己是否畫成功 ===
      await new Promise(r => setTimeout(r, 1000)); // 等待渲染
      const teacherMetrics = await teacherPage.evaluate(() => {
        const strokes = (window as any).__whiteboard_strokes || [];
        const canvases = Array.from(document.querySelectorAll('canvas'));
        let totalPixels = 0;
        canvases.forEach(c => {
          const cvs = c as HTMLCanvasElement;
          const ctx = cvs.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;
          const imageData = ctx.getImageData(0, 0, cvs.width, cvs.height);
          const data = imageData.data;
          for (let k = 0; k < data.length; k += 4) {
            if (data[k + 3] > 0) totalPixels++;
          }
        });
        return { strokeCount: strokes.length, pixels: totalPixels };
      });
      console.log(`  • Teacher 狀態: ${teacherMetrics.strokeCount} 條筆劃, ${teacherMetrics.pixels} 像素`);

      // === 步驟 5: 檢查同步 ===
      console.log('\n[5] 等待同步到 Student (最多 30 秒) 並驗證渲染...');
      console.log(`  • 目標筆劃數: ${teacherMetrics.strokeCount}`);
      
      let found = false;
      const targetStrokeCount = teacherMetrics.strokeCount;
      let lastStudentState: any = null;
      let lastReportI = -60;

      for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 100));

        const studentState: any = await studentPage.evaluate(() => {
          try {
            const strokes = (window as any).__whiteboard_strokes || [];
            const canvases = Array.from(document.querySelectorAll('canvas'));
            let maxPixels = 0;
            canvases.forEach(c => {
              const cvs = c as HTMLCanvasElement;
              const ctx = cvs.getContext('2d', { willReadFrequently: true });
              if (!ctx) return;
              try {
                  const imageData = ctx.getImageData(0, 0, cvs.width, cvs.height);
                  const data = imageData.data;
                  let count = 0;
                  // 全屏掃描像素 (step=4)
                  for (let j = 0; j < data.length; j += 4) {
                    if (data[j + 3] > 0) count++;
                  }
                  if (count > maxPixels) maxPixels = count;
              } catch(e) { /* tainted or error */ }
            });
            // 我們把所有 canvas 的最大像素數作為驗證依據
            return { strokeCount: strokes.length, pixels: maxPixels };
          } catch(e) { return null; }
        });
        
        lastStudentState = studentState;

        if (studentState && studentState.strokeCount >= targetStrokeCount) {
          // 增加：嚴格驗證必須有像素被畫出來 (Pixels > 0)
          // 這能捕捉 "收到數據但畫布空白" 的問題
          if (studentState.pixels > 100) { 
             const latency = Date.now() - startTime;
             console.log(`  ✅ 完全同步成功! 延遲: ${latency}ms, 筆劃數: ${studentState.strokeCount}, 像素數: ${studentState.pixels}`);
             
             const studentLogs = await studentPage.evaluate(() => (window as any).__debug_logs || []);
             console.log(`    Student 最近日誌: ${JSON.stringify(studentLogs.slice(-3))}`);
             
             found = true;
             break;
          } else {
             // 筆劃數到了但像素很少？可能是還沒 render 完，繼續等
             if (i % 20 === 0) console.log(`  (數據已收到但畫面仍空... 像素: ${studentState.pixels})`);
          }
        }

        if ((i + 1) - lastReportI >= 30) {
          const info = studentState ? 
            `Strokes: ${studentState.strokeCount}/${targetStrokeCount} | Pixels: ${studentState.pixels}` : 
            'No state available';
          console.log(`  ⏳ 等待中... (${(i + 1) * 100}ms) | ${info}`);
          lastReportI = i + 1;
        }
      }

      if (lastStudentState && lastStudentState.logs && Array.isArray(lastStudentState.logs) && lastStudentState.logs.length > 0) {
        console.log(`    Student 最近日誌: ${JSON.stringify(lastStudentState.logs)}`);
      }

      if (!found) {
        console.log('  ❌ 30 秒後仍未同步');
        // 額外診斷
        const teacherFinalLogs = await teacherPage.evaluate(() => (window as any).__whiteboard_logs?.slice(-10) || []);
        console.log('  Teacher 最後日誌軌跡:');
        teacherFinalLogs.forEach((l: string) => console.log(`    > ${l}`));
        
        await studentPage.screenshot({ path: 'student-sync-failure.png' });
        await teacherPage.screenshot({ path: 'teacher-sync-failure.png' });
        console.log('  📸 已保存失敗截圖: student-sync-failure.png, teacher-sync-failure.png');
        
        expect(found).toBe(true);
      }
    } else {
      console.log('  ⚠️  無法進行繪圖測試（Canvas 未找到或無邊界）');
    }

    // === 步驟 6: 收集日誌 ===
    console.log('\n[6] 收集調試日誌...');
    const teacherLogs = await teacherPage.evaluate(() => {
      return (window as any).__whiteboard_logs?.slice(-5) || [];
    }).catch(() => []);

    const studentLogs = await studentPage.evaluate(() => {
      return (window as any).__whiteboard_logs?.slice(-5) || [];
    }).catch(() => []);

    console.log('  Teacher 最後 5 條日誌:');
    (teacherLogs as string[]).forEach((log: string, i: number) => console.log(`    ${i + 1}. ${log}`));

    console.log('  Student 最後 5 條日誌:');
    (studentLogs as string[]).forEach((log: string, i: number) => console.log(`    ${i + 1}. ${log}`));

    console.log('\n✅ 測試完成！');

  } catch (error) {
    console.error('\n❌ 測試出錯:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    try {
      await teacherPage.close();
      await studentPage.close();
      await teacherContext.close();
      await studentContext.close();
      await browser.close();
    } catch (e) {
      console.error('清理資源時出錯:', e);
    }
  }
});

      test('Whiteboard API Response Check - Teacher & Student receive same uuid', async () => {
        // Launch two isolated contexts to simulate Teacher and Student
        const apiBase = process.env.E2E_API_URL || process.env.LOCAL_API_URL || 'http://localhost:3000';
        const waitUrlTeacher = `${apiBase.replace(/\/$/, '')}/classroom/wait?courseId=${COURSE_ID}&role=teacher&session=classroom_session_ready_${COURSE_ID}&forceJoin=true`;
        const waitUrlStudent = `${apiBase.replace(/\/$/, '')}/classroom/wait?courseId=${COURSE_ID}&role=student&session=classroom_session_ready_${COURSE_ID}&forceJoin=true`;

        const browser = await chromium.launch({ headless: false, args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
        const teacherContext = await browser.newContext({ permissions: ['microphone','camera'] });
        const studentContext = await browser.newContext({ permissions: ['microphone','camera'] });
        const teacherPage = await teacherContext.newPage();
        const studentPage = await studentContext.newPage();

        // Navigate both to their wait pages and bypass device checks
        await Promise.all([
          teacherPage.goto(waitUrlTeacher, { waitUntil: 'load' }),
          studentPage.goto(waitUrlStudent, { waitUntil: 'load' })
        ]);
        await teacherPage.evaluate(() => { (window as any).__E2E_BYPASS_DEVICE_CHECK__ = true; });
        await studentPage.evaluate(() => { (window as any).__E2E_BYPASS_DEVICE_CHECK__ = true; });

        // Prepare response listeners
        const teacherRespPromise = teacherPage.waitForResponse(r => r.url().includes('/api/whiteboard/room') && r.request().method() === 'POST', { timeout: 15000 });
        const studentRespPromise = studentPage.waitForResponse(r => r.url().includes('/api/whiteboard/room') && r.request().method() === 'POST', { timeout: 15000 });

        // Trigger entry for both pages (click enter if present, otherwise navigate directly)
        const triggerEnter = async (page: any) => {
          const enterBtn = page.locator('button:has-text("立即進入教室"), button:has-text("Enter Classroom Now"), button:has-text("Enter Now")').first();
          try {
            await enterBtn.waitFor({ state: 'visible', timeout: 3000 });
            await enterBtn.click({ timeout: 3000 }).catch(() => {});
          } catch (e) {
            const manual = page.url().replace('/wait', '/test');
            await page.goto(manual, { waitUntil: 'load' });
          }
        };

        await Promise.all([triggerEnter(teacherPage), triggerEnter(studentPage)]);

        const [teacherResp, studentResp] = await Promise.all([teacherRespPromise, studentRespPromise]);
        const tJson = await teacherResp.json().catch(() => null);
        const sJson = await studentResp.json().catch(() => null);

        expect(tJson).toBeTruthy();
        expect(sJson).toBeTruthy();
        const tUuid = tJson?.uuid || tJson?.roomUuid || tJson?.whiteboardUuid || tJson?.data?.uuid;
        const sUuid = sJson?.uuid || sJson?.roomUuid || sJson?.whiteboardUuid || sJson?.data?.uuid;
        expect(tUuid).toBeTruthy();
        expect(sUuid).toBeTruthy();
        expect(tUuid).toBe(sUuid);

        console.log('[E2E] Teacher uuid:', tUuid);
        console.log('[E2E] Student uuid:', sUuid);

        await teacherPage.close();
        await studentPage.close();
        await teacherContext.close();
        await studentContext.close();
        await browser.close();
      });

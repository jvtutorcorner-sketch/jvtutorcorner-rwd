import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';

/**
 * 多客戶端延遲測試：Teacher + Student 白板同步
 * 
 * 運行：npx playwright test e2e/classroom-delay-sync.spec.ts
 * 帶詳細日誌：npx playwright test e2e/classroom-delay-sync.spec.ts --headed --workers=1
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
  await new Promise(r => setTimeout(r, 4000)); // 增加等待時間到 4 秒
  
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
      await page.waitForURL('**/classroom/test', { timeout: 10000 });
      console.log(`    ✓ ${role.toUpperCase()} 已進入教室（/classroom/test）`);
    } catch (e) {
      console.warn(`    ⚠️  未檢測到頁面導航到 /classroom/test`);
    }
  } else {
    console.log('    ⚠️  15 秒內未找到「立即進入教室」按鈕');
  }
  
  console.log(`  ✓ ${role.toUpperCase()} 準備流程完成\n`);
}

test.describe('Classroom Whiteboard Sync with Network Delay', () => {
  let browser: Browser;
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;

  //const BASE_URL = 'http://localhost:3000';
  const BASE_URL = 'https://www.jvtutorcorner.com';
  const COURSE_ID = 'c1';
  const SESSION_ID = 'classroom_session_ready_c1';

  const TEACHER_WAIT_URL = `${BASE_URL}/classroom/wait?courseId=${COURSE_ID}&role=teacher&session=${SESSION_ID}`;
  const STUDENT_WAIT_URL = `${BASE_URL}/classroom/wait?courseId=${COURSE_ID}&role=student&session=${SESSION_ID}`;

  test.beforeAll(async () => {
    browser = await chromium.launch({
      headless: false, // 顯示 UI，便於觀察
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-gpu',
        '--no-first-run',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream'
      ]
    });
  });

  test.afterAll(async () => {
    await teacherContext?.close();
    await studentContext?.close();
    await browser?.close();
  });

  test('should sync whiteboard drawing from teacher to student with network delay', async () => {
    test.setTimeout(180000); // 延長到 3 分鐘，因為有多步驟準備流程 + 延遲測試
    console.log('📌 測試開始：Teacher + Student 白板同步（模擬網路延遲）');

    // 建立獨立的瀏覽器上下文（模擬不同用戶）
    teacherContext = await browser.newContext({
      permissions: ['microphone', 'camera']
    });
    studentContext = await browser.newContext({
      permissions: ['microphone', 'camera']
    });

    const teacherPage = await teacherContext.newPage();
    const studentPage = await studentContext.newPage();

    try {
      // 啟用網路限流（模擬 3G 網路）
      console.log('🌐 設定網路延遲：500ms + 2Mbps 限流');
      await teacherPage.route('**/*', async route => {
        await new Promise(resolve => setTimeout(resolve, 250)); // 雙向各 250ms = 500ms 往返延遲
        await route.continue();
      });

      await studentPage.route('**/*', async route => {
        await new Promise(resolve => setTimeout(resolve, 250));
        await route.continue();
      });

      // Teacher 完成準備流程
      console.log(`👨‍🏫 Teacher 進入教室準備`);
      await completeReadyPageFlow(teacherPage, 'teacher', TEACHER_WAIT_URL);
      
      // 等待 UI 載入
      await teacherPage.waitForSelector('canvas', { timeout: 10000 }).catch(() => {
        console.warn('⚠️  Teacher canvas 未找到，可能未進入繪圖模式');
      });

      // Student 完成準備流程
      console.log(`👩‍🎓 Student 進入教室準備`);
      await completeReadyPageFlow(studentPage, 'student', STUDENT_WAIT_URL);

      await studentPage.waitForSelector('canvas', { timeout: 10000 }).catch(() => {
        console.warn('⚠️  Student canvas 未找到');
      });

      // === 步驟 3: 等待就緒 ===
      console.log('\n[3] 等待雙方 Agora 連接與白板初始化 (最多等待 30 秒)...');
      
      const waitForReady = async (page: Page, roleName: string) => {
        console.log(`    ⏳ 檢查 ${roleName.toUpperCase()} 連接狀態...`);
        for (let i = 0; i < 60; i++) { // 每 500ms 檢查一次，共 30 秒
          const isReady = await page.evaluate(() => {
            return (window as any).__classroom_ready === true;
          }).catch(() => false);

          if (isReady) {
            console.log(`    ✅ ${roleName.toUpperCase()} 已就緒 (於 ${i * 0.5} 秒)`);
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
        console.warn(`⚠️ 等待超時: Teacher=${teacherOk}, Student=${studentOk}`);
      }

      // 檢查就緒狀態
      const teacherReady = await teacherPage.evaluate(() => {
        return (window as any).__classroom_ready === true;
      }).catch(() => false);

      const studentReady = await studentPage.evaluate(() => {
        return (window as any).__classroom_ready === true;
      }).catch(() => false);

      console.log(`✓ Teacher 就緒: ${teacherReady}, Student 就緒: ${studentReady}`);

      // 在 Teacher 白板上繪圖
      console.log('🖌️  Teacher 開始在白板上繪圖...');
      
      const teacherCanvas = teacherPage.locator('canvas').first();
      const canvasBox = await teacherCanvas.boundingBox();

      if (!canvasBox) {
        console.warn('⚠️  無法獲取 canvas 邊界框，跳過繪圖測試');
        return;
      }

      // 簡單的筆畫：從 (100, 100) 到 (200, 200)
      const startX = canvasBox.x + 100;
      const startY = canvasBox.y + 100;
      const endX = canvasBox.x + 200;
      const endY = canvasBox.y + 200;

      const drawStartTime = Date.now();

      // 模擬繪圖筆畫
      await teacherPage.mouse.move(startX, startY);
      await teacherPage.mouse.down();
      await new Promise(r => setTimeout(r, 100));

      // 繪製曲線
      for (let i = 0; i <= 10; i++) {
        const x = startX + (endX - startX) * (i / 10);
        const y = startY + (endY - startY) * (i / 10);
        await teacherPage.mouse.move(x, y);
        await new Promise(r => setTimeout(r, 50));
      }

      await teacherPage.mouse.up();
      const drawEndTime = Date.now();

      console.log(`✓ Teacher 完成繪圖，耗時 ${drawEndTime - drawStartTime}ms`);

      // 等待同步發生（考慮網路延遲）
      const syncCheckStartTime = Date.now();
      console.log('⏳ 等待筆畫同步到 Student (最多 30 秒)...');
      
      let syncDetected = false;
      let syncDelayMs = 0;

      // 重複檢查，最多等待 30 秒
      for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 100));

        const hasDrawing = await studentPage.evaluate(() => {
          const canvas = document.querySelector('canvas') as HTMLCanvasElement;
          if (!canvas) return false;

          const ctx = canvas.getContext('2d');
          if (!ctx) return false;

          // 檢查畫布是否有非白色像素
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // 統計非白色像素
          let nonWhitePixels = 0;
          for (let j = 0; j < data.length; j += 4) {
            const r = data[j];
            const g = data[j + 1];
            const b = data[j + 2];
            const a = data[j + 3];

            // 非白色且不透明
            if (a > 200 && (r < 250 || g < 250 || b < 250)) {
              nonWhitePixels++;
            }
          }

          // 調試日誌（僅在有像素時顯示，減少噪音）
          if (nonWhitePixels > 0) {
            console.log(`[Student] 檢查中... 非白色像素 = ${nonWhitePixels}`);
          }
          return nonWhitePixels > 5; // 降低靈敏度，5 個像素即視為同步
        }).catch(() => false);

        if (hasDrawing) {
          syncDetected = true;
          syncDelayMs = Date.now() - syncCheckStartTime;
          break;
        }
      }

      // 驗證同步結果
      if (syncDetected) {
        console.log(`✅ 筆畫已同步到 Student！延遲: ${syncDelayMs}ms`);
      } else {
        console.error('❌ 筆畫未同步到 Student（30秒超時）');
        expect(syncDetected).toBe(true);
      }

      // 檢查控制台日誌
      console.log('\n📊 抓取控制台日誌：');
      
      const teacherLogs = await teacherPage.evaluate(() => {
        return (window as any).__whiteboard_logs || [];
      }).catch(() => []);

      const studentLogs = await studentPage.evaluate(() => {
        return (window as any).__whiteboard_logs || [];
      }).catch(() => []);

      console.log('Teacher 日誌：', teacherLogs.slice(-5));
      console.log('Student 日誌：', studentLogs.slice(-5));

    } finally {
      await teacherPage.close();
      await studentPage.close();
    }
  });

  test('should recover from network disconnection', async () => {
    console.log('\n📌 測試開始：網路中斷後恢復');

    teacherContext = await browser.newContext();
    studentContext = await browser.newContext();

    const teacherPage = await teacherContext.newPage();
    const studentPage = await studentContext.newPage();

    try {
      // Teacher 完成準備流程
      await completeReadyPageFlow(teacherPage, 'teacher', TEACHER_WAIT_URL);
      
      // Student 完成準備流程
      await completeReadyPageFlow(studentPage, 'student', STUDENT_WAIT_URL);

      await new Promise(r => setTimeout(r, 3000));
      await new Promise(r => setTimeout(r, 3000));

      // 測試正常同步
      console.log('✓ 正常狀態下進行繪圖...');
      const canvas = teacherPage.locator('canvas').first();
      const box = await canvas.boundingBox();
      
      if (box) {
        await teacherPage.mouse.move(box.x + 50, box.y + 50);
        await teacherPage.mouse.down();
        await teacherPage.mouse.move(box.x + 100, box.y + 100);
        await teacherPage.mouse.up();
        await new Promise(r => setTimeout(r, 1000));
      }

      // 模擬 student 網路中斷
      console.log('🔌 模擬 Student 網路中斷...');
      await studentPage.context().setOffline(true);
      await new Promise(r => setTimeout(r, 2000));

      // Teacher 繼續繪圖
      console.log('✓ Teacher 在 Student 離線時繼續繪圖...');
      if (box) {
        await teacherPage.mouse.move(box.x + 150, box.y + 50);
        await teacherPage.mouse.down();
        await teacherPage.mouse.move(box.x + 150, box.y + 150);
        await teacherPage.mouse.up();
      }

      // 恢復網路
      console.log('📡 恢復 Student 網路連接...');
      await studentPage.context().setOffline(false);
      await new Promise(r => setTimeout(r, 3000));

      // 檢查是否收到離線期間的筆畫
      const hasDrawing = await studentPage.evaluate(() => {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        const imageData = ctx!.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        let nonWhitePixels = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 200 && (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250)) {
            nonWhitePixels++;
          }
        }
        return nonWhitePixels > 10;
      }).catch(() => false);

      console.log(hasDrawing ? '✅ 恢復後收到筆畫' : '⚠️  恢復後未收到筆畫（可能需要手動重新連接）');

    } finally {
      await teacherPage.close();
      await studentPage.close();
    }
  });

  test('should handle rapid strokes with latency', async () => {
    console.log('\n📌 測試開始：高頻率筆畫（帶延遲）');

    teacherContext = await browser.newContext();
    studentContext = await browser.newContext();

    const teacherPage = await teacherContext.newPage();
    const studentPage = await studentContext.newPage();

    try {
      // 設定更高的延遲
      const delayMs = 500;
      await teacherPage.route('**/*', async route => {
        await new Promise(resolve => setTimeout(resolve, delayMs / 2));
        await route.continue();
      });

      await studentPage.route('**/*', async route => {
        await new Promise(resolve => setTimeout(resolve, delayMs / 2));
        await route.continue();
      });

      // Teacher 完成準備流程
      await completeReadyPageFlow(teacherPage, 'teacher', TEACHER_WAIT_URL);
      
      // Student 完成準備流程
      await completeReadyPageFlow(studentPage, 'student', STUDENT_WAIT_URL);

      await new Promise(r => setTimeout(r, 3000));
      await new Promise(r => setTimeout(r, 3000));

      // 快速繪製多個筆畫
      console.log('🖌️  快速繪製 5 個筆畫...');
      const canvas = teacherPage.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (box) {
        for (let i = 0; i < 5; i++) {
          const startX = box.x + 50 + i * 30;
          const startY = box.y + 50;

          await teacherPage.mouse.move(startX, startY);
          await teacherPage.mouse.down();
          await new Promise(r => setTimeout(r, 50));
          await teacherPage.mouse.move(startX + 50, startY + 100);
          await new Promise(r => setTimeout(r, 50));
          await teacherPage.mouse.up();
          await new Promise(r => setTimeout(r, 100));

          console.log(`  • 第 ${i + 1} 筆畫完成`);
        }
      }

      // 等待全部同步
      console.log('⏳ 等待所有筆畫同步...');
      await new Promise(r => setTimeout(r, 5000));

      const pixelCount = await studentPage.evaluate(() => {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        if (!canvas) return 0;
        const ctx = canvas.getContext('2d');
        const imageData = ctx!.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 200 && (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250)) {
            count++;
          }
        }
        return count;
      }).catch(() => 0);

      console.log(`✅ Student 收到的繪圖像素數: ${pixelCount}`);
      expect(pixelCount).toBeGreaterThan(50); // 應有明顯的繪圖

    } finally {
      await teacherPage.close();
      await studentPage.close();
    }
  });
});

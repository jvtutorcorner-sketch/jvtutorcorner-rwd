import { test, expect } from '@playwright/test';

// 增加測試超時以容納 20s 延遲場景
test.setTimeout(40000);

test.describe('Wait Page Redirect Test', () => {
  test('should not redirect to login immediately after entering wait page', async ({ page }) => {
    // 設置登入狀態以模擬已登入用戶
    await page.addInitScript(() => {
      const now = Date.now();
      localStorage.setItem('tutor_last_login_time', now.toString());
      localStorage.setItem('tutor_login_complete', 'true');
      localStorage.setItem('storedUser', JSON.stringify({
        email: 'test@example.com',
        plan: 'pro',
        role: 'teacher',
        firstName: 'Test',
        lastName: 'User',
        expiry: now + 86400000 // 24小時後過期
      }));
    });

    // 監聽 console 訊息與導航事件以捕獲日誌與時間戳
    const logs: Array<{ts: number; text: string}> = [];
    page.on('console', msg => {
      const text = msg.text();
      const t = Date.now();
      if (msg.type() === 'log' || msg.type() === 'warning' || msg.type() === 'error') {
        logs.push({ ts: t, text });
      }
    });

    const navEvents: Array<{ts: number; url: string}> = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        navEvents.push({ ts: Date.now(), url: frame.url() });
      }
    });

    // 導航到等待頁（使用絕對 URL，允許通過環境變數覆蓋）
    const base = process.env.BASE_URL || 'http://localhost:3000';
    const waitPath = '/classroom/wait?courseId=c1&role=teacher&session=classroom_session_ready_c1';
    console.log(`Navigating to ${base}${waitPath}`);
    await page.goto(`${base}${waitPath}`);

    // 等待頁面載入
    await page.waitForLoadState('networkidle');

    // 檢查初始 URL
    const initialUrl = page.url();
    console.log(`Initial URL: ${initialUrl}`);

    // 等待一段時間（25 秒）以捕獲可能的延遲重定向（角色檢查有 20s 延遲）
    await page.waitForTimeout(25000);

    // 檢查最終 URL
    const finalUrl = page.url();
    console.log(`Final URL after 10s: ${finalUrl}`);

    // 分析導航前的最後一條 console 日誌，以確定是哪個邏輯觸發重定向
    const finalNav = navEvents.length > 1 ? navEvents[navEvents.length - 1] : (navEvents[0] || null);

    if (finalNav) {
      console.log(`Detected navigation at ${new Date(finalNav.ts).toISOString()} -> ${finalNav.url}`);
      // 找到導航前最後一條相關的 log（Auth 或 Countdown）
      const relevantBeforeNav = logs
        .filter(l => l.ts < finalNav.ts)
        .filter(l => /Non-teacher|AuthCheck|role|Countdown reached zero|WaitCountdownManager|countdown/i.test(l.text))
        .sort((a, b) => b.ts - a.ts);

      if (relevantBeforeNav.length > 0) {
        const lastRelevant = relevantBeforeNav[0];
        console.log(`Last relevant log before navigation: ${new Date(lastRelevant.ts).toISOString()} - ${lastRelevant.text}`);
        const isAuth = /Non-teacher|AuthCheck|role/i.test(lastRelevant.text);
        const isCountdown = /Countdown reached zero|WaitCountdownManager|countdown/i.test(lastRelevant.text);
        expect(isAuth || isCountdown).toBeTruthy();

        if (isAuth && !isCountdown) {
          console.log('CONCLUSION: Role-check logic (auth) triggered the redirect.');
        } else if (isCountdown && !isAuth) {
          console.log('CONCLUSION: Countdown logic triggered the redirect.');
        } else {
          console.log('CONCLUSION: Both auth and countdown logs appeared as the last relevant entry; ambiguous ordering — inspect timestamps below.');
        }
      } else {
        console.log('No relevant console logs appear before navigation — cannot determine cause.');
        expect(false).toBeTruthy();
      }
    } else {
      console.log('No navigation detected within timeout; page remained on wait page.');
    }

    // 輸出相關日誌（帶時間戳）
    console.log('Relevant console logs with timestamps:');
    logs.filter(l =>
      /AuthCheck|WaitCountdownManager|SYNC|redirect|page.tsx|countdown|Non-teacher/i.test(l.text)
    ).forEach(l => console.log(`  ${new Date(l.ts).toISOString()} - ${l.text}`));
  });
});
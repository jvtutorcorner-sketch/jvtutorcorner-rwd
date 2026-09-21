/**
 * 輪播圖素材截圖腳本（不驗證行為、不寫入任何資料）
 *
 * 目的：依首頁輪播圖的六個主題，從實際頁面擷取 1200x628（@2x = 2400x1256）畫面，
 *       輸出到專案根目錄 carousel-shots/，供後製成首頁輪播圖使用。
 *
 * 執行：
 *   先啟動 dev server（npm run dev），再跑
 *   APP_ENV=local npx playwright test e2e/carousel_screenshots.spec.ts --project=chromium
 *
 * 只做讀取與截圖：不報名、不付款、不建立課程。
 */

import fs from 'fs';
import path from 'path';
import { test, type Page } from '@playwright/test';
import { BYPASS_SECRET, TEST_STUDENT, TEST_TEACHER } from './helpers/auth-helpers';

const OUT_DIR = path.resolve(__dirname, '..', 'carousel-shots');

test.use({
  viewport: { width: 1200, height: 628 },
  deviceScaleFactor: 2,
});

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

/** 隱藏固定頁首／頁尾等干擾元素，讓畫面只留功能本身 */
async function hideChrome(page: Page) {
  await page.addStyleTag({
    content: `
      .site-header, header.site-header, .site-footer, footer { visibility: hidden !important; }
      *, *::before, *::after { animation-play-state: paused !important; transition: none !important; }
    `,
  });
}

/** 把指定區塊捲到畫面正中央後再截圖，確保輸出比例固定為 1200x628 */
async function focusSection(page: Page, selector: string, offsetY = 0) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 15000 });
  await el.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior }));
  if (offsetY) await page.evaluate((y) => window.scrollBy(0, y), offsetY);
  await page.waitForTimeout(600);
}

async function shoot(page: Page, name: string) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`📸 ${name}.png`);
}

async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2500); // 等字型、圖片與推薦 API 回來
}

async function loginAs(page: Page, who: 'student' | 'teacher') {
  const account = who === 'student' ? TEST_STUDENT : TEST_TEACHER;
  test.skip(!BYPASS_SECRET || !account.password, '需要 .env.local 的 LOGIN_BYPASS_SECRET 與測試帳號密碼');

  // 前端以 localStorage 判斷登入狀態（lib/mockAuth.ts），因此必須走 UI 登入，
  // 只帶 session cookie 的 API 登入不會讓畫面呈現已登入樣貌。
  await page.goto('/login');
  await page.locator('img[alt="captcha"]').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('input[type="email"]:visible').first().fill(account.email);
  await page.locator('input[type="password"]:visible').first().fill(account.password);
  await page.locator('#captcha').fill(BYPASS_SECRET); // 測試環境以 bypass secret 取代驗證碼
  await page.locator('button[type="submit"]:visible').first().click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });
  await page.waitForTimeout(1500);
}

// ── 主題 1：線上互動教室（白板 + PDF 教材）────────────────────────────────
test('shot 01 - 線上互動教室（白板 + PDF）', async ({ page }) => {
  await page.goto('/whiteboard-demo?channel=carousel-shot&role=teacher');
  await page.waitForTimeout(6000); // 等 canvas 初始化與範例 PDF 載入
  await hideChrome(page);
  await shoot(page, '01-classroom-whiteboard');
});

// ── 主題 2：點數暫存保障（老師收益看板）──────────────────────────────────
test('shot 02 - 點數暫存保障', async ({ page }) => {
  await loginAs(page, 'teacher');
  await page.goto('/teacher-escrow');
  await settle(page);
  // 等非同步的暫存記錄載入完成，避免拍到「加載中...」
  await page.getByText('加載中').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await hideChrome(page);
  await shoot(page, '02-points-escrow');
});

// ── 主題 3：一站式流程（首頁 Hero 與三步驟）────────────────────────────────
test('shot 03 - 首頁 Hero 與一站式流程', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  await shoot(page, '03a-homepage-hero');

  await hideChrome(page);
  await focusSection(page, '.how-it-works-grid', -60);
  await shoot(page, '03b-how-it-works');
});

// ── 主題 4：嚴選師資與課程 ────────────────────────────────────────────────
test('shot 04 - 師資與課程列表', async ({ page }) => {
  await page.goto('/teachers?subject=%E8%8B%B1%E6%96%87'); // 英文：避開壓測帳號
  await settle(page);
  await hideChrome(page);
  await focusSection(page, '.card.card-link', -40);
  await shoot(page, '04a-teachers');

  // /courses 列表在正式資料庫中多為 stress-group 壓測課程，不適合當素材；
  // 改從首頁推薦卡片點進真實課程詳情頁取材。
  await page.goto('/');
  await settle(page);
  const firstCourse = page.locator('#tour-recommendation .card-grid a, #tour-recommendation .card-grid > *').first();
  await firstCourse.waitFor({ state: 'visible', timeout: 20000 });
  await firstCourse.click();
  await page.waitForURL(/\/courses\//, { timeout: 20000 });
  await settle(page);
  await hideChrome(page);
  await shoot(page, '04b-course-detail');
});

// ── 主題 5：個人化推薦（登入學生帳號後的推薦區）────────────────────────────
test('shot 05 - 個人化課程推薦', async ({ page }) => {
  await loginAs(page, 'student');
  await page.goto('/');
  await settle(page);
  await hideChrome(page);
  await focusSection(page, '#tour-recommendation');
  await shoot(page, '05a-recommendations');

  await page.goto('/student_courses');
  await settle(page);
  await hideChrome(page);
  await shoot(page, '05b-student-courses');
});

// ── 主題 6：方案與點數雙軌 ────────────────────────────────────────────────
test('shot 06 - 方案與點數', async ({ page }) => {
  await page.goto('/pricing');
  await settle(page);
  await hideChrome(page);
  await focusSection(page, '.card-grid', -40);
  await shoot(page, '06-pricing');
});

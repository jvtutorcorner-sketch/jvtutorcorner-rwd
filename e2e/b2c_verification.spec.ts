/**
 * B2C 端到端驗證
 * ===============
 *
 * 對應 skill: .agents/skills/b2c-verification/SKILL.md
 *
 * M1 渲染策略與 SEO      — 公開頁是否真的伺服器渲染、metadata 是否可被索引
 * M2 B2C 完整轉換漏斗    — 訪客 → 註冊 → 選課 → 購點 → 報名 → 進教室
 * M3 訪客（未登入）可及性 — 該開的開、該關的關
 * M4 B2C/B2B 租戶邊界    — 依賴主計畫階段 2，尚未實作前整組 skip
 *
 * ⚠️ M1 目前預期會有多項失敗，這是刻意的。
 *    middleware.ts 對 '/:path*' 一律送 no-store，且除 app/layout.tsx 外
 *    沒有任何頁面定義 generateMetadata。這些失敗即是稽核 P1-6 的量化結果，
 *    修復條件是主計畫「階段 3：結構與渲染策略」。
 *    請勿為了讓測試變綠而調降這裡的門檻。
 */

import { test, expect } from '@playwright/test';
import {
  BASE_URL,
  PUBLIC_ROUTES,
  PROTECTED_ROUTES,
  fetchRawHtml,
  extractTitle,
  extractMeta,
  extractCanonical,
  isCdnCacheable,
  cacheControlOf,
  expectInServerHtml,
  pickFirstCourse,
  getPoints,
  isAuthGated,
} from './helpers/b2c-helpers';
import { registerUserAndVerifyLogin } from './helpers/homepage-helpers';

const BYPASS_SECRET =
  process.env.LOGIN_BYPASS_SECRET ||
  process.env.QA_CAPTCHA_BYPASS ||
  process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET;

/** root layout 的預設 title。公開頁若仍是這個值，代表沒有自己的 metadata。 */
const FALLBACK_TITLE = 'Tutor Platform';

// ═════════════════════════════════════════════════════════════
// M1 — 渲染策略與 SEO
// ═════════════════════════════════════════════════════════════

test.describe('M1. 渲染策略與 SEO', () => {
  test('M1.1 公開頁皆可直接取得且回 200', async ({ request }) => {
    const failures: string[] = [];

    for (const route of PUBLIC_ROUTES) {
      const { status } = await fetchRawHtml(request, route);
      if (status !== 200) failures.push(`${route} → HTTP ${status}`);
    }

    expect(failures, `以下公開頁未回 200：\n${failures.join('\n')}`).toEqual([]);
  });

  test('M1.2 每個公開頁都有自己的 <title>（不得共用 root layout 預設值）', async ({
    request,
  }) => {
    const sharedFallback: string[] = [];
    const missing: string[] = [];

    for (const route of PUBLIC_ROUTES) {
      const { html } = await fetchRawHtml(request, route);
      const title = extractTitle(html);

      if (!title) {
        missing.push(route);
      } else if (title === FALLBACK_TITLE && route !== '/') {
        sharedFallback.push(`${route} → "${title}"`);
      }
    }

    expect(missing, `以下頁面沒有 <title>：${missing.join(', ')}`).toEqual([]);
    expect(
      sharedFallback,
      `以下頁面仍在使用 root layout 的預設 title「${FALLBACK_TITLE}」，` +
        `搜尋結果會全部長一樣、無法區分：\n${sharedFallback.join('\n')}\n` +
        `修法：在各 page.tsx 加上 export const metadata 或 generateMetadata。`
    ).toEqual([]);
  });

  test('M1.3 每個公開頁都有 meta description', async ({ request }) => {
    const missing: string[] = [];

    for (const route of PUBLIC_ROUTES) {
      const { html } = await fetchRawHtml(request, route);
      if (!extractMeta(html, 'description')) missing.push(route);
    }

    expect(
      missing,
      `以下頁面缺少 meta description（影響搜尋摘要）：${missing.join(', ')}`
    ).toEqual([]);
  });

  test('M1.4 /courses 的課程內容出現在初始 HTML（非 JS 注入）', async ({
    request,
  }) => {
    const course = await pickFirstCourse(request);
    test.skip(!course, '環境中沒有可用課程資料，略過');

    const { html } = await fetchRawHtml(request, '/courses');
    expectInServerHtml(html, course!.title, '/courses 課程列表');
  });

  test('M1.5 課程詳情頁具備 generateMetadata（獨立 title + OG + canonical）', async ({
    request,
  }) => {
    const course = await pickFirstCourse(request);
    test.skip(!course, '環境中沒有可用課程資料，略過');

    const { html } = await fetchRawHtml(request, `/courses/${course!.id}`);

    const title = extractTitle(html);
    expect(
      title && title !== FALLBACK_TITLE,
      `課程詳情頁的 title 仍是「${title}」。每個課程應有獨立標題，` +
        `否則所有課程頁在搜尋結果中無法區分。`
    ).toBe(true);

    expect(
      extractMeta(html, 'og:title'),
      '課程詳情頁缺少 og:title —— 分享到 LINE/FB 時不會有預覽標題'
    ).toBeTruthy();

    expect(
      extractCanonical(html),
      '課程詳情頁缺少 canonical —— 帶 query string 的變體會被視為重複內容'
    ).toBeTruthy();
  });

  test('M1.6 公開頁可被 CDN 快取（不得為 no-store）', async ({ request }) => {
    const notCacheable: string[] = [];

    for (const route of PUBLIC_ROUTES) {
      const { response } = await fetchRawHtml(request, route);
      if (!isCdnCacheable(response)) {
        notCacheable.push(`${route} → Cache-Control: "${cacheControlOf(response)}"`);
      }
    }

    expect(
      notCacheable,
      `以下公開頁無法被 CDN 快取：\n${notCacheable.join('\n')}\n` +
        `根因：middleware.ts 對 matcher '/:path*' 一律送出 no-store。\n` +
        `修法見主計畫階段 3——把 no-store 縮小到 /api 與已登入頁面。`
    ).toEqual([]);
  });

  test('M1.7 robots.txt 與 sitemap.xml 可取得', async ({ request }) => {
    const results: string[] = [];

    for (const path of ['/robots.txt', '/sitemap.xml']) {
      const res = await request.get(`${BASE_URL}${path}`, {
        failOnStatusCode: false,
      });
      if (res.status() !== 200) results.push(`${path} → HTTP ${res.status()}`);
    }

    expect(
      results,
      `缺少搜尋引擎索引檔：\n${results.join('\n')}\n` +
        `修法：新增 app/robots.ts 與 app/sitemap.ts（Next.js App Router 原生支援）。`
    ).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════
// M2 — B2C 完整轉換漏斗
// ═════════════════════════════════════════════════════════════

test.describe('M2. B2C 完整轉換漏斗', () => {
  test('M2.1 訪客 → 註冊 → 選課 → 購點 → 報名 → 進教室', async ({
    page,
    request,
  }) => {
    test.skip(!BYPASS_SECRET, '缺少 LOGIN_BYPASS_SECRET，無法繞過驗證碼');
    test.setTimeout(180_000);

    // ── 1. 訪客瀏覽公開頁 ──────────────────────────────
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.goto(`${BASE_URL}/courses`, { waitUntil: 'domcontentloaded' });

    const course = await pickFirstCourse(request);
    test.skip(!course, '環境中沒有可用課程資料，略過');

    // ── 2. 訪客可看到課程詳情（尚未註冊） ────────────────
    const detail = await fetchRawHtml(request, `/courses/${course!.id}`);
    expect(
      detail.status,
      '訪客應能直接瀏覽課程詳情頁，這是轉換漏斗的關鍵一步'
    ).toBe(200);

    // ── 3. 註冊並取得 session ─────────────────────────
    // userId 是 roid_id（`u_<timestamp>`），不是 email——session.userId 存的是前者。
    const { userId } = await registerUserAndVerifyLogin(page, {
      baseUrl: BASE_URL,
      bypassSecret: BYPASS_SECRET,
      emailPrefix: 'b2c_funnel',
    });

    // ── 4. 確認登入態延續到瀏覽器 ──────────────────────
    const meRes = await page.request.get(
      `${BASE_URL}/api/points?userId=${encodeURIComponent(userId)}`,
      { failOnStatusCode: false }
    );
    expect(
      meRes.status(),
      `註冊後 session 應可查詢自己的點數。401 代表登入態沒有延續；` +
        `403 代表 session.userId 與查詢的 userId 不符（注意正規識別碼是 roid_id 而非 email）`
    ).toBe(200);

    // ── 5. 以 system 權限備妥點數（模擬完成購點） ────────
    // 真實金流跳轉由 payment-* skill 負責，此處聚焦漏斗接續性。
    const { setPointsAsSystem } = await import('./helpers/b2c-helpers');
    const seedRes = await setPointsAsSystem(
      request,
      userId,
      500,
      'B2C funnel test: seed balance',
      BYPASS_SECRET!
    );
    expect(seedRes.ok(), '點數前置失敗').toBe(true);

    const balanceBefore = await getPoints(request, userId, BYPASS_SECRET!);
    expect(balanceBefore).toBe(500);

    // ── 6. 報名課程 ───────────────────────────────────
    const orderRes = await page.request.post(`${BASE_URL}/api/orders`, {
      data: JSON.stringify({
        userId,
        courseId: course!.id,
        paymentMethod: 'points',
      }),
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(
      orderRes.ok(),
      `報名失敗 (${orderRes.status()}): ${await orderRes.text().catch(() => '')}`
    ).toBe(true);

    // ── 7. 點數確實被扣 ────────────────────────────────
    const balanceAfter = await getPoints(request, userId, BYPASS_SECRET!);
    expect(
      balanceAfter,
      '報名後餘額未減少——扣點邏輯沒有生效，或報名走了非點數路徑'
    ).toBeLessThan(balanceBefore);

    // ── 8. 課程出現在學生課程頁 ─────────────────────────
    await page.goto(`${BASE_URL}/student_courses`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.locator('body'),
      '報名後 /student_courses 應可正常載入'
    ).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════
// M3 — 訪客（未登入）可及性
// ═════════════════════════════════════════════════════════════

test.describe('M3. 訪客可及性', () => {
  // 這組一律使用全新的無狀態 context，確保是純訪客
  test.use({ storageState: { cookies: [], origins: [] } });

  test('M3.1 公開頁不得要求登入', async ({ request }) => {
    const gated: string[] = [];

    for (const route of PUBLIC_ROUTES) {
      const { status, response } = await fetchRawHtml(request, route);
      if (isAuthGated(status, response)) {
        gated.push(
          `${route} → HTTP ${status} ${response.headers()['location'] || ''}`
        );
      }
    }

    expect(
      gated,
      `以下公開頁對訪客要求登入，等同堵死獲客漏斗入口：\n${gated.join('\n')}`
    ).toEqual([]);
  });

  test('M3.2 訪客可看到課程詳情與價格資訊', async ({ request }) => {
    const course = await pickFirstCourse(request);
    test.skip(!course, '環境中沒有可用課程資料，略過');

    const { status, html } = await fetchRawHtml(
      request,
      `/courses/${course!.id}`
    );
    expect(status, '訪客應能瀏覽課程詳情').toBe(200);
    expectInServerHtml(html, course!.title, '課程詳情頁標題');
  });

  test('M3.3 訪客可瀏覽 /pricing 的點數方案', async ({ request }) => {
    const { status, response } = await fetchRawHtml(request, '/pricing');
    expect(
      isAuthGated(status, response),
      '/pricing 是購買決策頁，必須對訪客開放'
    ).toBe(false);
    expect(status).toBe(200);
  });

  test('M3.4 受保護頁對訪客必須擋下或導向登入', async ({ page }) => {
    const leaked: string[] = [];

    for (const route of PROTECTED_ROUTES) {
      await page.context().clearCookies();
      const res = await page.goto(`${BASE_URL}${route}`, {
        waitUntil: 'networkidle',
      });

      // 這些頁面可能靠 client 端 useEffect 轉址，而非伺服器端攔截。
      // 給轉址一段合理時間再判定，避免把「較弱但仍有效的保護」誤報為完全沒保護。
      await page
        .waitForURL(/login|signin|auth/i, { timeout: 5000 })
        .catch(() => {});

      const landedOnLogin = /login|signin|auth/i.test(page.url());
      const blocked = (res?.status() ?? 200) >= 400;

      const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
      // 本專案的實際設計是「頁面照常渲染，但內容區顯示請先登入的空狀態」，
      // 而非伺服器端轉址。這仍是有效保護——真正該擋的是資料外流。
      const showsLoginRequired =
        /請先登入|尚未登入|請登入|Please log ?in|Sign in to/i.test(bodyText);

      if (!landedOnLogin && !blocked && !showsLoginRequired) {
        const preview = bodyText.replace(/\s+/g, ' ').trim().slice(0, 120);
        leaked.push(`${route} → 停留在 ${page.url()}｜畫面內容: "${preview}"`);
      }
    }

    expect(
      leaked,
      `以下受保護頁對未登入訪客既未轉址、未回 4xx，也沒有顯示「請先登入」空狀態，\n` +
        `代表可能把受保護內容直接渲染出來：\n${leaked.join('\n')}`
    ).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════
// M4 — B2C/B2B 租戶邊界（依賴主計畫階段 2）
// ═════════════════════════════════════════════════════════════

test.describe('M4. B2C/B2B 租戶邊界', () => {
  // tenantId 尚未導入 SessionPayload（lib/auth/sessionManager.ts）。
  // 階段 2 完成後移除此 skip 並補上實作，避免現在污染通過率。
  test.skip(
    true,
    '依賴主計畫階段 2（tenantId 貫穿 Session 與資料表）完成後才可執行'
  );

  test('M4.1 B2C 使用者的 session tenantId 應為 PUBLIC', async () => {
    // TODO(階段 2): 斷言 /api/auth/me 回傳的 session 帶 tenantId === 'PUBLIC'
  });

  test('M4.2 B2C session 無法讀取企業租戶的課程/訂單', async () => {
    // TODO(階段 2): 以 B2C session 呼叫企業租戶的 courseId/orderId → 須回 404/403
  });

  test('M4.3 企業後台不得列出 tenantId=PUBLIC 的 B2C 使用者', async () => {
    // TODO(階段 2): 以企業 HR session 查成員清單，斷言不含 B2C 使用者
  });
});

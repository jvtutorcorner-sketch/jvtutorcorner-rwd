/**
 * 首頁 Hero 輪播圖驗證。
 *
 * 重點是「SSR 給的清單過期時，前端會不會自己補正」——正式站是 ISR，
 * 而 Amplify 上的背景重生並不可靠，所以 ClientHomePage 掛載後會再跟
 * /api/carousel（force-dynamic）對一次。這裡用攔截 API 回應的方式，
 * 模擬「資料庫已經變了、但 SSR 還是舊快照」的情境。
 *
 * 執行：
 *   APP_ENV=local npx playwright test e2e/carousel_hero_refresh.spec.ts --project=chromium
 */

import { expect, test } from '@playwright/test';

test('Hero 會顯示 /api/carousel 的輪播圖', async ({ page }) => {
  await page.goto('/');

  const dots = page.locator('.hero-premium-carousel .carousel-dots button');
  await expect(dots.first()).toBeVisible({ timeout: 20000 });

  // 實際資料庫有幾張，Hero 就該有幾顆指示點
  const apiRes = await page.request.get('/api/carousel');
  const items = (await apiRes.json()) as Array<{ url: string; order?: number }>;
  expect(items.length).toBeGreaterThan(0);

  await expect(dots).toHaveCount(items.length);

  // 輪播每 4 秒自動換頁，先點回第一顆指示點再斷言，避免跟自動輪播搶時間
  const expectedFirst = [...items].sort((a, b) => (a.order || 0) - (b.order || 0))[0].url;
  const expectedFile = expectedFirst.split('/').pop()!;

  await dots.first().click();
  const heroImg = page.locator('.hero-premium-carousel img').first();
  await expect(heroImg).toBeVisible();
  await expect
    .poll(async () => decodeURIComponent((await heroImg.getAttribute('src')) || ''), { timeout: 5000 })
    .toContain(expectedFile);
});

test('SSR 清單過期時，前端會用 API 的最新清單覆蓋', async ({ page }) => {
  // 先拿到真實清單，再假造一份「多了一張已刪除的舊圖」的 API 回應，
  // 驗證頁面最終呈現的是 API 回的清單，而不是 SSR 當下那份。
  const realRes = await page.request.get('http://localhost:3000/api/carousel');
  const real = (await realRes.json()) as Array<Record<string, unknown>>;

  const trimmed = real.slice(0, Math.max(1, real.length - 1));

  await page.route('**/api/carousel', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(trimmed),
    });
  });

  await page.goto('/');

  const dots = page.locator('.hero-premium-carousel .carousel-dots button');
  await expect(dots.first()).toBeVisible({ timeout: 20000 });

  // 掛載後補抓的結果（trimmed）應該取代 SSR 的完整清單
  await expect(dots).toHaveCount(trimmed.length, { timeout: 15000 });
});

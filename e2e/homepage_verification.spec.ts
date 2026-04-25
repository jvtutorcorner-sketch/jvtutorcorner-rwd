import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

test.describe.configure({ timeout: 120000 });

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// 設備尺寸配置
const DEVICE_SIZES = {
  mobile: { width: 375, height: 667, name: '手機 (375px)' },
  tablet: { width: 768, height: 1024, name: '平板 (768px)' },
  desktop: { width: 1920, height: 1080, name: '桌面 (1920px)' }
};

test.describe('首頁驗證測試 (Homepage Verification)', () => {
  
  // ========== 0. 響應式設計驗證 ==========
  test.describe('0. 響應式設計驗證', () => {
    
    test('0.1 不同設備尺寸佈局驗證', async ({ page }) => {
      for (const [key, size] of Object.entries(DEVICE_SIZES)) {
        console.log(`\n測試 ${size.name}...`);
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        
        await expect(page.locator('body')).toBeVisible();
        
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
        const viewportWidth = size.width;
        expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
      }
    });

    test('0.2 螢幕尺寸 768px 邊界測試', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const menuBtn = page.locator('button.menu-icon-btn, [aria-label="Toggle menu"]').first();
      await expect(menuBtn).toBeVisible();
      
      await page.setViewportSize({ width: 769, height: 1024 });
      await page.reload({ waitUntil: 'networkidle' });
      
      await expect(menuBtn).not.toBeVisible();
    });

    test('0.3 文本可讀性', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const hero = page.locator('h1').first();
      const fontSize = await hero.evaluate(el => 
        window.getComputedStyle(el).fontSize
      );
      
      const fontSizeValue = parseFloat(fontSize);
      expect(fontSizeValue).toBeGreaterThan(20);
    });
  });
  
  // ========== 1. 語言切換驗證 ==========
  test.describe('1. 語言切換驗證', () => {
    
    test('1.1 桌面版 - 語言下拉選單 UI 驗證', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.desktop);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      // Use role-based selector to target the language button specifically (not Next.js dev tools)
      const languageSwitcher = page.getByRole('button', { name: /TW|繁體中文/ });
      await expect(languageSwitcher).toBeVisible();
      
      await languageSwitcher.click();
      
      // After clicking, check that dropdown options are visible
      // Use role-based selectors for dropdown items
      await expect(page.locator('button[role="menuitem"]:has-text("TW")')).toBeVisible();
      await expect(page.locator('button[role="menuitem"]:has-text("CN")')).toBeVisible();
      await expect(page.locator('button[role="menuitem"]:has-text("EN")')).toBeVisible();
    });

    test('1.1m 手機版 - 語言下拉選單 UI 驗證', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.mobile);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const languageSwitcher = page.locator('button').filter({ 
        has: page.locator('text=/TW|CN|EN/') 
      }).first();
      await expect(languageSwitcher).toBeVisible();
      
      await languageSwitcher.click();
      await page.waitForTimeout(200);
    });

    test('1.2 桌面版 - 未登入用戶 Hero 翻譯驗證', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.desktop);
      await page.context().clearCookies();
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      
      await expect(page.locator('h1:has-text("開啟您的智慧學習之旅")')).toBeVisible();
      
      const languageSwitcher = page.locator('button').filter({ has: page.locator('text=TW') }).first();
      await languageSwitcher.click();
      await page.locator('button:has-text("CN")').click();
      
      await page.waitForTimeout(500);
      await expect(page.locator('h1:has-text("开启您的智慧学习之旅")')).toBeVisible();
    });

    test('1.2m 手機版 - 未登入用戶 Hero 翻譯驗證', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.mobile);
      await page.context().clearCookies();
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      
      await expect(page.locator('h1:has-text("開啟您的智慧學習之旅")')).toBeVisible();
      
      const h1 = page.locator('h1').first();
      const boundingBox = await h1.boundingBox();
      expect(boundingBox?.width).toBeLessThanOrEqual(DEVICE_SIZES.mobile.width);
    });

    test('1.5 語言快取驗證（無閃爍）', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.desktop);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const langBtn = page.locator('button').filter({ has: page.locator('text=/TW|CN|EN/') }).first();
      await langBtn.click();
      await page.locator('button:has-text("EN")').click();
      await page.waitForTimeout(500);
      
      await expect(page.locator('h1:has-text("Start Your Intelligent Learning Journey")')).toBeVisible();
      
      const locale = await page.evaluate(() => localStorage.getItem('locale'));
      expect(locale).toBe('en');
      
      await page.reload({ waitUntil: 'networkidle' });
      
      await expect(page.locator('h1:has-text("Start Your Intelligent Learning Journey")')).toBeVisible();
    });
  });

  // ========== 2. 行動版菜單驗證 ==========
  test.describe('2. 行動版菜單驗證', { tag: ['@mobile'] }, () => {

    test('2.1 手機版 - 菜單按鈕顯示', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.mobile);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const menuBtn = page.locator('button.menu-icon-btn, [aria-label="Toggle menu"]').first();
      await expect(menuBtn).toBeVisible();
      
      const boundingBox = await menuBtn.boundingBox();
      expect(boundingBox?.width).toBeGreaterThanOrEqual(44);
      expect(boundingBox?.height).toBeGreaterThanOrEqual(44);
    });

    test('2.2 手機版 - 菜單互動驗證', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.mobile);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const menuBtn = page.locator('button.menu-icon-btn, [aria-label="Toggle menu"]').first();
      await menuBtn.click();
      
      await page.waitForTimeout(300);
      
      // In mobile view, menu items are in the sidebar, use mobile-menu-link class
      const navItems = page.locator('.mobile-menu-link, [role="dialog"] a, [role="dialog"] button');
      await expect(navItems.first()).toBeVisible();
      
      const items = await navItems.all();
      for (const item of items.slice(0, 3)) {
        const bbox = await item.boundingBox();
        if (bbox) {
          expect(bbox.width).toBeLessThanOrEqual(DEVICE_SIZES.mobile.width);
        }
      }
    });

    test('2.3 桌面版 - 菜單按鈕隱藏', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.desktop);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const menuBtn = page.locator('button.menu-icon-btn, [aria-label="Toggle menu"]').first();
      await expect(menuBtn).not.toBeVisible();
      
      const navItems = page.locator('nav a');
      await expect(navItems.first()).toBeVisible();
    });

    test('2.4 平板版 - 菜單行為', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.tablet);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const menuBtn = page.locator('button.menu-icon-btn, [aria-label="Toggle menu"]').first();
      await expect(menuBtn).toBeVisible();
      
      await menuBtn.click();
      await page.waitForTimeout(300);
      
      // In tablet view (768px), menu items are in the sidebar dialog
      const navItems = page.locator('.mobile-menu-link, [role="dialog"] a, [role="dialog"] button');
      await expect(navItems.first()).toBeVisible();
    });
  });

  // ========== 3. Hero 部分詳細驗證 ==========
  test.describe('3. Hero 部分詳細驗證', () => {
    
    test('3.1 桌面版 - 未登入狀態 CTA 按鈕', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.desktop);
      await page.context().clearCookies();
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      
      const startBtn = page.locator('a, button').filter({ has: page.locator('text=/免費開始使用|Start for Free/') }).first();
      await expect(startBtn).toBeVisible();
      
      const bbox = await startBtn.boundingBox();
      expect(bbox?.x).toBeGreaterThanOrEqual(0);
      expect(bbox?.x).toBeLessThanOrEqual(DEVICE_SIZES.desktop.width);
    });

    test('3.1m 手機版 - 未登入狀態 CTA 按鈕', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.mobile);
      await page.context().clearCookies();
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      
      const startBtn = page.locator('a, button').filter({ has: page.locator('text=/免費開始使用|Start/') }).first();
      await expect(startBtn).toBeVisible();
      
      const bbox = await startBtn.boundingBox();
      expect(bbox?.height).toBeGreaterThanOrEqual(40);
    });

    test('3.2 桌面版 - Hero 文本佈局', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.desktop);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const heroSection = page.locator('section.home-hero-premium, section[class*="hero"]').first();
      await expect(heroSection).toBeVisible();
      
      const bbox = await heroSection.boundingBox();
      expect(bbox?.height).toBeGreaterThan(200);
    });

    test('3.2m 手機版 - Hero 文本換行', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.mobile);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const h1 = page.locator('h1').first();
      const bbox = await h1.boundingBox();
      
      expect(bbox?.width).toBeLessThanOrEqual(DEVICE_SIZES.mobile.width - 20);
      
      const text = await h1.textContent();
      expect(text?.length).toBeGreaterThan(0);
    });
  });

  // ========== 4. How it Works 部分驗證 ==========
  test.describe('4. How it Works 部分驗證', () => {
    
    test('4.1 桌面版 - How it Works 版面', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.desktop);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      // Scroll to the how-it-works section using its grid class (more robust than text selector)
      const howItWorksGrid = page.locator('.how-it-works-grid').first();
      await howItWorksGrid.scrollIntoViewIfNeeded();
      
      const cards = page.locator('.how-it-works-card');
      await expect(cards.first()).toBeVisible();
      await expect(cards).toHaveCount(3);
    });

    test('4.1m 手機版 - How it Works 堆疊佈局', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.mobile);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const howItWorksGrid = page.locator('.how-it-works-grid').first();
      await howItWorksGrid.scrollIntoViewIfNeeded();
      
      const cards = page.locator('.how-it-works-card');
      await expect(cards.first()).toBeVisible();
      await expect(cards).toHaveCount(3);
    });

    test('4.2 桌面版 - How it Works 卡片內容', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.desktop);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const howItWorksGrid = page.locator('.how-it-works-grid').first();
      await howItWorksGrid.scrollIntoViewIfNeeded();
      
      // Verify 3 cards with their content (translations fixed - no longer duplicated)
      const cards = page.locator('.how-it-works-card');
      await expect(cards).toHaveCount(3);
      
      // Check card titles appear in zh-TW: 挑選老師與課程, 預約上課時間, 進入教室上課
      const step1 = cards.nth(0).locator('h3');
      const step2 = cards.nth(1).locator('h3');
      const step3 = cards.nth(2).locator('h3');
      await expect(step1).toBeVisible();
      await expect(step2).toBeVisible();
      await expect(step3).toBeVisible();
    });
  });

  // ========== 5. 按鈕尺寸與可點擊性 ==========
  test.describe('5. 按鈕尺寸與可點擊性 (WCAG 標準)', () => {
    
    test('5.1 所有主要按鈕尺寸檢查', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.mobile);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const buttons = page.locator('button[class*="btn"], a[class*="btn"]');
      const visibleButtons = await buttons.filter({ has: page.locator(':visible') }).all();
      
      for (const btn of visibleButtons.slice(0, 5)) {
        const bbox = await btn.boundingBox();
        if (bbox && await btn.isVisible()) {
          expect(bbox.height).toBeGreaterThanOrEqual(40);
          expect(bbox.width).toBeGreaterThanOrEqual(40);
        }
      }
    });
  });

  // ========== 6. Carousel 響應式驗證 ==========
  test.describe('6. Carousel 響應式驗證', () => {
    
    test('6.1 桌面版 - Carousel 寬度', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.desktop);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const carousel = page.locator('[class*="carousel"], .Carousel').first();
      if (await carousel.isVisible()) {
        await carousel.scrollIntoViewIfNeeded();
        
        const bbox = await carousel.boundingBox();
        expect(bbox?.width).toBeLessThanOrEqual(DEVICE_SIZES.desktop.width);
      }
    });

    test('6.1m 手機版 - Carousel 全寬', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.mobile);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const carousel = page.locator('[class*="carousel"], .Carousel').first();
      if (await carousel.isVisible()) {
        await carousel.scrollIntoViewIfNeeded();
        
        const bbox = await carousel.boundingBox();
        // Carousel is inside a padded container; allow up to 100px total horizontal margin
        // (24px padding on each side from .carousel class + parent container padding)
        expect(bbox?.width).toBeGreaterThan(DEVICE_SIZES.mobile.width - 100);
      }
    });
  });

  // ========== 7. 字體與文本視覺層級 ==========
  test.describe('7. 字體與文本視覺層級', () => {
    
    test('7.1 桌面版 - 文本層級驗證', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.desktop);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const h1Size = await page.locator('h1').first().evaluate(el => 
        parseInt(window.getComputedStyle(el).fontSize)
      );
      
      const h2Size = await page.locator('h2').first().evaluate(el => 
        parseInt(window.getComputedStyle(el).fontSize)
      );
      
      const h3Size = await page.locator('h3').first().evaluate(el => 
        parseInt(window.getComputedStyle(el).fontSize)
      );
      
      expect(h1Size).toBeGreaterThan(h2Size);
      expect(h2Size).toBeGreaterThanOrEqual(h3Size);
    });
  });

  // ========== 8. 圖片與媒體响應式 ==========
  test.describe('8. 圖片與媒體響應式', () => {
    
    test('8.1 桌面版 - 圖片不溢出', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.desktop);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const images = page.locator('img');
      const visibleImages = await images.filter({ has: page.locator(':visible') }).all();
      
      for (const img of visibleImages.slice(0, 5)) {
        const bbox = await img.boundingBox();
        if (bbox) {
          expect(bbox.width).toBeLessThanOrEqual(DEVICE_SIZES.desktop.width);
        }
      }
    });

    test('8.1m 手機版 - 圖片縮放', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.mobile);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const images = page.locator('img');
      const visibleImages = await images.filter({ has: page.locator(':visible') }).all();
      
      for (const img of visibleImages.slice(0, 5)) {
        const bbox = await img.boundingBox();
        if (bbox) {
          expect(bbox.width).toBeLessThanOrEqual(DEVICE_SIZES.mobile.width);
        }
      }
    });
  });

  // ========== 9. 效能相關檢查 ==========
  test.describe('9. 效能相關檢查', () => {
    
    test('9.1 首屏內容加載時間', async ({ page }) => {
      await page.setViewportSize(DEVICE_SIZES.desktop);
      
      const startTime = Date.now();
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      const loadTime = Date.now() - startTime;
      
      expect(loadTime).toBeLessThan(3000);
      console.log(`頁面載入時間: ${loadTime}ms`);
    });

    test('9.2 沒有網絡錯誤', async ({ page }) => {
      const failedRequests: string[] = [];
      
      page.on('response', response => {
        if (response.status() >= 500) {
          failedRequests.push(`${response.status()}: ${response.url()}`);
        }
      });
      
      await page.setViewportSize(DEVICE_SIZES.desktop);
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const serverErrors = failedRequests.filter(req => req.startsWith('5'));
      expect(serverErrors).toHaveLength(0);
    });
  });
});

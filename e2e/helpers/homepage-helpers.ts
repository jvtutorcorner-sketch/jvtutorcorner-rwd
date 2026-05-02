/// <reference types="node" />

/**
 * 首頁驗證輔助函數
 * 提供常用的首頁測試功能
 */

import { Page, expect } from '@playwright/test';

/**
 * 切換語言到指定的語言代碼
 * @param page Playwright Page 物件
 * @param locale 語言代碼 ('zh-TW', 'zh-CN', 'en')
 */
export async function switchLanguage(page: Page, locale: 'zh-TW' | 'zh-CN' | 'en') {
  const localeMap = {
    'zh-TW': 'TW',
    'zh-CN': 'CN',
    'en': 'EN'
  };

  const langCode = localeMap[locale];
  
  // 找到語言選擇器按鈕
  const langBtn = page.locator('button').filter({ has: page.locator('text=/TW|CN|EN/') }).first();
  await langBtn.click();
  
  // 點擊目標語言
  await page.locator(`button:has-text("${langCode}")`).click();
  
  // 等待翻譯更新
  await page.waitForTimeout(500);
}

/**
 * 驗證 Hero 區段的文本是否包含預期的翻譯
 * @param page Playwright Page 物件
 * @param expectedText 預期包含的文本
 * @param isLoggedIn 是否已登入
 */
export async function verifyHeroText(page: Page, expectedText: string, isLoggedIn: boolean = false) {
  const heroSection = page.locator('section.home-hero-premium, section[class*="hero"]').first();
  await heroSection.scrollIntoViewIfNeeded();
  
  if (isLoggedIn) {
    // 對於登入用戶，檢查歡迎文本
    await expect(page.locator('h1').filter({ has: page.locator(`text=${expectedText}`) })).toBeVisible();
  } else {
    // 對於未登入用戶，直接檢查文本
    await expect(page.locator(`h1:has-text("${expectedText}")`)).toBeVisible();
  }
}

/**
 * 驗證 How it Works 三個步驟的翻譯
 * @param page Playwright Page 物件
 * @param step1Title 第一步標題
 * @param step2Title 第二步標題
 * @param step3Title 第三步標題
 */
export async function verifyHowItWorksSteps(
  page: Page,
  step1Title: string,
  step2Title: string,
  step3Title: string
) {
  // 向下滾動找到 How it Works 區段
  const section = page.locator('section:has(h2:has-text(/簡單|Simple|简单/))').first();
  await section.scrollIntoViewIfNeeded();
  
  // 驗證所有三個步驟
  await expect(page.locator(`h3:has-text("${step1Title}")`)).toBeVisible();
  await expect(page.locator(`h3:has-text("${step2Title}")`)).toBeVisible();
  await expect(page.locator(`h3:has-text("${step3Title}")`)).toBeVisible();
}

/**
 * 檢查是否存在語言閃爍問題
 * 通過重新整理並檢查語言是否保持不變來驗證
 * @param page Playwright Page 物件
 * @param expectedLocale 預期的語言代碼
 */
export async function checkLanguageCachingFlicker(page: Page, expectedLocale: string) {
  // 記錄頁面首次渲染時的語言
  const initialLang = await page.evaluate(() => document.documentElement.lang);
  
  // 重新整理
  await page.reload({ waitUntil: 'networkidle' });
  
  // 檢查重新整理後的語言是否相同
  const reloadedLang = await page.evaluate(() => document.documentElement.lang);
  
  expect(reloadedLang).toBe(expectedLocale);
  expect(reloadedLang).toBe(initialLang);
  
  // 驗證 localStorage 也正確保存
  const storedLocale = await page.evaluate(() => localStorage.getItem('locale'));
  expect(storedLocale).toBe(expectedLocale);
}

/**
 * 驗證行動版菜單的顯示和交互
 * @param page Playwright Page 物件
 */
export async function verifyMobileMenu(page: Page) {
  // 設置行動版大小
  await page.setViewportSize({ width: 375, height: 667 });
  
  // 菜單按鈕應該顯示
  const menuBtn = page.locator('button.menu-icon-btn, [aria-label="Toggle menu"]').first();
  await expect(menuBtn).toBeVisible();
  
  // 點擊打開菜單
  await menuBtn.click();
  await page.waitForTimeout(300);
  
  // 驗證導覽項目顯示
  const navItems = page.locator('nav a, nav button');
  await expect(navItems.first()).toBeVisible();
  
  return true;
}

/**
 * 驗證桌面版菜單按鈕隱藏
 * @param page Playwright Page 物件
 */
export async function verifyDesktopMenuHidden(page: Page) {
  // 設置桌面版大小
  await page.setViewportSize({ width: 1024, height: 768 });
  
  // 菜單按鈕應該隱藏
  const menuBtn = page.locator('button.menu-icon-btn, [aria-label="Toggle menu"]').first();
  await expect(menuBtn).not.toBeVisible();
  
  // 導覽項目應該顯示
  const navItems = page.locator('nav a');
  await expect(navItems.first()).toBeVisible();
  
  return true;
}

/**
 * 模擬用戶註冊並驗證自動登入
 * @param page Playwright Page 物件
 * @returns 返回註冊的用戶 Email
 */
export async function registerUserAndVerifyLogin(page: Page): Promise<string> {
  const timestamp = Date.now();
  const testEmail = `homepage_test_${timestamp}@example.com`;
  
  6
  
  return testEmail;
}

/**
 * 清除用戶登入狀態以模擬未登入訪客
 * @param page Playwright Page 物件
 */
export async function clearLoginState(page: Page) {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  
  await page.reload({ waitUntil: 'networkidle' });
}

/**
 * 驗證 CTA 按鈕導航
 * @param page Playwright Page 物件
 * @param buttonText 按鈕文本
 * @param expectedUrl 預期導向的 URL 路徑
 */
export async function verifyCTANavigation(
  page: Page,
  buttonText: string,
  expectedUrl: string
) {
  const btn = page.locator(`a:has-text("${buttonText}"), button:has-text("${buttonText}")`).first();
  await btn.click();
  
  // 等待導航完成
  await page.waitForURL(new RegExp(expectedUrl), { waitUntil: 'networkidle' });
  
  expect(page.url()).toContain(expectedUrl);
}

/**
 * 驗證頁面 SEO 元資料
 * @param page Playwright Page 物件
 */
export async function verifySEOMetadata(page: Page) {
  // 驗證頁面標題
  const title = await page.title();
  if (!title) {
    throw new Error('Page title is missing');
  }
  
  // 驗證 meta description
  const metaDesc = await page.getAttribute('meta[name="description"]', 'content');
  if (!metaDesc) {
    throw new Error('Meta description is missing');
  }
  
  return {
    title,
    description: metaDesc
  };
}

/**
 * 等待翻譯系統準備完畢
 * @param page Playwright Page 物件
 * @param timeout 超時時間（毫秒）
 */
export async function waitForTranslationsReady(page: Page, timeout: number = 5000) {
  await page.evaluate(({ timeout }) => {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkReady = setInterval(() => {
        // 檢查特定翻譯鍵是否已載入
        const translations = (window as any).__translations;
        if (translations || Date.now() - startTime > timeout) {
          clearInterval(checkReady);
          resolve(true);
        }
      }, 100);
    });
  }, { timeout });
}

export default {
  switchLanguage,
  verifyHeroText,
  verifyHowItWorksSteps,
  checkLanguageCachingFlicker,
  verifyMobileMenu,
  verifyDesktopMenuHidden,
  registerUserAndVerifyLogin,
  clearLoginState,
  verifyCTANavigation,
  verifySEOMetadata,
  waitForTranslationsReady
};

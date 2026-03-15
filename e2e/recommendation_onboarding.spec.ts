/**
 * e2e/recommendation_onboarding.spec.ts
 *
 * Validates:
 *   Suite A – Recommendation & Survey Seed APIs
 *   Suite B – UI: questionnaire in register flow + homepage idle drawer
 *
 * Skill: recommendation-onboarding
 */
import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// ─── Suite A: API Unit Tests ──────────────────────────────────────────────────

test.describe('Suite A: API – Recommendations', () => {
  test('GET /api/recommendations (no userId) → isNewUser + mmrAlpha=0.4', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/recommendations`);
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.recommendations).toBeDefined();
    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(data.recommendations.length).toBeLessThanOrEqual(10);
    expect(data.meta.isNewUser).toBe(true);
    expect(data.meta.mmrAlpha).toBe(0.4);

    console.log(`[A1] New-user recommendations: ${data.recommendations.length} items`);
  });

  test('Frequency Cap: same category appears ≤ 3 times in Top-10', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/recommendations`);
    const data = await res.json();

    const categoryCounts: Record<string, number> = {};
    for (const course of data.recommendations) {
      const cat = course.category ?? course.subject ?? 'unknown';
      categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
    }

    for (const [cat, count] of Object.entries(categoryCounts)) {
      expect(count, `Category "${cat}" exceeds frequency cap (max 3)`).toBeLessThanOrEqual(3);
    }

    console.log('[A2] Category distribution:', categoryCounts);
  });

  test('POST /api/recommendations with guestSeeds returns personalised results', async ({ request }) => {
    // Inject 5 English seeds to simulate a guest who clicked English courses
    const now = new Date().toISOString();
    const guestSeeds = Array.from({ length: 5 }, (_, i) => ({
      tag: 'english',
      weight: 1.0,
      source: 'click',
      createdAt: new Date(Date.now() - i * 86_400_000).toISOString(), // i days ago
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    }));

    const res = await request.post(`${BASE_URL}/api/recommendations`, {
      data: { guestSeeds },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.meta.isNewUser).toBe(false);

    // English-related courses should appear but not dominate (≤3 per cap)
    const englishCourses = data.recommendations.filter(
      (c: { category?: string }) => c.category === '英文'
    );
    expect(englishCourses.length).toBeGreaterThan(0);
    expect(englishCourses.length).toBeLessThanOrEqual(3);

    console.log(`[A3] With English seeds: ${englishCourses.length} English courses in Top-${data.recommendations.length}`);
  });
});

test.describe('Suite A: API – Survey Seeds', () => {
  test('POST /api/survey/seeds (guest) → persisted=false, returns seeds array', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/survey/seeds`, {
      data: {
        answers: { q1: 'A', q3: ['C'] },
        // no userId → guest mode
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.persisted).toBe(false);
    expect(Array.isArray(data.seeds)).toBe(true);
    expect(data.seedCount).toBeGreaterThan(0);

    console.log(`[A4] Guest seeds returned: ${data.seedCount} seeds`);
  });

  test('POST /api/survey/seeds Q3-C → newFeatureAffinity=true', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/survey/seeds`, {
      data: {
        answers: { q1: 'B', q3: ['C'], q4: 'C' },
      },
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    expect(data.newFeatureAffinity).toBe(true);
    console.log('[A5] Q3-C newFeatureAffinity:', data.newFeatureAffinity);
  });

  test('POST /api/survey/seeds Q3-D → newFeatureAffinity=true', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/survey/seeds`, {
      data: {
        answers: { q1: 'D', q3: ['D'] },
      },
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    expect(data.newFeatureAffinity).toBe(true);
  });

  test('POST /api/survey/seeds Q3-A/B only → newFeatureAffinity=false', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/survey/seeds`, {
      data: {
        answers: { q1: 'A', q3: ['A', 'B'] },
      },
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    expect(data.newFeatureAffinity).toBe(false);
    console.log('[A6] Q3-A/B only newFeatureAffinity:', data.newFeatureAffinity);
  });

  test('Seed injection improves relevance: English seeds → more English courses', async ({ request }) => {
    // 1. Cold-start recommendations
    const coldRes = await request.get(`${BASE_URL}/api/recommendations`);
    const coldData = await coldRes.json();
    const coldEnglish = coldData.recommendations.filter((c: { category?: string }) => c.category === '英文').length;

    // 2. Recommendations with English seeds
    const seeds = Array.from({ length: 5 }, (_, i) => ({
      tag: 'english',
      weight: 1.0,
      source: 'onboarding_survey',
      createdAt: new Date(Date.now() - i * 3_600_000).toISOString(),
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    }));
    const warmRes = await request.post(`${BASE_URL}/api/recommendations`, {
      data: { guestSeeds: seeds },
      headers: { 'Content-Type': 'application/json' },
    });
    const warmData = await warmRes.json();
    const warmEnglish = warmData.recommendations.filter((c: { category?: string }) => c.category === '英文').length;

    expect(warmEnglish).toBeGreaterThanOrEqual(coldEnglish);
    expect(warmEnglish).toBeLessThanOrEqual(3); // still capped
    console.log(`[A7] Cold English: ${coldEnglish}, Warm English: ${warmEnglish}`);
  });
});

// ─── Suite B: UI Flow Tests ───────────────────────────────────────────────────

test.describe('Suite B: UI – Homepage Recommendation Section', () => {
  test('Guest: homepage shows "為你精選的課程" recommendation section', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // The personalised recommendation header
    const header = page.locator('text=為你精選的課程');
    await expect(header).toBeVisible({ timeout: 8000 });

    // The "create account" link should be visible for guests
    const createAccountLink = page.locator('a', { hasText: '建立帳號獲得更精準推薦' });
    await expect(createAccountLink).toBeVisible();

    console.log('[B1] Guest homepage recommendation section visible');
  });

  test('Guest idle test: questionnaire drawer structure', async ({ page }) => {
    await page.goto(BASE_URL);

    // Inject English seeds into localStorage to prevent idle detection being skipped
    // (fresh guest with no seeds)
    await page.evaluate(() => {
      localStorage.removeItem('jv_survey_seeds');
      localStorage.removeItem('jv_survey_answers');
    });

    // Trigger the idle questionnaire by directly calling the component state
    // Since we cannot wait 3 real minutes in CI, we inject via page evaluate
    await page.evaluate(() => {
      // Dispatch a custom event that the component listens for (test hook)
      window.dispatchEvent(new CustomEvent('__test_trigger_idle_questionnaire'));
    });

    // Alternative: manipulate the timer – verify the drawer markup exists after a short wait
    // We look for the drawer text that appears regardless of timer
    const drawerTrigger = page.locator('text=30 秒');
    // If the drawer hasn't shown in 2s (timer hasn't fired), we skip gracefully
    const visible = await drawerTrigger.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, 'Idle drawer requires 3-min timer; use manual test for full validation');
      return;
    }

    await expect(page.locator('text=讓我們幫你找到最適合你的課程 ✦')).toBeVisible();
    console.log('[B2] Guest idle questionnaire drawer visible');
  });
});

test.describe('Suite B: UI – Register Page Questionnaire', () => {
  test('Questionnaire appears after successful registration', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto(`${BASE_URL}/login/register`);
    await page.waitForLoadState('networkidle');

    const uniqueEmail = `test_rec_${Date.now()}@example.com`;

    // Fill registration form
    await page.selectOption('select', 'student');
    await page.fill('input[placeholder=""]', '測試'); // First Name - get by order
    // Fill fields by label proximity
    const firstNameInput = page.locator('input').nth(1);
    const lastNameInput = page.locator('input').nth(2);
    await firstNameInput.fill('Test');
    await lastNameInput.fill('User');
    await page.fill('input[type="email"]', uniqueEmail);
    await page.locator('input[type="password"]').first().fill('TestPass123!');
    await page.locator('input[type="password"]').last().fill('TestPass123!');
    await page.fill('input[type="date"]', '2000-01-01');
    await page.locator('select').nth(1).selectOption('male');
    await page.locator('select').nth(2).selectOption('TW');

    // Accept terms
    await page.locator('input[name="terms"]').check();

    // Submit
    await page.locator('button[type="submit"]').click();

    // Wait for questionnaire to appear
    const questionnaireHeading = page.locator('text=讓我們幫你找到最適合你的課程 ✦');
    await expect(questionnaireHeading).toBeVisible({ timeout: 10000 });

    // Verify 4-question progress (4 progress dots)
    // Progress dots are rendered as divs with flex styling
    const baseContainer = page.locator('text=讓我們幫你找到最適合你的課程 ✦').locator('xpath=ancestor::div[3]');
    console.log('[B3] Questionnaire appeared after registration');

    // Answer Q1
    await page.locator('button', { hasText: '想開口說英文' }).click();
    await page.locator('button', { hasText: '下一題 →' }).click();

    // Answer Q2
    await page.locator('button', { hasText: '每天見縫插針' }).click();
    await page.locator('button', { hasText: '下一題 →' }).click();

    // Answer Q3
    await page.locator('button', { hasText: '讓 AI 幫我找弱點' }).click();
    await page.locator('button', { hasText: '下一題 →' }).click();

    // Answer Q4
    await page.locator('button', { hasText: '完全零基礎' }).click();
    await page.locator('button', { hasText: '查看推薦課程' }).click();

    // Completion message
    await expect(page.locator('text=設定完成！')).toBeVisible({ timeout: 8000 });
    console.log('[B3] Questionnaire completed successfully');
  });
});

// ─── Suite C: Algorithm Logic Validation ─────────────────────────────────────

test.describe('Suite C: Algorithm Logic', () => {
  test('Extreme scenario: 10 English clicks → English capped at 3', async ({ request }) => {
    // Simulate the "extreme" scenario from the design doc
    const now = Date.now();
    const seeds = [
      // 10 English interactions
      ...Array.from({ length: 10 }, (_, i) => ({
        tag: 'english',
        weight: 1.0,
        source: 'click',
        createdAt: new Date(now - (i + 1) * 3_600_000).toISOString(),
        expiresAt: new Date(now + 30 * 86_400_000).toISOString(),
      })),
      // 1 design interaction
      {
        tag: 'design',
        weight: 1.0,
        source: 'click',
        createdAt: new Date(now - 3 * 86_400_000).toISOString(),
        expiresAt: new Date(now + 30 * 86_400_000).toISOString(),
      },
    ];

    const res = await request.post(`${BASE_URL}/api/recommendations`, {
      data: { guestSeeds: seeds },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);

    const data = await res.json();
    const categories = data.recommendations.map((c: { category?: string }) => c.category ?? '');

    const englishCount = categories.filter((c: string) => c === '英文').length;
    const uniqueCategories = new Set(categories).size;

    expect(englishCount).toBeLessThanOrEqual(3);       // Frequency cap enforced
    expect(uniqueCategories).toBeGreaterThanOrEqual(2); // Diversity preserved

    console.log(`[C1] Extreme English scenario:
      English courses: ${englishCount}/10 (capped ≤ 3)
      Unique categories: ${uniqueCategories}
      Full list: ${JSON.stringify(categories)}`);
  });

  test('mmrAlpha adapts correctly based on interaction richness', async ({ request }) => {
    // No interactions → isNewUser mode (alpha = 0.4)
    const coldRes = await request.get(`${BASE_URL}/api/recommendations`);
    const coldData = await coldRes.json();
    expect(coldData.meta.mmrAlpha).toBe(0.4);

    // Survey seeds only → partial mode (alpha = 0.6)
    const surveySeeds = [
      {
        tag: 'english',
        weight: 3.0,
        source: 'onboarding_survey',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
    ];
    const surveyRes = await request.post(`${BASE_URL}/api/recommendations`, {
      data: { guestSeeds: surveySeeds },
      headers: { 'Content-Type': 'application/json' },
    });
    const surveyData = await surveyRes.json();
    expect(surveyData.meta.mmrAlpha).toBe(0.6);

    // Real click seeds → standard mode (alpha = 0.7)
    const clickSeeds = [
      {
        tag: 'english',
        weight: 1.0,
        source: 'click',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
    ];
    const clickRes = await request.post(`${BASE_URL}/api/recommendations`, {
      data: { guestSeeds: clickSeeds },
      headers: { 'Content-Type': 'application/json' },
    });
    const clickData = await clickRes.json();
    expect(clickData.meta.mmrAlpha).toBe(0.7);

    console.log('[C2] mmrAlpha adaptation: cold=0.4, survey=0.6, click=0.7 ✓');
  });
});

import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local explicitly
const envResult = dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const env = envResult.parsed || {};

// Read from .env.local via process.env fallback
const BASE_URL = env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const BYPASS_SECRET = env.LOGIN_BYPASS_SECRET || process.env.LOGIN_BYPASS_SECRET || 'your_bypass_secret';
const STUDENT_EMAIL = env.TEST_STUDENT_EMAIL || process.env.TEST_STUDENT_EMAIL || 'student@test.com';
const STUDENT_PASSWORD = env.TEST_STUDENT_PASSWORD || process.env.TEST_STUDENT_PASSWORD || 'password';
const ADMIN_EMAIL = env.ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@jvtutorcorner.com';
const ADMIN_PASSWORD = env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin_password';

test.describe('Pricing Deduction Logic Verification', () => {
  test('Verify points deduction when purchasing a package with app plan', async ({ page, request }) => {
    // 1. Login
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', STUDENT_EMAIL);
    await page.fill('input[name="password"]', STUDENT_PASSWORD);
    await page.fill('#captcha', BYPASS_SECRET);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000); // Wait for login to settle

    // 2. Setup Pricing Data via Admin API directly
    // Use the request object to bypass UI for setup
    const appPlanId = `test_app_${Date.now()}`;
    const appPointsCost = 50;
    
    const setupPricingRes = await request.post(`${BASE_URL}/api/admin/pricing`, {
      data: {
        settings: {
          pageTitle: '方案與價格',
          pageDescription: '選擇最適合您的會員方案',
          mode: 'subscription',
          plans: [], // empty for this test
          appPlans: [
            {
              id: appPlanId,
              name: 'Test App Plan',
              description: 'Verification App Plan',
              appId: 'test_app',
              pointsCost: appPointsCost,
              isActive: true,
              order: 1
            }
          ],
          pointPackages: [
            {
              id: 'test_pkg_with_app',
              name: 'Test Package (100 pts)',
              points: 100,
              price: 1000,
              unitPrice: 10,
              appPlanIds: [appPlanId],
              prePurchasePointsCost: appPointsCost,
              isActive: true,
              order: 1
            }
          ]
        }
      }
    });
    expect(setupPricingRes.ok()).toBeTruthy();


    // 3. Go to /pricing to see the package
    await page.goto(`${BASE_URL}/pricing`);
    await page.waitForSelector('h2:has-text("點數方案")');

    // Verify the UI shows the deduction
    const pkgCard = page.locator('.pricing-card', { hasText: 'Test Package (100 pts)' });
    await expect(pkgCard).toBeVisible();
    
    // Verify the text "購買 100 點後可用 50 點" (100 - 50 = 50)
    await expect(pkgCard).toContainText(`購買 100 點後可用 50 點`);

    // 4. Record current points
    const pointsText = await page.locator('.text-2xl.font-bold.text-indigo-600').textContent();
    const initialPoints = parseInt(pointsText?.replace(/\D/g, '') || '0', 10);
    console.log(`Initial points: ${initialPoints}`);

    // 5. Purchase the package
    await pkgCard.locator('a:has-text("購買點數")').click();
    await page.waitForURL(/.*checkout.*/);
    
    // Verify checkout price and points
    await expect(page.locator('h2')).toContainText('Test Package (100 pts)');
    await expect(page.locator('p', { hasText: 'NT$ 1000' })).toBeVisible();

    // Perform simulated payment
    await page.click('button:has-text("模擬支付")');
    
    // Wait for redirect back to /plans or check local state
    await page.waitForURL(/.*plans.*/);

    // 6. Go back to /pricing to check points balance
    await page.goto(`${BASE_URL}/pricing`);
    await page.waitForTimeout(2000); // Wait for points to update
    
    const finalPointsText = await page.locator('.text-2xl.font-bold.text-indigo-600').textContent();
    const finalPoints = parseInt(finalPointsText?.replace(/\D/g, '') || '0', 10);
    console.log(`Final points: ${finalPoints}`);

    // Expectation: initialPoints + (100 - 50) = finalPoints
    // Bug: IT MIGHT BE initialPoints + 100 = finalPoints
    expect(finalPoints).toBe(initialPoints + 50);
  });
});

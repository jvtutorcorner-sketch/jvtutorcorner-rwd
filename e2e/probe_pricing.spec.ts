import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test('surface probe — /pricing API calls and page render', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/api/') && u.includes('pricing')) {
      apiCalls.push(req.method() + ' ' + u.replace(BASE_URL, ''));
    }
  });

  await page.goto(`${BASE_URL}/pricing`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);

  console.log('\n=== API calls from /pricing ===');
  apiCalls.forEach(c => console.log(' ', c));

  const hasShared = apiCalls.some(c => c.includes('/api/shared/pricing'));
  const hasAdmin  = apiCalls.some(c => c.includes('/api/admin/pricing'));
  console.log('hasShared:', hasShared, '| hasAdmin:', hasAdmin);

  expect(hasShared, 'Should call /api/shared/pricing').toBe(true);
  expect(hasAdmin,  'Should NOT call /api/admin/pricing').toBe(false);

  const h1 = await page.locator('header.page-header h1').textContent().catch(() => 'NOT FOUND');
  console.log('H1:', h1);

  const subCount = await page.locator('section').filter({ hasText: '訂閱方案' }).count();
  const ptCount  = await page.locator('section').filter({ hasText: '點數方案' }).count();
  console.log('Subscription section:', subCount > 0);
  console.log('Points section:', ptCount > 0);
});

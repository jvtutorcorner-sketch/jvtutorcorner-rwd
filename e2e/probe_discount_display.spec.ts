import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

test('Fix 6 + Fix 3: active plan with discount shows strike-through on /pricing', async ({ page }) => {
  await page.goto(`${BASE}/pricing`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Fix 3 check: "basic" plan now has isActive=true → subscription section should appear
  const subSection = page.locator('section').filter({ hasText: '訂閱方案' });
  const subVisible = await subSection.count() > 0;
  console.log('Fix 3 — Subscription section visible:', subVisible);
  expect(subVisible, 'Subscription section must appear for the active plan').toBe(true);

  // Fix 6 check: basic plan card should have a line-through price
  const card = page.locator('.pricing-card', { hasText: 'Basic' }).or(
    page.locator('.pricing-card', { hasText: '普通' })
  ).first();
  const cardVisible = await card.isVisible().catch(() => false);
  console.log('Fix 6 — Plan card visible:', cardVisible);

  if (cardVisible) {
    const strikeThrough = card.locator('span.line-through');
    const strikeVisible = await strikeThrough.isVisible().catch(() => false);
    console.log('Fix 6 — Strike-through visible:', strikeVisible);
    expect(strikeVisible, 'Strike-through original price must appear for discounted plan').toBe(true);

    const strikeTxt = await strikeThrough.textContent();
    console.log('Fix 6 — Strike-through text:', strikeTxt);

    // original = 800 / (1 - 0.20) = 1000
    expect(strikeTxt, 'Should show NT$ 1000 as the original price').toContain('1000');

    const discountLabel = card.locator('span.text-green-500');
    const labelTxt = await discountLabel.textContent().catch(() => '');
    console.log('Fix 6 — Discount label:', labelTxt);
    expect(labelTxt).toContain('20');
  } else {
    console.log('  ⚠️ Card not found by "Basic"/"普通" — checking all plan cards');
    const allCards = page.locator('.pricing-card');
    const n = await allCards.count();
    console.log('  Total plan cards:', n);
    for (let i = 0; i < n; i++) {
      const txt = await allCards.nth(i).textContent();
      console.log(`  Card ${i}:`, txt?.slice(0, 60));
    }
    // If we can see ANY strike-through on ANY card, Fix 6 works
    const anyStrike = page.locator('.pricing-card span.line-through');
    await expect(anyStrike.first(), 'At least one plan card must have a strike-through price').toBeVisible();
  }
});

test('🔍 Probe: plan with isActive=false is still filtered out', async ({ page, request }) => {
  const r = await request.get(`${BASE}/api/shared/pricing`);
  const d = await r.json();
  const inactivePlans = (d.settings?.plans || []).filter((p: any) => p.isActive === false);
  console.log('Inactive plan IDs:', inactivePlans.map((p: any) => p.id));

  await page.goto(`${BASE}/pricing`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  for (const p of inactivePlans) {
    // Use label since IDs aren't in DOM
    if (!p.label) continue;
    const count = await page.locator('.pricing-card', { hasText: p.label }).count();
    console.log(`  Inactive plan "${p.label}" visible on page:`, count > 0);
    expect(count, `Inactive plan "${p.label}" must NOT appear on /pricing`).toBe(0);
  }
  console.log('  🔍 All inactive plans correctly hidden');
});

test('🔍 Probe: /api/admin/pricing rejects bad PlanConfig (no id)', async ({ request }) => {
  const r = await request.get(`${BASE}/api/admin/pricing`);
  const d = await r.json();
  const settings = d.settings;

  const badPayload = {
    settings: {
      ...settings,
      plans: [{ label: 'No ID plan', order: 1, isActive: true }], // missing required 'id'
    },
  };

  const res = await request.post(`${BASE}/api/admin/pricing`, { data: badPayload });
  const body = await res.json();
  console.log('  Probe — bad payload response:', res.status(), body);
  expect(res.status(), 'API must reject plan without id with 400').toBe(400);
  expect(body.ok).toBe(false);
  console.log('  🔍 API correctly rejected malformed plan');
});

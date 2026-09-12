/**
 * 對應 skill: .agents/skills/app-integrations-line-make/SKILL.md
 *
 * 第三方整合（App integrations、LINE、Make.com）的權限 contract。
 * ⚠️ 不帶 `x-simulation` header 打 LINE webhook、不帶 `?health=true` 打 make-sync——兩者都會觸發真實流程。
 *
 *   npx playwright test e2e/app_integrations_line_make_verification.spec.ts --project=chromium
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { contractTitle, runContractCase, studentContext, type ContractCase } from './helpers/auth-helpers';

test.describe('第三方整合 Verification (app-integrations-line-make)', () => {
  let student: APIRequestContext;

  test.beforeAll(async () => {
    student = (await studentContext()).request;
  });
  test.afterAll(async () => {
    await student?.dispose();
  });

  const CASES: ContractCase[] = [
    // App integrations（第三方憑證庫）
    { who: 'G', method: 'GET', path: '/api/app-integrations', expect: 401 },
    { who: 'S', method: 'GET', path: '/api/app-integrations', expect: 403 },
    { who: 'SYS', method: 'GET', path: '/api/app-integrations', expect: 200 },
    { who: 'SYS', method: 'POST', path: '/api/app-integrations', body: {}, expect: 400, note: '缺 userId／type' },
    { who: 'SYS', method: 'PUT', path: '/api/app-integrations', body: {}, expect: 400 },
    { who: 'SYS', method: 'DELETE', path: '/api/app-integrations', expect: 400, note: '缺主鍵' },
    { who: 'S', method: 'POST', path: '/api/app-integrations/test', body: {}, expect: 403 },
    { who: 'SYS', method: 'POST', path: '/api/app-integrations/test', body: {}, expect: 400, note: '缺 type' },
    { who: 'SYS', method: 'POST', path: '/api/app-integrations/test', body: { type: 'NOPE', config: { a: 1 } }, expect: 400, note: '不支援的類型，不外呼' },

    // LINE
    { who: 'S', method: 'POST', path: '/api/line/push', body: {}, expect: 403 },
    { who: 'SYS', method: 'POST', path: '/api/line/push', body: {}, expect: 400, note: '缺 message' },
    { who: 'G', method: 'GET', path: '/api/line/webhook-logs', expect: 401 },
    { who: 'S', method: 'GET', path: '/api/line/webhook-logs', expect: 403 },
    { who: 'SYS', method: 'GET', path: '/api/line/webhook-logs', expect: 400, note: '缺 integrationId' },
    { who: 'G', method: 'GET', path: '/api/line/webhook/e2e-nonexistent?messageId=x', expect: 404 },
    { who: 'G', method: 'POST', path: '/api/line/webhook/e2e-nonexistent', body: { events: [] }, expect: 404 },

    // Make.com（手寫 requireAdmin：錯誤角色回 401、不認 e2e bypass）
    { who: 'G', method: 'GET', path: '/api/integration/make-config', expect: 401 },
    { who: 'S', method: 'GET', path: '/api/integration/make-config', expect: 401 },
    { who: 'SYS', method: 'GET', path: '/api/integration/make-config', expect: 401, note: '手寫守衛不認 bypass' },
    { who: 'G', method: 'PUT', path: '/api/integration/make-config', body: {}, expect: 401 },
    { who: 'G', method: 'GET', path: '/api/integration/make-sync', expect: 400, note: '沒有 health 參數' },
    { who: 'G', method: 'POST', path: '/api/integration/make-sync', body: {}, expect: 401 },
    { who: 'G', method: 'PUT', path: '/api/integration/make-sync', body: {}, expect: 401 },
  ];
  for (const c of CASES) {
    test(contractTitle(c), async ({ request }) => {
      await runContractCase(c, { guest: request, student });
    });
  }

  test('make-webhook：無簽章的非 JSON body 被拒', async ({ request }) => {
    // 用 Buffer：content-type 為 JSON 時，Playwright 會把「不是合法 JSON 的字串」自動 JSON.stringify
    const res = await request.post('/api/integration/make-webhook', {
      data: Buffer.from('not-json'),
      headers: { 'content-type': 'application/json' },
      failOnStatusCode: false,
    });
    expect([400, 401]).toContain(res.status());
  });
});

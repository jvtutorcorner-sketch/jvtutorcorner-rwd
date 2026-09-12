/**
 * 對應 skill: .agents/skills/subscriptions-plan-upgrades/SKILL.md
 *
 * 訂閱方案與方案升級單的權限 contract：不能替別人建單、不能自己把單標成 PAID、只看得到自己的單；
 * 金流回調用 HMAC 簽章換到 system 身分。所有請求都針對不存在的升級單，或在寫入前被擋下。
 *
 *   npx playwright test e2e/subscriptions_plan_upgrades_verification.spec.ts --project=chromium
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  IS_HMAC_CONFIGURED,
  contractTitle,
  hmacHeaders,
  runContractCase,
  studentContext,
  type ContractCase,
  type LoggedInProfile,
} from './helpers/auth-helpers';

// 固定值：測試標題含這個路徑，Playwright 主程序與 worker 各載入一次模組，標題必須一致
const UPGRADE = '/api/plan-upgrades/e2e-nonexistent-upgrade';

test.describe('訂閱與方案升級 Verification (subscriptions-plan-upgrades)', () => {
  let student: APIRequestContext;
  let profile: LoggedInProfile;

  test.beforeAll(async () => {
    ({ request: student, profile } = await studentContext());
  });
  test.afterAll(async () => {
    await student?.dispose();
  });

  const CASES: ContractCase[] = [
    { who: 'G', method: 'GET', path: '/api/shared/pricing', expect: 200, note: '訪客定價頁，刻意公開' },

    { who: 'G', method: 'GET', path: '/api/admin/subscriptions', expect: 401 },
    { who: 'S', method: 'GET', path: '/api/admin/subscriptions', expect: 403 },
    { who: 'SYS', method: 'GET', path: '/api/admin/subscriptions', expect: 200 },
    { who: 'SYS', method: 'GET', path: '/api/admin/subscriptions?id=e2e-nonexistent', expect: 404 },
    { who: 'SYS', method: 'POST', path: '/api/admin/subscriptions', body: {}, expect: 400, note: '缺必填設定' },
    { who: 'SYS', method: 'DELETE', path: '/api/admin/subscriptions', expect: 400, note: '缺 id' },

    { who: 'G', method: 'POST', path: '/api/plan-upgrades', body: {}, expect: 401 },
    { who: 'S', method: 'POST', path: '/api/plan-upgrades', body: {}, expect: 400, note: '缺 planId' },
    {
      who: 'S', method: 'POST', path: '/api/plan-upgrades',
      body: { planId: 'e2e-verification', userId: 'someone-else' },
      expect: 403, note: '不能替別人建單',
    },

    { who: 'G', method: 'GET', path: UPGRADE, expect: 401 },
    { who: 'S', method: 'GET', path: UPGRADE, expect: 404 },
    { who: 'S', method: 'PATCH', path: UPGRADE, body: { status: 'PAID' }, expect: 403, note: '只有付款權威能設 PAID' },
    { who: 'S', method: 'PATCH', path: UPGRADE, body: { status: 'PENDING' }, expect: 404 },
    { who: 'G', method: 'PATCH', path: UPGRADE, body: { status: 'PAID' }, expect: 401, note: '未簽章' },
    { who: 'G', method: 'POST', path: UPGRADE, body: {}, expect: 401 },
    { who: 'S', method: 'POST', path: UPGRADE, body: {}, expect: [403, 404], note: '模擬付款' },
  ];
  for (const c of CASES) {
    test(contractTitle(c), async ({ request }) => {
      await runContractCase(c, { guest: request, student });
    });
  }

  test('查詢別人的升級單只會拿到自己的', async () => {
    const res = await student.get('/api/plan-upgrades?userId=someone-else', { failOnStatusCode: false });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const rows: any[] = Array.isArray(body) ? body : body.upgrades || body.items || body.data || [];
    for (const row of rows) expect(row.userId).toBe(profile.userId);
  });

  test('HMAC 簽章的 PATCH PAID 被接受（換到 system 身分 → 查無此單 404）', async ({ request }) => {
    test.skip(!IS_HMAC_CONFIGURED, 'API_HMAC_SECRET 未設定');
    const body = '{"status":"PAID"}';
    const res = await request.patch(UPGRADE, { data: body, headers: hmacHeaders('PATCH', UPGRADE, body), failOnStatusCode: false });
    expect(res.status()).toBe(404);
  });
});

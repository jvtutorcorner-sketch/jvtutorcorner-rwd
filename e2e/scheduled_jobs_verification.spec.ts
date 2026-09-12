/**
 * 對應 skill: .agents/skills/scheduled-jobs/SKILL.md
 *
 * 排程端點的權限 contract。
 * ⚠️ 絕不以 SYS 身分 POST /api/cron/daily-report/status（會產生並寄出報表），
 *    也不測 /api/cron/process-reminders（非正式環境不拒絕任何請求，會掃描並寄信）。
 *
 *   npx playwright test e2e/scheduled_jobs_verification.spec.ts --project=chromium
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { contractTitle, runContractCase, studentContext, type ContractCase } from './helpers/auth-helpers';

test.describe('排程工作 Verification (scheduled-jobs)', () => {
  let student: APIRequestContext;

  test.beforeAll(async () => {
    student = (await studentContext()).request;
  });
  test.afterAll(async () => {
    await student?.dispose();
  });

  const CASES: ContractCase[] = [
    { who: 'G', method: 'GET', path: '/api/cron/daily-report/status', expect: 200, note: '匿名可讀（已知缺口）' },
    { who: 'G', method: 'POST', path: '/api/cron/daily-report/status', body: {}, expect: 401 },
    { who: 'S', method: 'POST', path: '/api/cron/daily-report/status', body: {}, expect: 403 },
  ];
  for (const c of CASES) {
    test(contractTitle(c), async ({ request }) => {
      await runContractCase(c, { guest: request, student });
    });
  }

  test.describe('CRON_SECRET', () => {
    test.skip(!process.env.CRON_SECRET, '未設定 CRON_SECRET 時非正式環境會放行（會真的產生報表），不測');

    const WRONG = [
      { label: 'Authorization: Bearer <錯誤值>', headers: { authorization: 'Bearer e2e-wrong-secret' } as Record<string, string> },
      { label: 'x-cron-token: <錯誤值>', headers: { 'x-cron-token': 'e2e-wrong-secret' } as Record<string, string> },
    ];
    for (const w of WRONG) {
      test(`錯誤的 ${w.label} 被拒`, async ({ request }) => {
        // 排程器用 GET、手動觸發用 POST；兩個方法都不能放行，未實作的方法回 405 也可接受
        const statuses: number[] = [];
        for (const method of ['GET', 'POST'] as const) {
          const res = await request.fetch('/api/cron/daily-report?tier=health', {
            method,
            headers: w.headers,
            failOnStatusCode: false,
          });
          statuses.push(res.status());
        }
        for (const s of statuses) expect([401, 405]).toContain(s);
        expect(statuses).toContain(401);
      });
    }
  });
});

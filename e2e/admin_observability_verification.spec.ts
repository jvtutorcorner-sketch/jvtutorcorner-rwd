/**
 * 對應 skill: .agents/skills/admin-observability/SKILL.md
 *
 * 稽核紀錄、key logs、Agora 連線日誌的權限 contract。
 * ⚠️ 不打 POST /api/agora/connection-log 與 POST /api/client-error：兩者匿名、且不驗證就寫入 DynamoDB。
 *
 *   npx playwright test e2e/admin_observability_verification.spec.ts --project=chromium
 */
import { test, type APIRequestContext } from '@playwright/test';
import {
  contractTitle,
  expectPageRedirect,
  runContractCase,
  studentContext,
  type ContractCase,
} from './helpers/auth-helpers';

test.describe('後台觀測與稽核 Verification (admin-observability)', () => {
  let student: APIRequestContext;

  test.beforeAll(async () => {
    student = (await studentContext()).request;
  });
  test.afterAll(async () => {
    await student?.dispose();
  });

  const CASES: ContractCase[] = [];
  for (const ep of ['audit-logs', 'key-logs', 'agora-logs']) {
    const path = `/api/admin/${ep}?limit=1`;
    CASES.push(
      { who: 'G', method: 'GET', path, expect: 401 },
      { who: 'S', method: 'GET', path, expect: 403 },
      ep === 'agora-logs'
        ? { who: 'SYS', method: 'GET', path, expect: [200, 500], note: '本機沒建 Agora 日誌表時 500' }
        : { who: 'SYS', method: 'GET', path, expect: 200 }
    );
  }
  CASES.push(
    { who: 'G', method: 'POST', path: '/api/admin/agora-logs', body: {}, expect: 401 },
    { who: 'SYS', method: 'POST', path: '/api/admin/agora-logs', body: {}, expect: 400, note: '缺 message' },
    { who: 'G', method: 'POST', path: '/api/agora/connection-event', body: {}, expect: 400, note: '匿名可寫（已知缺口），空 body 被擋' },
    { who: 'G', method: 'POST', path: '/api/agora/quality-event', body: {}, expect: 400, note: '同上' }
  );

  for (const c of CASES) {
    test(contractTitle(c), async ({ request }) => {
      await runContractCase(c, { guest: request, student });
    });
  }

  test('/admin/audit-logs 訪客 → /login', async ({ request }) => {
    const res = await request.get('/admin/audit-logs', { maxRedirects: 0, failOnStatusCode: false });
    await expectPageRedirect(res, 'reason=admin_no_session', '/admin/audit-logs（訪客）');
  });
});

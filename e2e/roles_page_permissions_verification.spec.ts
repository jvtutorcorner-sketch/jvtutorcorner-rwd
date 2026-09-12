/**
 * 對應 skill: .agents/skills/roles-page-permissions/SKILL.md
 *
 * 角色、頁面權限矩陣、App 權限的 API 與頁面 contract。SYS 請求都故意送格式錯誤的資料，在寫入前被擋下。
 *
 *   npx playwright test e2e/roles_page_permissions_verification.spec.ts --project=chromium
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  contractTitle,
  expectPageRedirect,
  runContractCase,
  studentContext,
  type ContractCase,
} from './helpers/auth-helpers';

test.describe('角色與頁面權限 Verification (roles-page-permissions)', () => {
  let student: APIRequestContext;

  test.beforeAll(async () => {
    student = (await studentContext()).request;
  });
  test.afterAll(async () => {
    await student?.dispose();
  });

  const CASES: ContractCase[] = [
    { who: 'G', method: 'GET', path: '/api/admin/settings', expect: 200, note: '刻意公開（feature flag）' },
    { who: 'G', method: 'POST', path: '/api/admin/settings', body: {}, expect: 401 },
    { who: 'S', method: 'POST', path: '/api/admin/settings', body: {}, expect: 403 },
    { who: 'G', method: 'POST', path: '/api/admin/roles', body: { roles: 'bad' }, expect: 401 },
    { who: 'S', method: 'POST', path: '/api/admin/roles', body: { roles: 'bad' }, expect: 403 },
    { who: 'SYS', method: 'POST', path: '/api/admin/roles', body: { roles: 'bad' }, expect: 400, note: 'roles 不是陣列' },
    { who: 'SYS', method: 'POST', path: '/api/admin/roles', body: { roles: [{ id: 'x' }] }, expect: 400, note: '缺 name' },
    { who: 'G', method: 'GET', path: '/api/apps/permissions', expect: 401 },
    { who: 'S', method: 'GET', path: '/api/apps/permissions', expect: 403 },
    { who: 'SYS', method: 'GET', path: '/api/apps/permissions', expect: 200 },
    { who: 'SYS', method: 'POST', path: '/api/apps/permissions', body: {}, expect: 400, note: '缺 appConfigs' },
  ];
  for (const c of CASES) {
    test(contractTitle(c), async ({ request }) => {
      await runContractCase(c, { guest: request, student });
    });
  }

  test('GET /api/admin/roles 公開，但不含敏感欄位', async ({ request }) => {
    const res = await request.get('/api/admin/roles', { failOnStatusCode: false });
    expect(res.status()).toBe(200);
    expect(await res.text()).not.toMatch(/"(password|secret|token|apiKey)"\s*:/i);
  });

  test.describe('頁面守衛', () => {
    const get = (ctx: APIRequestContext, path: string) => ctx.get(path, { maxRedirects: 0, failOnStatusCode: false });

    test('/admin/settings/page-permissions 訪客 → /login', async ({ request }) => {
      await expectPageRedirect(await get(request, '/admin/settings/page-permissions'), 'reason=admin_no_session', '訪客');
    });
    test('/admin/settings/page-permissions 學生 → /dashboard?forbidden=1', async () => {
      await expectPageRedirect(await get(student, '/admin/settings/page-permissions'), 'forbidden=1', '學生');
    });
    test('/apps 學生 → /dashboard?forbidden=1', async () => {
      await expectPageRedirect(await get(student, '/apps'), 'forbidden=1', '學生');
    });
  });
});

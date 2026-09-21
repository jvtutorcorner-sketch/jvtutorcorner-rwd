/**
 * 對應 skill: .agents/skills/server-auth-guards/SKILL.md
 *
 * 伺服器端守門 contract：apiGuard 家族、手寫守衛、HMAC 內部簽章、頁面守衛（server layout）、middleware。
 * 只打唯讀或在寫入前就被擋下的端點；唯一的寫入是最後一支測試登出自己的測試 session。
 *
 *   npx playwright test e2e/server_auth_guards_verification.spec.ts --project=chromium
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  BYPASS_SECRET,
  IS_HMAC_CONFIGURED,
  TEST_STUDENT,
  contractTitle,
  expectPageAllowed,
  expectPageRedirect,
  hmacHeaders,
  hmacHeadersAt,
  runContractCase,
  studentContext,
  teacherContext,
  type ContractCase,
} from './helpers/auth-helpers';

test.describe('伺服器端守門 Verification (server-auth-guards)', () => {
  let student: APIRequestContext;
  let teacher: APIRequestContext;

  test.beforeAll(async () => {
    student = (await studentContext()).request;
    teacher = (await teacherContext()).request;
  });
  test.afterAll(async () => {
    await student?.dispose();
    await teacher?.dispose();
  });

  test.describe('apiGuard 家族', () => {
    const CASES: ContractCase[] = [
      { who: 'G', method: 'GET', path: '/api/admin/key-logs?limit=1', expect: 401, note: 'withAdmin 無 token' },
      { who: 'S', method: 'GET', path: '/api/admin/key-logs?limit=1', expect: 403, note: '角色不符' },
      { who: 'SYS', method: 'GET', path: '/api/admin/key-logs?limit=1', expect: 200, note: 'e2e bypass（非正式環境）' },
      { who: 'SYS', method: 'GET', path: '/api/auth/me', expect: 401, note: '手寫守衛不認 e2e bypass' },
      { who: 'G', method: 'POST', path: '/api/workflows/http-request', body: {}, expect: 401, note: 'withAdminOrHmac' },
      { who: 'S', method: 'POST', path: '/api/workflows/http-request', body: {}, expect: 403, note: 'session 分支限 admin/system' },
    ];
    for (const c of CASES) {
      test(contractTitle(c), async ({ request }) => {
        await runContractCase(c, { guest: request, student, teacher });
      });
    }

    test('偽造的 session cookie 被拒', async ({ request }) => {
      const res = await request.get('/api/admin/key-logs?limit=1', {
        headers: { cookie: 'session=forged.signature' },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(401);
    });

    test('錯誤的 x-e2e-secret 不會變成 system', async ({ request }) => {
      const res = await request.get('/api/admin/key-logs?limit=1', {
        headers: { 'x-e2e-secret': `${BYPASS_SECRET}-wrong` },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(401);
    });

    test('學生的 /api/auth/me 只回自己，且不含密碼欄位', async () => {
      const res = await student.get('/api/auth/me', { failOnStatusCode: false });
      expect(res.status()).toBe(200);
      const text = await res.text();
      expect(text).not.toMatch(/"password(Hash)?"\s*:/i);
      const body = JSON.parse(text);
      const user = body.user || body.profile || body;
      expect(String(user.email).toLowerCase()).toBe(TEST_STUDENT.email.toLowerCase());
    });
  });

  test.describe('HMAC 內部簽章（withAnyAuth／withAdminOrHmac）', () => {
    test.skip(!IS_HMAC_CONFIGURED, 'API_HMAC_SECRET 未設定');
    const PATH = '/api/workflows/http-request';

    test('正確簽章被接受：換到 system 身分、進到欄位驗證 → 400', async ({ request }) => {
      const res = await request.post(PATH, { data: '{}', headers: hmacHeaders('POST', PATH, '{}'), failOnStatusCode: false });
      expect(res.status()).toBe(400);
    });

    test('簽章沒有 query、請求卻帶 query → 401（路徑含 query 一起簽）', async ({ request }) => {
      const res = await request.post(`${PATH}?forged=1`, {
        data: '{}',
        headers: hmacHeaders('POST', PATH, '{}'),
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(401);
    });

    test('body 被竄改 → 401', async ({ request }) => {
      // 竄改後的 body 本身也過不了欄位驗證，就算守衛失效也不會真的對外發請求
      const res = await request.post(PATH, {
        data: '{"url":"ftp://x"}',
        headers: hmacHeaders('POST', PATH, '{}'),
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(401);
    });

    test('時間戳超過 5 分鐘 → 401', async ({ request }) => {
      const res = await request.post(PATH, {
        data: '{}',
        headers: hmacHeadersAt('POST', PATH, '{}', Date.now() - 6 * 60_000),
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(401);
    });

    test('時間戳超前 60 秒 → 401', async ({ request }) => {
      const res = await request.post(PATH, {
        data: '{}',
        headers: hmacHeadersAt('POST', PATH, '{}', Date.now() + 60_000),
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(401);
    });
  });

  test.describe('頁面守衛（server layout）', () => {
    const get = (ctx: APIRequestContext, path: string) =>
      ctx.get(path, { maxRedirects: 0, failOnStatusCode: false });

    test('/admin/roles 訪客 → /login?reason=admin_no_session', async ({ request }) => {
      await expectPageRedirect(await get(request, '/admin/roles'), 'reason=admin_no_session', '/admin/roles（訪客）');
    });
    test('/admin/roles 學生 → /dashboard?forbidden=1', async () => {
      await expectPageRedirect(await get(student, '/admin/roles'), 'forbidden=1', '/admin/roles（學生）');
    });
    test('/workflows 訪客 → /login?reason=workflows_no_session', async ({ request }) => {
      await expectPageRedirect(await get(request, '/workflows'), 'workflows_no_session', '/workflows（訪客）');
    });
    test('/workflows 學生 → /dashboard?forbidden=1', async () => {
      await expectPageRedirect(await get(student, '/workflows'), 'forbidden=1', '/workflows（學生）');
    });
    test('/courses_manage 學生 → /dashboard?forbidden=1', async () => {
      await expectPageRedirect(await get(student, '/courses_manage'), 'forbidden=1', '/courses_manage（學生）');
    });
    test('/courses_manage 老師可進入', async () => {
      await expectPageAllowed(await get(teacher, '/courses_manage'), '/courses_manage（老師）');
    });
    test('/dashboard 學生可進入', async () => {
      await expectPageAllowed(await get(student, '/dashboard'), '/dashboard（學生）');
    });
  });

  test.describe('/api/points：只有 admin／system 能改點數', () => {
    test('學生不能 add／set 自己的點數，但仍可查詢自己的餘額', async () => {
      const { request: ctx, profile } = await studentContext();
      try {
        for (const action of ['add', 'set'] as const) {
          const res = await ctx.post('/api/points', {
            data: { userId: profile.userId, action, amount: 1, reason: 'e2e: self-modify must be rejected' },
            failOnStatusCode: false,
          });
          expect(res.status(), `學生 ${action} 自己的點數`).toBe(403);
        }
        const own = await ctx.get(`/api/points?userId=${encodeURIComponent(profile.userId)}`, { failOnStatusCode: false });
        expect(own.status()).toBe(200);
      } finally {
        await ctx.dispose();
      }
    });

    test('老師不能改學生的點數', async () => {
      const { profile: s } = await studentContext();
      const res = await teacher.post('/api/points', {
        data: { userId: s.userId, action: 'add', amount: 1 },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(403);
    });

    test('system 身分缺欄位 → 400（在寫入前被擋下）', async ({ request }) => {
      const res = await request.post('/api/points', { data: {}, headers: { 'x-e2e-secret': BYPASS_SECRET }, failOnStatusCode: false });
      expect(res.status()).toBe(400);
    });
  });

  test('middleware：API 回應帶 no-store', async ({ request }) => {
    const res = await request.get('/api/ping', { failOnStatusCode: false });
    expect(res.headers()['cache-control'] || '').toContain('no-store');
  });

  test('登出後 session 立即失效', async () => {
    const { request: ctx } = await studentContext();
    try {
      expect((await ctx.get('/api/auth/me', { failOnStatusCode: false })).status()).toBe(200);
      await ctx.post('/api/logout', { failOnStatusCode: false });
      expect((await ctx.get('/api/auth/me', { failOnStatusCode: false })).status()).toBe(401);
    } finally {
      await ctx.dispose();
    }
  });
});

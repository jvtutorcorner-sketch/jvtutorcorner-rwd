import { test, expect } from '@playwright/test';

/**
 * Read-only contract checks for boundaries shared by B2B and B2C.
 *
 * These tests deliberately do not create users, write DynamoDB records, call
 * payment providers, or call an AI provider. They are safe to run against a
 * local server and make missing authentication wiring visible.
 */
test.describe('Enterprise + general feature security contracts', () => {
  const protectedGetRoutes = [
    '/api/auth/me',
    '/api/organizations',
    '/api/licenses',
    '/api/admin/stats',
    '/api/admin/teacher-reviews',
    '/api/admin/teacher-reviews/history',
    '/api/admin/payments',
    '/api/admin/subscriptions',
    '/api/admin/key-logs',
    '/api/admin/ai-models',
    '/api/profile',
    '/api/workflows',
    '/api/calendar/reminders?isAdmin=true',
    // app/integration 設定含第三方 API 金鑰／channel secret，先前 GET 是全表 scan 無 auth。
    '/api/app-integrations',
    '/api/apps/permissions',
  ];

  for (const route of protectedGetRoutes) {
    test(`unauthenticated GET ${route} is rejected`, async ({ request }) => {
      const response = await request.get(route);
      expect([401, 403], `${route} must not expose data to an anonymous request`).toContain(response.status());
    });
  }

  // 這三支 GET 故意保持匿名可讀 —— 不是漏洞：
  //   /api/admin/settings — Header/MenuBar/白板等一般元件（含未登入訪客）靠它拿 feature flag
  //   /api/admin/pricing  — /plans、/pricing/checkout、/settings/pricing 訪客都要看到方案價格
  //   /api/admin/roles    — Header 導覽與企業註冊頁的角色下拉選單，內容只有 id/name/isActive
  // 對應的寫入端點（POST）已個別鎖 admin，見各 route.ts。
  const intentionallyPublicGetRoutes = ['/api/admin/settings', '/api/admin/pricing', '/api/admin/roles'];
  for (const route of intentionallyPublicGetRoutes) {
    test(`unauthenticated GET ${route} stays public (read-only, no PII)`, async ({ request }) => {
      const response = await request.get(route);
      expect(response.status(), `${route} is intentionally public — if this now requires auth, check whether Header/pricing pages still work`).toBe(200);
    });
  }

  // courses POST/PATCH/DELETE 先前完全沒有 auth：任何人都能建立、覆寫（含改 teacherId 過繼
  // 給別人）、刪除任何課程。GET 保持公開（課程目錄本來就要給訪客瀏覽）。
  test('unauthenticated POST /api/courses is rejected (cannot create/overwrite courses anonymously)', async ({ request }) => {
    const response = await request.post('/api/courses', { data: { title: 'forged', teacherName: 'x' } });
    expect([401, 403]).toContain(response.status());
  });

  test('unauthenticated DELETE /api/courses is rejected', async ({ request }) => {
    const response = await request.delete('/api/courses?id=any-course-id');
    expect([401, 403]).toContain(response.status());
  });

  test('unauthenticated PATCH /api/courses/[id] is rejected', async ({ request }) => {
    const response = await request.patch('/api/courses/any-course-id', { data: { title: 'forged' } });
    expect([401, 403]).toContain(response.status());
  });

  test('unauthenticated DELETE /api/courses/[id] is rejected', async ({ request }) => {
    const response = await request.delete('/api/courses/any-course-id');
    expect([401, 403]).toContain(response.status());
  });

  // app-integrations 存放各種第三方服務的明文憑證（LINE channelAccessToken/channelSecret、
  // AI provider apiKey 等）。POST/PUT/DELETE 先前完全沒有 auth，任何人都能寫入/覆寫/刪除
  // 任意 userId 的整合設定。
  test('unauthenticated POST /api/app-integrations is rejected (cannot write integration secrets anonymously)', async ({ request }) => {
    const response = await request.post('/api/app-integrations', {
      data: { userId: 'forged', type: 'LINE', config: { channelAccessToken: 'x' } },
    });
    expect([401, 403]).toContain(response.status());
  });

  test('unauthenticated PUT /api/app-integrations is rejected', async ({ request }) => {
    const response = await request.put('/api/app-integrations', {
      data: { userId: 'forged', type: 'LINE', config: { channelAccessToken: 'x' } },
    });
    expect([401, 403]).toContain(response.status());
  });

  test('unauthenticated DELETE /api/app-integrations is rejected', async ({ request }) => {
    const response = await request.delete('/api/app-integrations?userId=forged&type=LINE');
    expect([401, 403]).toContain(response.status());
  });

  // /api/app-integrations/test 會拿呼叫端提供的 config 去連線外部服務（SMTP host 等），
  // 先前無 auth 等同一個匿名可用的 SSRF/憑證探測工具。
  test('unauthenticated POST /api/app-integrations/test is rejected (no anonymous SSRF/credential probing)', async ({ request }) => {
    const response = await request.post('/api/app-integrations/test', {
      data: { type: 'SMTP', config: { host: 'example.com' } },
    });
    expect([401, 403]).toContain(response.status());
  });

  // /api/line/push 先前無 auth，不帶 userEmail 時會廣播給「所有」已綁定 LINE 的使用者。
  test('unauthenticated POST /api/line/push is rejected (no anonymous mass-messaging)', async ({ request }) => {
    const response = await request.post('/api/line/push', {
      data: { message: 'forged broadcast' },
    });
    expect([401, 403]).toContain(response.status());
  });

  // /api/image-analysis 先前無 auth，任何人都能觸發付費的 AI 視覺模型呼叫。
  test('unauthenticated POST /api/image-analysis is rejected (no anonymous paid AI-provider abuse)', async ({ request }) => {
    const response = await request.post('/api/image-analysis', {
      data: { imageBase64: 'Zm9yZ2Vk' },
    });
    expect([401, 403]).toContain(response.status());
  });

  // /api/ai-chat/dispatch 會呼叫付費的 AI 供應商，bd85fe7 起改為 withAuth：匿名一律 401。
  test('AI dispatch rejects anonymous GET and POST', async ({ request }) => {
    expect((await request.get('/api/ai-chat/dispatch')).status()).toBe(401);
    expect((await request.post('/api/ai-chat/dispatch', { data: {} })).status()).toBe(401);
  });

  test('AI dispatch exposes a read-only agent catalog to an authenticated caller', async ({ request }) => {
    const bypass = process.env.LOGIN_BYPASS_SECRET;
    test.skip(!bypass, 'LOGIN_BYPASS_SECRET is required for the x-e2e-secret system session');
    const response = await request.get('/api/ai-chat/dispatch', { headers: { 'x-e2e-secret': bypass! } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.agents)).toBe(true);
  });

  test('AI dispatch validates an empty query before contacting an AI provider', async ({ request }) => {
    const bypass = process.env.LOGIN_BYPASS_SECRET;
    test.skip(!bypass, 'LOGIN_BYPASS_SECRET is required for the x-e2e-secret system session');
    const response = await request.post('/api/ai-chat/dispatch', { data: {}, headers: { 'x-e2e-secret': bypass! } });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'query required' });
  });

  test('Google callback rejects error and missing-code cases with login redirects', async ({ request }) => {
    const oauthError = await request.get('/api/auth/callback/google?error=access_denied', {
      maxRedirects: 0,
    });
    expect([301, 302, 303, 307, 308]).toContain(oauthError.status());
    expect(oauthError.headers().location).toContain('/login?error=google_auth_failed');

    const missingCode = await request.get('/api/auth/callback/google', { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308]).toContain(missingCode.status());
    expect(missingCode.headers().location).toMatch(/\/login(?:$|\?)/);
  });

  // 這支驗證的是真正的 OIDC 邏輯，不只是「有沒有 redirect」——舊版 prototype 收到任何 code
  // 字串就視為登入成功；現在必須真的去 Google 換 token，換不到（假 code）或沒有合法
  // state cookie 時都要失敗，且絕對不能設下 session cookie 或回傳 google_auth_success=true。
  test('Google callback never grants a session for a forged code/state pair', async ({ request }) => {
    // 帶一組假的 code+state，但完全沒有 /api/auth/google/start 發的 g_oauth cookie。
    const noCookie = await request.get('/api/auth/callback/google?code=forged-code&state=forged-state', {
      maxRedirects: 0,
    });
    expect([301, 302, 303, 307, 308]).toContain(noCookie.status());
    expect(noCookie.headers().location).not.toContain('google_auth_success=true');
    expect(noCookie.headers()['set-cookie'] || '').not.toMatch(/(?:^|;\s*)session=/);

    // 帶一組跟假 cookie 對不上的 state（模擬竄改/重放）。
    const mismatchedState = await request.get(
      '/api/auth/callback/google?code=forged-code&state=wrong-state',
      {
        maxRedirects: 0,
        headers: { Cookie: 'g_oauth=different-state.some-nonce' },
      }
    );
    expect([301, 302, 303, 307, 308]).toContain(mismatchedState.status());
    expect(mismatchedState.headers().location).not.toContain('google_auth_success=true');
    expect(mismatchedState.headers()['set-cookie'] || '').not.toMatch(/(?:^|;\s*)session=/);

    // state 對得上，但 code 是假的：要嘛因為沒設定 GOOGLE_CLIENT_ID 直接拒絕，
    // 要嘛真的去打 Google token endpoint 換不到 token 而失敗 —— 兩種情況都不能成功登入。
    const matchedStateForgedCode = await request.get(
      '/api/auth/callback/google?code=forged-code&state=matching-state',
      {
        maxRedirects: 0,
        headers: { Cookie: 'g_oauth=matching-state.some-nonce' },
      }
    );
    expect([301, 302, 303, 307, 308]).toContain(matchedStateForgedCode.status());
    expect(matchedStateForgedCode.headers().location).not.toContain('google_auth_success=true');
    expect(matchedStateForgedCode.headers()['set-cookie'] || '').not.toMatch(/(?:^|;\s*)session=/);
  });

  test('Google login start route never redirects straight to a fake success without going through Google', async ({ request }) => {
    const response = await request.get('/api/auth/google/start', { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308]).toContain(response.status());
    const location = response.headers().location || '';
    // 沒設定 GOOGLE_CLIENT_ID 時必須老實導回 /login 並帶錯誤碼，不能假裝可以走完整個流程。
    // 有設定時則必須是真的導去 accounts.google.com，不能是任何本地端點。
    if (location.includes('google_sso_not_configured')) {
      expect(location).toContain('/login?error=google_sso_not_configured');
    } else {
      expect(location).toContain('accounts.google.com');
    }
  });
});

import { expect, test } from '@playwright/test';

// Minimal valid 1x1 transparent PNG, used so mime/size/access-boundary tests never
// need to reach a real AI provider — those checks all happen before the provider call.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const BYPASS_SECRET = process.env.LOGIN_BYPASS_SECRET;
const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL;
const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD;

// /learning-content（含其 questionnaire 子路由）由 app/learning-content/layout.tsx 的
// requirePageSession 守門（bd85fe7），匿名會被導向 /login?reason=learning_content_no_session。
// 頁面類案例因此先以真實學生 session 登入；page.request 與瀏覽器共用 cookie。
async function loginAsStudent(page: import('@playwright/test').Page) {
  test.skip(
    !BYPASS_SECRET || !STUDENT_EMAIL || !STUDENT_PASSWORD,
    'Requires TEST_STUDENT_EMAIL/TEST_STUDENT_PASSWORD + LOGIN_BYPASS_SECRET for a real session'
  );
  const loginRes = await page.request.post('/api/login', {
    data: JSON.stringify({ email: STUDENT_EMAIL, password: STUDENT_PASSWORD, captchaToken: '', captchaValue: BYPASS_SECRET }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(loginRes.ok(), 'Test student login must succeed').toBeTruthy();
}

test.describe('learning content analysis module', () => {
  test('anonymous visitors are sent to login from the teaching content page', async ({ page }) => {
    await page.goto('/learning-content');
    await expect(page).toHaveURL(/\/login\?reason=learning_content_no_session/);
  });

  test('teaching content page exposes analysis and learning questionnaire entry points', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/learning-content');

    await expect(page.getByRole('heading', { name: '教材影像分析與學習回饋' })).toBeVisible();
    await expect(page.getByRole('link', { name: '填寫學習需求問卷' })).toHaveAttribute('href', '/learning-content/questionnaire');
    await expect(page.getByRole('button', { name: '選擇教材圖片' })).toBeVisible();
  });

  test('learning content questionnaire entry redirects to the shared learning questionnaire', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/learning-content/questionnaire');
    await expect(page).toHaveURL(/\/questionnaire\/learning$/);
  });

  test('legacy medicine and product pages redirect to the teaching module', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/medicine-product');
    await expect(page).toHaveURL(/\/learning-content$/);

    await page.goto('/product-scan');
    await expect(page).toHaveURL(/\/learning-content$/);

    await page.goto('/products');
    await expect(page).toHaveURL(/\/learning-content$/);

    await page.goto('/products/add');
    await expect(page).toHaveURL(/\/learning-content$/);

    await page.goto('/medicine-product/questionnaire');
    await expect(page).toHaveURL(/\/questionnaire\/learning$/);
  });

  test('learning content analysis API rejects anonymous requests', async ({ request }) => {
    const response = await request.post('/api/learning-content-analysis', {
      data: { imageBase64: 'not-authorized' },
    });
    expect(response.status()).toBe(401);
  });

  test('legacy scan API no longer grants points anonymously', async ({ request }) => {
    const response = await request.post('/api/scan-product', {
      multipart: {
        image: {
          name: 'lesson.png',
          mimeType: 'image/png',
          buffer: Buffer.from('not-a-real-image'),
        },
      },
    });
    expect(response.status()).toBe(401);
  });

  test('unsupported image MIME type is rejected with 415', async ({ page }) => {
    test.skip(!BYPASS_SECRET, 'Requires LOGIN_BYPASS_SECRET fixture for authenticated request');

    const response = await page.request.post('/api/learning-content-analysis', {
      headers: { 'x-e2e-secret': String(BYPASS_SECRET) },
      data: { imageBase64: TINY_PNG_BASE64, mimeType: 'application/pdf' },
    });
    expect(response.status()).toBe(415);
  });

  test('oversized image payload is rejected with 413', async ({ page }) => {
    test.skip(!BYPASS_SECRET, 'Requires LOGIN_BYPASS_SECRET fixture for authenticated request');

    const oversized = 'A'.repeat(10 * 1024 * 1024 + 1024);
    const response = await page.request.post('/api/learning-content-analysis', {
      headers: { 'x-e2e-secret': String(BYPASS_SECRET) },
      data: { imageBase64: oversized, mimeType: 'image/png' },
    });
    expect(response.status()).toBe(413);
  });

  test('learning content analysis with an unpurchased courseId is rejected with 403', async ({ page }) => {
    test.skip(
      !BYPASS_SECRET || !STUDENT_EMAIL || !STUDENT_PASSWORD,
      'Requires TEST_STUDENT_EMAIL/TEST_STUDENT_PASSWORD + LOGIN_BYPASS_SECRET fixtures for a real non-admin session'
    );

    const loginRes = await page.request.post('/api/login', {
      data: JSON.stringify({
        email: STUDENT_EMAIL,
        password: STUDENT_PASSWORD,
        captchaToken: '',
        captchaValue: BYPASS_SECRET,
      }),
      headers: { 'Content-Type': 'application/json', 'X-E2E-Secret': String(BYPASS_SECRET) },
    });
    expect(loginRes.ok(), 'Test student login must succeed for this fixture to be usable').toBeTruthy();

    // Real student session (not admin/system), so verifyCourseAccess actually runs.
    // A random courseId this student never enrolled in and has no license for.
    const response = await page.request.post('/api/learning-content-analysis', {
      data: {
        imageBase64: TINY_PNG_BASE64,
        mimeType: 'image/png',
        courseId: `e2e-not-enrolled-${Date.now()}`,
      },
    });
    expect(response.status()).toBe(403);
  });

  test('UI shows an understandable error when the analysis API is unavailable or returns no result', async ({ page }) => {
    // The real route talks to DynamoDB + a paid AI provider once auth/mime/size/course
    // checks pass — not something a routine CI run should trigger. This test instead
    // verifies the page's own error handling by intercepting the fetch and returning the
    // exact failure shape the route documents for an unconfigured/invalid-result provider.
    await page.route('**/api/learning-content-analysis', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'AI learning-content analysis is not configured' }),
      })
    );

    await loginAsStudent(page);
    await page.goto('/learning-content');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'note.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });
    // The analyze button only calls the API once the async FileReader preview resolves.
    await expect(page.locator('img[alt="教材預覽"]')).toBeVisible();
    await page.getByRole('button', { name: '開始分析教材' }).click();

    const errorBanner = page.locator('p.text-red-700');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toHaveText('AI learning-content analysis is not configured');
  });

  test('learning questionnaire main flow still submits and calls /api/questionnaire', async ({ page }) => {
    const submitRequest = page.waitForRequest(
      (req) => req.url().includes('/api/questionnaire') && req.method() === 'POST'
    );
    const submitResponse = page.waitForResponse(
      (res) => res.url().includes('/api/questionnaire') && res.request().method() === 'POST'
    );

    await page.goto('/questionnaire/learning');

    // S0 — terms
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: '下一步' }).click();

    // S1 — role
    await page.getByRole('button', { name: /學生本人/ }).click();
    await page.getByRole('button', { name: '下一步' }).click();

    // S2 — basic info (no required fields)
    await page.getByRole('button', { name: '下一步' }).click();

    // S3 — subjects
    await page.getByRole('button', { name: '數學', exact: true }).click();
    await page.getByRole('button', { name: '下一步' }).click();

    // S4 — goals
    await page.getByRole('button', { name: '興趣培養', exact: true }).click();
    await page.getByRole('button', { name: '下一步' }).click();

    // S5 — scheduling (no required fields)
    await page.getByRole('button', { name: '下一步' }).click();

    // S6 — preferences (no required fields), last data step submits on next click
    await page.getByRole('button', { name: '提交問卷' }).click();

    const request = await submitRequest;
    expect(request.postDataJSON()?.mode).toBe('learning');

    const response = await submitResponse;
    const body = await response.json().catch(() => ({}));

    // This flow is a pre-existing, reused questionnaire pipeline (lib/questionnaireService.ts),
    // not part of the learning-content-analysis rework — the assertion below still requires a
    // real successful save. If the environment's DynamoDB table for submissions genuinely isn't
    // provisioned, that's an infrastructure gap to report as BLOCKED, not a reason to weaken this
    // check for a different, real bug.
    const isMissingTableInfra = !response.ok() && /resource not found/i.test(String(body?.error || ''));
    test.skip(
      isMissingTableInfra,
      `BLOCKED: DynamoDB table for questionnaire submissions is not provisioned in this environment (${body?.error}). ` +
        'The UI correctly called POST /api/questionnaire with the right payload; the failure is infra, not this module.'
    );

    expect(response.ok()).toBeTruthy();
    expect(body.success).toBeTruthy();
    expect(typeof body.submissionId).toBe('string');

    await expect(page.getByRole('heading', { name: '問卷填寫完成！' })).toBeVisible();
  });
});

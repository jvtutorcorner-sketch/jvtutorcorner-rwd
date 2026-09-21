/**
 * 對應 skill: .agents/skills/object-storage-uploads/SKILL.md
 *
 * 上傳／presign／代理讀取的權限與路徑穿越 contract。所有上傳請求都故意不帶檔案或缺必填欄位，
 * 在寫入物件儲存之前就被擋下；代理讀取只讀不存在的 key。
 *
 *   npx playwright test e2e/object_storage_uploads_verification.spec.ts --project=chromium
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  contractTitle,
  runContractCase,
  studentContext,
  teacherContext,
  type ContractCase,
} from './helpers/auth-helpers';

test.describe('物件儲存與上傳 Verification (object-storage-uploads)', () => {
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

  const NO_FILE = { alt: 'e2e-verification' };
  const CASES: ContractCase[] = [
    { who: 'G', method: 'GET', path: '/api/carousel', expect: 200, note: '首頁輪播，刻意公開' },
    { who: 'G', method: 'POST', path: '/api/carousel', body: {}, expect: 401 },
    { who: 'S', method: 'PATCH', path: '/api/carousel', body: {}, expect: 403 },
    { who: 'S', method: 'DELETE', path: '/api/carousel?id=e2e-nonexistent', expect: 403 },

    { who: 'G', method: 'POST', path: '/api/carousel/upload', multipart: NO_FILE, expect: 401 },
    { who: 'S', method: 'POST', path: '/api/carousel/upload', multipart: NO_FILE, expect: 403 },
    { who: 'SYS', method: 'POST', path: '/api/carousel/upload', multipart: NO_FILE, expect: 400, note: '沒有檔案' },

    { who: 'G', method: 'POST', path: '/api/carousel/presign', body: {}, expect: 401 },
    { who: 'S', method: 'POST', path: '/api/carousel/presign', body: {}, expect: 403 },
    { who: 'SYS', method: 'POST', path: '/api/carousel/presign', body: {}, expect: 400, note: '缺 fileName／mimeType' },

    { who: 'G', method: 'POST', path: '/api/avatar/upload', multipart: NO_FILE, expect: 401 },
    { who: 'S', method: 'POST', path: '/api/avatar/upload', multipart: NO_FILE, expect: 403, note: '限 teacher／admin' },
    { who: 'T', method: 'POST', path: '/api/avatar/upload', multipart: NO_FILE, expect: 400, note: '沒有檔案' },

    { who: 'G', method: 'POST', path: '/api/whiteboard/presign', body: {}, expect: 401 },
    { who: 'S', method: 'POST', path: '/api/whiteboard/presign', body: {}, expect: 400, note: '缺 uuid／fileName' },

    { who: 'G', method: 'POST', path: '/api/courses/e2e-nonexistent/materials/presign', body: {}, expect: 401 },
    { who: 'S', method: 'POST', path: '/api/courses/e2e-nonexistent/materials/presign', body: {}, expect: 403 },
    { who: 'T', method: 'POST', path: '/api/courses/e2e-nonexistent/materials/presign', body: {}, expect: 400, note: '缺 fileName' },

    { who: 'G', method: 'GET', path: '/api/whiteboard/pdf', expect: 401 },
    { who: 'S', method: 'GET', path: '/api/whiteboard/pdf', expect: 400, note: '缺 uuid' },
    { who: 'G', method: 'DELETE', path: '/api/whiteboard/pdf', expect: 401 },

    { who: 'G', method: 'GET', path: '/api/uploads/whiteboard/e2e-nonexistent.pdf', expect: 404 },
    { who: 'G', method: 'GET', path: '/api/uploads/avatar/e2e-nonexistent.png', expect: [404, 302, 307], note: 'USE_S3_REDIRECT 時為 3xx' },
    { who: 'G', method: 'GET', path: '/api/uploads/carousel/e2e-nonexistent.png', expect: [404, 500, 302, 307], note: '沒設 bucket 時 500（與 avatar 不一致）' },
  ];
  for (const c of CASES) {
    test(contractTitle(c), async ({ request }) => {
      await runContractCase(c, { guest: request, student, teacher });
    });
  }

  test.describe('代理讀取的路徑穿越', () => {
    const TRAVERSAL: Array<[string, number]> = [
      ['/api/uploads/avatar/..%2F..%2Fpackage.json', 400],
      ['/api/uploads/carousel/..%2F..%2Fpackage.json', 400],
      ['/api/uploads/whiteboard/..%2Fwhiteboard-x%2Fa.pdf', 403],
      ['/api/uploads/whiteboard/..%2F..%2Fpackage.json', 403],
    ];
    for (const [path, status] of TRAVERSAL) {
      test(`${path} → ${status}，且不洩漏檔案內容`, async ({ request }) => {
        const res = await request.get(path, { maxRedirects: 0, failOnStatusCode: false });
        expect(res.status()).toBe(status);
        const text = await res.text();
        expect(text).not.toContain('"dependencies"');
      });
    }
  });
});

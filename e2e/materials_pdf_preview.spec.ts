import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import {
  BASE_URL,
  loginViaApi,
  createAndApproveTestCourse,
  createActiveEnrollment,
  deleteEnrollment,
  cleanupCourseAndOrders,
} from './helpers/attendance-materials-helpers';

const APP_ENV = process.env.APP_ENV || 'local';
dotenv.config({ path: path.resolve(__dirname, '..', `.env.${APP_ENV}`) });

function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  throw new Error(`Missing required environment variable(s): ${keys.join(', ')}`);
}

const TEST_PDF_PATH = path.resolve(__dirname, '..', 'public', 'test-pdfs', 'test-single-page.pdf');
const TEST_PDF_NAME = 'test-single-page.pdf';

test.describe('講義線上預覽 Verification (materials-pdf-preview)', () => {
  const LOGIN_BYPASS_SECRET = requireEnv('LOGIN_BYPASS_SECRET', 'NEXT_PUBLIC_LOGIN_BYPASS_SECRET');
  const TEACHER_EMAIL = process.env.TEST_TEACHER_EMAIL || 'lin@test.com';
  const TEACHER_PASSWORD = requireEnv('TEST_TEACHER_PASSWORD', 'QA_TEACHER_PASSWORD');
  const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL || 'basic@test.com';
  const STUDENT_PASSWORD = requireEnv('TEST_STUDENT_PASSWORD', 'QA_STUDENT_PASSWORD');

  let courseId: string;
  let materialKey: string;
  let enrollmentId: string;

  test.afterAll(async ({ request }) => {
    if (enrollmentId) {
      await deleteEnrollment(request, enrollmentId);
    }
    if (courseId) {
      await cleanupCourseAndOrders(request, courseId);
    }
  });

  test('教師上傳教材 → 未報名學生被擋下 → 已報名學生可預覽且無法直接下載', async ({ browser }) => {
    test.setTimeout(120000);

    // --- 教師建立課程並上傳教材 ---
    const teacherContext = await browser.newContext();
    const teacherProfile = await loginViaApi(teacherContext.request, TEACHER_EMAIL, TEACHER_PASSWORD, LOGIN_BYPASS_SECRET);
    const course = await createAndApproveTestCourse(teacherContext.request, {
      teacherId: teacherProfile.userId,
      bypassSecret: LOGIN_BYPASS_SECRET,
      titlePrefix: 'E2E 教材預覽測試課程',
    });
    courseId = course.courseId;

    const presignRes = await teacherContext.request.post(`${BASE_URL}/api/courses/${courseId}/materials/presign`, {
      data: JSON.stringify({ fileName: TEST_PDF_NAME, contentType: 'application/pdf' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(presignRes.status(), 'presign 應成功（需要真實 S3 bucket 設定）').toBe(200);
    const presignBody = await presignRes.json();
    materialKey = presignBody.key;
    expect(materialKey).toContain(`course-materials/${courseId}/`);

    const pdfBytes = fs.readFileSync(TEST_PDF_PATH);
    const putRes = await teacherContext.request.put(presignBody.url, {
      data: pdfBytes,
      headers: { 'Content-Type': 'application/pdf' },
    });
    expect(putRes.ok(), 'PUT 至 S3 presigned URL 應成功').toBeTruthy();

    const patchRes = await teacherContext.request.patch(`${BASE_URL}/api/courses/${courseId}/materials`, {
      data: JSON.stringify({ key: materialKey, name: TEST_PDF_NAME, size: pdfBytes.length }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(patchRes.status()).toBe(200);

    const listRes = await teacherContext.request.get(`${BASE_URL}/api/courses/${courseId}/materials`);
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    expect((listBody.materials || []).some((m: { key: string }) => m.key === materialKey)).toBe(true);
    console.log(`✅ 教師成功上傳教材並寫入課程紀錄: ${materialKey}`);
    await teacherContext.close();

    // --- 未登入訪客：課程頁只看得到登入提示，直接打 preview API 應 401 ---
    const guestContext = await browser.newContext();
    const guestPageRes = await guestContext.request.get(`${BASE_URL}/courses/${courseId}`);
    expect(guestPageRes.status()).toBe(200);
    const guestHtml = await guestPageRes.text();
    expect(guestHtml).toContain('請先');
    expect(guestHtml).not.toContain(TEST_PDF_NAME);

    const guestPreviewRes = await guestContext.request.get(
      `${BASE_URL}/api/courses/${courseId}/materials/preview?key=${encodeURIComponent(materialKey)}`
    );
    expect(guestPreviewRes.status(), '未登入直接打預覽 API 應回 401').toBe(401);
    await guestContext.close();
    console.log('✅ 未登入訪客被正確擋下');

    // --- 未報名學生：課程頁顯示「報名後即可預覽」，preview API 應 403 ---
    const studentContext = await browser.newContext();
    const studentProfile = await loginViaApi(studentContext.request, STUDENT_EMAIL, STUDENT_PASSWORD, LOGIN_BYPASS_SECRET);

    const unenrolledPageRes = await studentContext.request.get(`${BASE_URL}/courses/${courseId}`);
    expect(unenrolledPageRes.status()).toBe(200);
    const unenrolledHtml = await unenrolledPageRes.text();
    expect(unenrolledHtml).toContain('報名課程後即可預覽');

    const unenrolledPreviewRes = await studentContext.request.get(
      `${BASE_URL}/api/courses/${courseId}/materials/preview?key=${encodeURIComponent(materialKey)}`
    );
    expect(unenrolledPreviewRes.status(), '未報名學生直接打預覽 API 應回 403').toBe(403);
    console.log('✅ 未報名學生被正確擋下');

    // 跨課程 key 防護：帶一個不屬於此課程前綴的 key
    const crossCourseRes = await studentContext.request.get(
      `${BASE_URL}/api/courses/${courseId}/materials/preview?key=${encodeURIComponent('course-materials/not-this-course/x.pdf')}`
    );
    expect(crossCourseRes.status(), '不屬於此課程前綴的 key 應回 400').toBe(400);
    console.log('✅ 跨課程 key 防護正確擋下');

    // --- 幫該學生建立一筆 ACTIVE 報名紀錄，使其成為已報名學生 ---
    // 注意：verifyCourseAccess() 檢查的是 jvtutorcorner-enrollments 表，不是 orders 表，
    // 所以這裡要用 /api/enroll，而不是像 attendance 測試那樣建立訂單。
    const enrollment = await createActiveEnrollment(studentContext.request, {
      courseId,
      courseTitle: course.title,
      name: 'E2E Test Student',
      email: studentProfile.email,
    });
    enrollmentId = enrollment.enrollmentId;

    const enrolledPageRes = await studentContext.request.get(`${BASE_URL}/courses/${courseId}`);
    expect(enrolledPageRes.status()).toBe(200);
    const enrolledHtml = await enrolledPageRes.text();
    expect(enrolledHtml, '已報名學生應能在課程頁看到教材檔名').toContain(TEST_PDF_NAME);

    const enrolledPreviewRes = await studentContext.request.get(
      `${BASE_URL}/api/courses/${courseId}/materials/preview?key=${encodeURIComponent(materialKey)}`
    );
    expect(enrolledPreviewRes.status(), '已報名學生應能取得教材').toBe(200);
    expect(enrolledPreviewRes.headers()['content-type']).toContain('application/pdf');
    expect(enrolledPreviewRes.headers()['content-disposition']).toBe('inline');
    expect(enrolledPreviewRes.headers()['cache-control']).toContain('no-store');
    const bodyBuffer = await enrolledPreviewRes.body();
    expect(bodyBuffer.subarray(0, 4).toString('utf8'), '回應內容應為合法 PDF (魔數 %PDF)').toBe('%PDF');
    console.log('✅ 已報名學生可成功預覽教材，且回應標頭正確禁止快取/下載');

    await studentContext.close();
  });
});

/**
 * 手動驗證（不納入自動化，需在瀏覽器中肉眼確認）：
 *   1. 已報名學生開啟 /courses/{id}，點擊教材 → 確認 canvas 渲染出 PDF 內容，
 *      畫面上「沒有」任何下載按鈕。
 *   2. 在預覽視窗內按右鍵 → 確認瀏覽器右鍵選單被封鎖（不會跳出「另存圖片」）。
 *   3. 開啟瀏覽器 DevTools Network 分頁，確認 materials/preview 請求的
 *      Response Headers 含 Content-Disposition: inline 與 Cache-Control: private, no-store。
 */

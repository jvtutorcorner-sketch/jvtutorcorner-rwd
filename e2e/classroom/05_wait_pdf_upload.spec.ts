/**
 * 05 — Wait Page PDF Upload Verification
 *
 * Validates the teacher-only PDF upload flow on /classroom/wait:
 *   1) Teacher can see upload control and upload a PDF file.
 *   2) Upload success dialog is shown.
 *   3) Uploaded PDF metadata is queryable via /api/whiteboard/pdf?check=1.
 *   4) Student does not see PDF upload control on /classroom/wait.
 */

import { test, expect, type Page } from '@playwright/test';
import {
  autoLogin,
  injectDeviceCheckBypass,
  createCourseAsTeacherWithDuration,
  adminApproveCourse,
  runEnrollmentFlow,
  goToWaitRoom,
} from '../helpers/whiteboard_helpers';
import { getTestConfig, ADMIN_EMAIL, ADMIN_PASSWORD } from '../test_data/whiteboard_test_data';

function buildSamplePdfBuffer(): Buffer {
  // Minimal payload; backend stores bytes and metadata.
  return Buffer.from('%PDF-1.4\n%JV-WAIT-PDF-UPLOAD-TEST\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
}

async function waitForPdfMetadata(
  page: Page,
  baseUrl: string,
  sessionKey: string,
  maxAttempts = 15
): Promise<any | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await page.request.get(
      `${baseUrl}/api/whiteboard/pdf?uuid=${encodeURIComponent(sessionKey)}&check=1`
    ).catch(() => null);

    if (res?.ok()) {
      const json = await res.json().catch(() => null);
      if (json?.found) {
        return json;
      }
    }

    await page.waitForTimeout(1000);
  }

  return null;
}

test.describe('[wait-pdf] Teacher PDF Upload Verification', () => {
  test.setTimeout(360_000);

  test('teacher uploads PDF on /classroom/wait and student cannot see uploader', async ({ browser }) => {
    const config = getTestConfig();
    const courseId = `wait-pdf-${Date.now()}`;
    const pdfFileName = 'wait-upload-test.pdf';
    const pdfBuffer = buildSamplePdfBuffer();

    const setupCtx = await browser.newContext();
    const setupPage = await setupCtx.newPage();

    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();

    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();

    try {
      console.log(`\n📍 Setup course for wait-pdf test: ${courseId}`);
      await createCourseAsTeacherWithDuration(
        setupPage,
        courseId,
        config.teacherEmail,
        config.teacherPassword,
        config.bypassSecret,
        5
      );

      const adminCtx = await browser.newContext();
      const adminPage = await adminCtx.newPage();
      await adminApproveCourse(adminPage, courseId, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
      await adminCtx.close();

      runEnrollmentFlow(courseId, config.teacherEmail, config.studentEmail);

      console.log('📍 Navigate teacher to /classroom/wait and upload PDF');
      await injectDeviceCheckBypass(teacherPage);
      await autoLogin(teacherPage, config.teacherEmail, config.teacherPassword, config.bypassSecret);
      await goToWaitRoom(teacherPage, courseId, 'teacher');
      await expect(teacherPage).toHaveURL(/\/classroom\/wait/, { timeout: 30000 });

      const fileInput = teacherPage.locator('input[type="file"][accept="application/pdf"]');
      await expect(fileInput).toHaveCount(1);

      const dialogPromise = teacherPage.waitForEvent('dialog', { timeout: 120000 });
      await fileInput.setInputFiles({
        name: pdfFileName,
        mimeType: 'application/pdf',
        buffer: pdfBuffer,
      });

      const dialog = await dialogPromise;
      const dialogMessage = dialog.message();
      await dialog.accept();

      expect(dialogMessage).toContain('PDF 上傳成功');
      await expect(teacherPage.locator(`text=已選擇: ${pdfFileName}`)).toBeVisible({ timeout: 10000 });

      const sessionKey = new URL(teacherPage.url()).searchParams.get('session') || '';
      expect(sessionKey.length).toBeGreaterThan(0);

      const metadata = await waitForPdfMetadata(teacherPage, config.baseUrl, sessionKey);
      expect(metadata?.found).toBe(true);
      if (metadata?.meta?.name) {
        expect(String(metadata.meta.name)).toContain('.pdf');
      }

      console.log('📍 Navigate student to /classroom/wait and verify uploader hidden');
      await injectDeviceCheckBypass(studentPage);
      await autoLogin(studentPage, config.studentEmail, config.studentPassword, config.bypassSecret);
      await goToWaitRoom(studentPage, courseId, 'student');
      await expect(studentPage).toHaveURL(/\/classroom\/wait/, { timeout: 30000 });
      await expect(studentPage.locator('input[type="file"][accept="application/pdf"]')).toHaveCount(0);
    } finally {
      try {
        const cleanupCtx = await browser.newContext();
        const cleanupPage = await cleanupCtx.newPage();
        await injectDeviceCheckBypass(cleanupPage);
        await autoLogin(cleanupPage, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
        await cleanupPage.request.delete(`${config.baseUrl}/api/courses?id=${courseId}`).catch(() => {});
        await cleanupPage.request.delete(`${config.baseUrl}/api/orders?courseId=${courseId}`).catch(() => {});
        await cleanupCtx.close();
      } catch (cleanupError) {
        console.warn('Cleanup failed for wait-pdf test:', cleanupError);
      }

      await setupCtx.close();
      await teacherCtx.close();
      await studentCtx.close();
    }
  });
});

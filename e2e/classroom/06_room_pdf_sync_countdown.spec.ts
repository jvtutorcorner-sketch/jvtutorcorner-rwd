/**
 * 06 - Room PDF render/sync + countdown precision
 *
 * Validates:
 * 1) Teacher-uploaded PDF on /classroom/wait is rendered in /classroom/room.
 * 2) Multi-page PDF page switching is synchronized from teacher to student.
 * 3) Classroom countdown starts from the expected order duration (no +5s offset).
 *
 * Static PDF assets in public/test-pdfs/ are used when available.
 * Falls back to jsPDF dynamic generation if static files are missing.
 */

import { test, expect, type Browser, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import {
  autoLogin,
  injectDeviceCheckBypass,
  createCourseAsTeacherWithDuration,
  adminApproveCourse,
  runEnrollmentFlow,
  goToWaitRoom,
  enterClassroom,
  clickReadyButton,
  waitAndEnterClassroom,
  loadStaticPdf,
  STATIC_PDFS,
} from '../helpers/whiteboard_helpers';
import { getTestConfig, ADMIN_EMAIL, ADMIN_PASSWORD } from '../test_data/whiteboard_test_data';


type RoomSceneState = {
  scenePath: string;
  index: number;
  sceneCount: number;
};

/**
 * Load a PDF buffer for upload.
 * Priority: static fixture from public/test-pdfs/ → jsPDF dynamic fallback.
 */
function getPdfBuffer(staticFilename: string, pageCount: number, label: string): Buffer {
  try {
    return loadStaticPdf(staticFilename);
  } catch {
    // Fallback: generate dynamically with jsPDF
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { jsPDF } = require('jspdf');
    console.warn(`[room-pdf] Static PDF not found (${staticFilename}), generating with jsPDF...`);
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    for (let i = 1; i <= pageCount; i++) {
      if (i > 1) doc.addPage();
      doc.setFontSize(18);
      doc.text(`E2E PDF ${label} - page ${i}`, 40, 64);
      doc.setFontSize(11);
      doc.text(`generated: ${new Date().toISOString()}`, 40, 86);
    }
    return Buffer.from(doc.output('arraybuffer') as ArrayBuffer);
  }
}

async function waitForPdfMetadata(
  page: Page,
  baseUrl: string,
  sessionKey: string,
  maxAttempts = 20
): Promise<any | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await page.request
      .get(`${baseUrl}/api/whiteboard/pdf?uuid=${encodeURIComponent(sessionKey)}&check=1`)
      .catch(() => null);

    if (res?.ok()) {
      const json = await res.json().catch(() => null);
      if (json?.found) return json;
    }

    await page.waitForTimeout(1000);
  }

  return null;
}

async function getRoomSceneState(page: Page): Promise<RoomSceneState | null> {
  return page.evaluate(() => {
    const room = (window as any).agoraRoom;
    const sceneState = room?.state?.sceneState;
    if (!sceneState) return null;

    return {
      scenePath: String(sceneState.scenePath || ''),
      index: Number(sceneState.index || 0),
      sceneCount: Array.isArray(sceneState.scenes) ? sceneState.scenes.length : 0,
    };
  });
}

async function waitForPdfSceneLoaded(page: Page, timeoutMs = 120000): Promise<RoomSceneState> {
  await page.waitForFunction(() => {
    const room = (window as any).agoraRoom;
    const scenePath = room?.state?.sceneState?.scenePath;
    return typeof scenePath === 'string' && scenePath.includes('/pdf/');
  }, { timeout: timeoutMs });

  const state = await getRoomSceneState(page);
  if (!state) throw new Error('Scene state unavailable after PDF scene was expected');
  return state;
}

async function setTeacherSceneIndex(page: Page, targetIndex: number): Promise<void> {
  const ok = await page.evaluate((idx) => {
    const room = (window as any).agoraRoom;
    const scenes = room?.state?.sceneState?.scenes;
    if (!room || !room.setSceneIndex || !Array.isArray(scenes)) return false;
    if (idx < 0 || idx >= scenes.length) return false;
    room.setSceneIndex(idx);
    return true;
  }, targetIndex);

  expect(ok).toBe(true);
}

async function waitForSceneIndex(page: Page, expectedIndex: number, timeoutMs = 30000): Promise<void> {
  await expect
    .poll(async () => {
      const state = await getRoomSceneState(page);
      return state?.index ?? -1;
    }, { timeout: timeoutMs, intervals: [500, 1000] })
    .toBe(expectedIndex);
}

function extractOrderSeconds(order: any): number | null {
  if (!order) return null;

  if (order.remainingSeconds !== undefined && order.remainingSeconds !== null) {
    const sec = Number(order.remainingSeconds);
    if (!Number.isNaN(sec)) return sec;
  }
  if (order.remainingMinutes !== undefined && order.remainingMinutes !== null) {
    const sec = Number(order.remainingMinutes) * 60;
    if (!Number.isNaN(sec)) return sec;
  }
  if (order.durationMinutes !== undefined && order.durationMinutes !== null) {
    const sec = Number(order.durationMinutes) * 60;
    if (!Number.isNaN(sec)) return sec;
  }

  return null;
}

async function fetchExpectedRemainingSeconds(
  page: Page,
  baseUrl: string,
  courseId: string,
  fallbackSeconds: number
): Promise<number> {
  const currentUrl = new URL(page.url());
  const orderId = currentUrl.searchParams.get('orderId');

  if (orderId) {
    const orderRes = await page.request.get(`${baseUrl}/api/orders/${encodeURIComponent(orderId)}`).catch(() => null);
    if (orderRes?.ok()) {
      const orderJson = await orderRes.json().catch(() => null);
      const sec = extractOrderSeconds(orderJson?.order);
      if (sec !== null) return sec;
    }
  }

  const listRes = await page.request
    .get(`${baseUrl}/api/orders?courseId=${encodeURIComponent(courseId)}`)
    .catch(() => null);
  if (listRes?.ok()) {
    const listJson = await listRes.json().catch(() => null);
    const orders = Array.isArray(listJson?.data) ? listJson.data : [];
    if (orders.length > 0) {
      const latest = [...orders].sort((a: any, b: any) => {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      })[0];
      const sec = extractOrderSeconds(latest);
      if (sec !== null) return sec;
    }
  }

  return fallbackSeconds;
}

async function readLargestCountdownSeconds(page: Page): Promise<number> {
  await page.waitForFunction(() => {
    const all = Array.from(document.querySelectorAll('div, span'));
    return all.some((el) => /(\d+):([0-5]\d)/.test((el.textContent || '').trim()));
  }, { timeout: 45000 });

  const result = await page.evaluate(() => {
    let largest = -1;
    const all = Array.from(document.querySelectorAll('div, span'));

    for (const el of all) {
      const text = (el.textContent || '').trim();
      const matches = text.match(/(\d+):([0-5]\d)/g);
      if (!matches) continue;

      for (const m of matches) {
        const parsed = m.match(/^(\d+):([0-5]\d)$/);
        if (!parsed) continue;
        const sec = Number(parsed[1]) * 60 + Number(parsed[2]);
        if (sec > largest) largest = sec;
      }
    }

    return largest;
  });

  if (result < 0) throw new Error('Could not read countdown text from room page');
  return result;
}

async function readCountdownSecondsNearest(page: Page, targetSeconds: number): Promise<number> {
  await page.waitForFunction(() => {
    const isVisible = (el: Element): boolean => {
      const win = window as any;
      const style = win.getComputedStyle(el);
      const rect = (el as HTMLElement).getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    const all = Array.from(document.querySelectorAll('div, span, strong'));
    return all.some((el) => {
      if (!isVisible(el)) return false;
      return /^(\d+):([0-5]\d)$/.test((el.textContent || '').trim());
    });
  }, { timeout: 45000 });

  const candidates = await page.evaluate(() => {
    const isVisible = (el: Element): boolean => {
      const win = window as any;
      const style = win.getComputedStyle(el);
      const rect = (el as HTMLElement).getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    const secs: number[] = [];
    const all = Array.from(document.querySelectorAll('div, span, strong'));
    for (const el of all) {
      if (!isVisible(el)) continue;
      const text = (el.textContent || '').trim();
      const parsed = text.match(/^(\d+):([0-5]\d)$/);
      if (!parsed) continue;
      secs.push(Number(parsed[1]) * 60 + Number(parsed[2]));
    }
    return secs;
  });

  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Could not read visible countdown candidate in room page');
  }

  let nearest = candidates[0];
  let nearestDiff = Math.abs(candidates[0] - targetSeconds);
  for (const sec of candidates) {
    const diff = Math.abs(sec - targetSeconds);
    if (diff < nearestDiff) {
      nearest = sec;
      nearestDiff = diff;
    }
  }

  return nearest;
}

async function uploadPdfOnWaitPage(
  teacherPage: Page,
  fileName: string,
  buffer: Buffer
): Promise<string> {
  const fileInput = teacherPage.locator('input[type="file"][accept="application/pdf"]');
  await expect(fileInput).toHaveCount(1);

  const dialogPromise = teacherPage.waitForEvent('dialog', { timeout: 120000 });
  await fileInput.setInputFiles({
    name: fileName,
    mimeType: 'application/pdf',
    buffer,
  });

  const dialog = await dialogPromise;
  const message = dialog.message();
  await dialog.accept();

  expect(message).toContain('PDF 上傳成功');
  await expect(teacherPage.locator(`text=已選擇: ${fileName}`)).toBeVisible({ timeout: 10000 });

  const sessionKey = new URL(teacherPage.url()).searchParams.get('session') || '';
  expect(sessionKey.length).toBeGreaterThan(0);
  return sessionKey;
}

async function goToWaitRoomDirect(
  page: Page,
  baseUrl: string,
  courseId: string,
  role: 'teacher' | 'student',
  sessionKey: string
): Promise<void> {
  const waitUrl =
    `${baseUrl}/classroom/wait?courseId=${encodeURIComponent(courseId)}` +
    `&role=${encodeURIComponent(role)}` +
    `&session=${encodeURIComponent(sessionKey)}`;

  await page.goto(waitUrl, { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/classroom\/wait/, { timeout: 30000 });
}

async function setupCourseAndEnrollment(
  browser: Browser,
  courseId: string,
  durationMinutes: number
): Promise<void> {
  const config = getTestConfig();

  const setupCtx = await browser.newContext();
  const setupPage = await setupCtx.newPage();
  try {
    await createCourseAsTeacherWithDuration(
      setupPage,
      courseId,
      config.teacherEmail,
      config.teacherPassword,
      config.bypassSecret,
      durationMinutes
    );
  } finally {
    await setupCtx.close();
  }

  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  try {
    await adminApproveCourse(adminPage, courseId, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
  } finally {
    await adminCtx.close();
  }

  runEnrollmentFlow(courseId, config.teacherEmail, config.studentEmail);
}

async function cleanupCourse(browser: Browser, baseUrl: string, bypassSecret: string, courseId: string): Promise<void> {
  try {
    const cleanupCtx = await browser.newContext();
    const cleanupPage = await cleanupCtx.newPage();
    await injectDeviceCheckBypass(cleanupPage);
    await autoLogin(cleanupPage, ADMIN_EMAIL, ADMIN_PASSWORD, bypassSecret);
    await cleanupPage.request.delete(`${baseUrl}/api/courses?id=${courseId}`).catch(() => {});
    await cleanupPage.request.delete(`${baseUrl}/api/orders?courseId=${courseId}`).catch(() => {});
    await cleanupCtx.close();
  } catch (cleanupError) {
    console.warn('[room-pdf] cleanup failed:', cleanupError);
  }
}

test.describe('[room-pdf] Room PDF Sync + Countdown Precision', () => {
  test.setTimeout(420000);

  test('single-page PDF renders in room and countdown starts without +5s offset', async ({ browser }) => {
    const config = getTestConfig();
    const durationMinutes = 5;
    const courseId = `room-pdf-single-${Date.now()}`;
    const sessionKey = `room_pdf_single_${Date.now()}`;
    const pdfName = 'test-single-page.pdf';
    const pdfBuffer = getPdfBuffer(STATIC_PDFS.singlePage, 1, 'single');

    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();
    teacherPage.on('console', msg => console.log(`[Teacher Console] ${msg.type()}: ${msg.text()}`));

    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();
    studentPage.on('console', msg => console.log(`[Student Console] ${msg.type()}: ${msg.text()}`));

    try {
      await setupCourseAndEnrollment(browser, courseId, durationMinutes);

      await injectDeviceCheckBypass(teacherPage);
      await autoLogin(teacherPage, config.teacherEmail, config.teacherPassword, config.bypassSecret);
      await goToWaitRoomDirect(teacherPage, config.baseUrl, courseId, 'teacher', sessionKey);

      const uploadedSessionKey = await uploadPdfOnWaitPage(teacherPage, pdfName, pdfBuffer);
      expect(uploadedSessionKey).toBe(sessionKey);
      const metadata = await waitForPdfMetadata(teacherPage, config.baseUrl, sessionKey);
      expect(metadata?.found).toBe(true);

      await injectDeviceCheckBypass(studentPage);
      await autoLogin(studentPage, config.studentEmail, config.studentPassword, config.bypassSecret);
      await goToWaitRoomDirect(studentPage, config.baseUrl, courseId, 'student', sessionKey);

      await enterClassroom(teacherPage, 'teacher');
      await clickReadyButton(teacherPage, 'teacher');
      await enterClassroom(studentPage, 'student');
      await clickReadyButton(studentPage, 'student');

      await waitAndEnterClassroom(teacherPage, 'teacher');
      await waitAndEnterClassroom(studentPage, 'student');

      const teacherPdfState = await waitForPdfSceneLoaded(teacherPage);
      const studentPdfState = await waitForPdfSceneLoaded(studentPage);

      expect(teacherPdfState.scenePath).toContain('/pdf/');
      expect(studentPdfState.scenePath).toContain('/pdf/');
      expect(teacherPdfState.index).toBe(0);
      expect(studentPdfState.index).toBe(0);
      expect(teacherPdfState.sceneCount).toBeGreaterThanOrEqual(1);
      expect(studentPdfState.sceneCount).toBeGreaterThanOrEqual(1);

      await expect(teacherPage.locator('button[title="下一頁"]')).toHaveCount(0);

      const expectedSeconds = await fetchExpectedRemainingSeconds(
        teacherPage,
        config.baseUrl,
        courseId,
        durationMinutes * 60
      );
      const observedSeconds = await readLargestCountdownSeconds(teacherPage);

      console.log(
        `[room-pdf][countdown] expected=${expectedSeconds}s observed=${observedSeconds}s`
      );

      // No +5 second offset should appear at timer start.
      expect(observedSeconds).toBeLessThanOrEqual(expectedSeconds + 1);
      expect(observedSeconds).toBeGreaterThanOrEqual(Math.max(expectedSeconds - 30, 1));
    } finally {
      await cleanupCourse(browser, config.baseUrl, config.bypassSecret, courseId);
      await teacherCtx.close();
      await studentCtx.close();
    }
  });

  test('multi-page PDF page switching stays synchronized between teacher and student', async ({ browser }) => {
    const config = getTestConfig();
    const courseId = `room-pdf-multi-${Date.now()}`;
    const sessionKey = `room_pdf_multi_${Date.now()}`;
    const pdfName = 'test-multi-page.pdf';
    const pdfBuffer = getPdfBuffer(STATIC_PDFS.multiPage, 3, 'multi');

    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();

    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();

    try {
      await setupCourseAndEnrollment(browser, courseId, 5);

      await injectDeviceCheckBypass(teacherPage);
      await autoLogin(teacherPage, config.teacherEmail, config.teacherPassword, config.bypassSecret);
      await goToWaitRoomDirect(teacherPage, config.baseUrl, courseId, 'teacher', sessionKey);

      const uploadedSessionKey = await uploadPdfOnWaitPage(teacherPage, pdfName, pdfBuffer);
      expect(uploadedSessionKey).toBe(sessionKey);
      const metadata = await waitForPdfMetadata(teacherPage, config.baseUrl, sessionKey);
      expect(metadata?.found).toBe(true);

      await injectDeviceCheckBypass(studentPage);
      await autoLogin(studentPage, config.studentEmail, config.studentPassword, config.bypassSecret);
      await goToWaitRoomDirect(studentPage, config.baseUrl, courseId, 'student', sessionKey);

      await enterClassroom(teacherPage, 'teacher');
      await clickReadyButton(teacherPage, 'teacher');
      await enterClassroom(studentPage, 'student');
      await clickReadyButton(studentPage, 'student');

      await waitAndEnterClassroom(teacherPage, 'teacher');
      await waitAndEnterClassroom(studentPage, 'student');

      const teacherPdfState = await waitForPdfSceneLoaded(teacherPage);
      await waitForPdfSceneLoaded(studentPage);

      await expect
        .poll(async () => {
          const state = await getRoomSceneState(teacherPage);
          return state?.sceneCount ?? 0;
        }, { timeout: 120000, intervals: [500, 1000, 2000] })
        .toBeGreaterThanOrEqual(3);

      const teacherStateAfterLoad = await getRoomSceneState(teacherPage);
      const sceneCount = teacherStateAfterLoad?.sceneCount ?? teacherPdfState.sceneCount;
      expect(sceneCount).toBeGreaterThanOrEqual(3);

      await setTeacherSceneIndex(teacherPage, 1);
      await waitForSceneIndex(teacherPage, 1);
      await waitForSceneIndex(studentPage, 1);

      const lastIndex = Math.min(2, sceneCount - 1);
      await setTeacherSceneIndex(teacherPage, lastIndex);
      await waitForSceneIndex(teacherPage, lastIndex);
      await waitForSceneIndex(studentPage, lastIndex);

      await setTeacherSceneIndex(teacherPage, 0);
      await waitForSceneIndex(teacherPage, 0);
      await waitForSceneIndex(studentPage, 0);
    } finally {
      await cleanupCourse(browser, config.baseUrl, config.bypassSecret, courseId);
      await teacherCtx.close();
      await studentCtx.close();
    }
  });

  test('room countdown decreases continuously and stays synchronized between teacher and student', async ({ browser }) => {
    const config = getTestConfig();
    const durationMinutes = 5;
    const courseId = `room-countdown-${Date.now()}`;

    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();

    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();

    try {
      await setupCourseAndEnrollment(browser, courseId, durationMinutes);

      await injectDeviceCheckBypass(teacherPage);
      await autoLogin(teacherPage, config.teacherEmail, config.teacherPassword, config.bypassSecret);
      await goToWaitRoom(teacherPage, courseId, 'teacher');

      await injectDeviceCheckBypass(studentPage);
      await autoLogin(studentPage, config.studentEmail, config.studentPassword, config.bypassSecret);
      await goToWaitRoom(studentPage, courseId, 'student');

      await enterClassroom(teacherPage, 'teacher');
      await clickReadyButton(teacherPage, 'teacher');
      await enterClassroom(studentPage, 'student');
      await clickReadyButton(studentPage, 'student');

      await waitAndEnterClassroom(teacherPage, 'teacher');
      await waitAndEnterClassroom(studentPage, 'student');

      await expect(teacherPage).toHaveURL(/\/classroom\/room/, { timeout: 30000 });
      await expect(studentPage).toHaveURL(/\/classroom\/room/, { timeout: 30000 });

      const expectedStartSeconds = await fetchExpectedRemainingSeconds(
        teacherPage,
        config.baseUrl,
        courseId,
        durationMinutes * 60
      );

      const teacherT0 = await readCountdownSecondsNearest(teacherPage, expectedStartSeconds);
      const studentT0 = await readCountdownSecondsNearest(studentPage, teacherT0);

      console.log(`[room-countdown][T0] teacher=${teacherT0}s student=${studentT0}s expected=${expectedStartSeconds}s`);

      // Teacher/student should display roughly the same remaining time right after entering.
      expect(Math.abs(teacherT0 - studentT0)).toBeLessThanOrEqual(6);

      await teacherPage.waitForTimeout(12000);

      const teacherT1 = await readCountdownSecondsNearest(teacherPage, Math.max(teacherT0 - 12, 1));
      const studentT1 = await readCountdownSecondsNearest(studentPage, Math.max(studentT0 - 12, 1));

      const teacherDrop1 = teacherT0 - teacherT1;
      const studentDrop1 = studentT0 - studentT1;

      console.log(`[room-countdown][T1] teacher=${teacherT1}s student=${studentT1}s teacherDrop=${teacherDrop1}s studentDrop=${studentDrop1}s`);

      expect(teacherT1).toBeLessThan(teacherT0);
      expect(studentT1).toBeLessThan(studentT0);

      // In 12 seconds of real time, countdown should noticeably decrement.
      expect(teacherDrop1).toBeGreaterThanOrEqual(6);
      expect(teacherDrop1).toBeLessThanOrEqual(25);
      expect(studentDrop1).toBeGreaterThanOrEqual(6);
      expect(studentDrop1).toBeLessThanOrEqual(25);

      // Teacher/student should remain close during the run.
      expect(Math.abs(teacherT1 - studentT1)).toBeLessThanOrEqual(6);

      await teacherPage.waitForTimeout(6000);

      const teacherT2 = await readCountdownSecondsNearest(teacherPage, Math.max(teacherT1 - 6, 1));
      const studentT2 = await readCountdownSecondsNearest(studentPage, Math.max(studentT1 - 6, 1));

      console.log(`[room-countdown][T2] teacher=${teacherT2}s student=${studentT2}s`);

      // Keep monotonic decrease at later sample.
      expect(teacherT2).toBeLessThanOrEqual(teacherT1);
      expect(studentT2).toBeLessThanOrEqual(studentT1);
      expect(Math.abs(teacherT2 - studentT2)).toBeLessThanOrEqual(6);
    } finally {
      await cleanupCourse(browser, config.baseUrl, config.bypassSecret, courseId);
      await teacherCtx.close();
      await studentCtx.close();
    }
  });
});

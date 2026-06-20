/**
 * 07 — Room PDF Sync Stress Test
 *
 * Validates system stability and isolation under concurrent loads (default: 3 groups)
 * when multiple classrooms are running in parallel and performing PDF sync operations:
 *   1) Sequential course creation, approval, and student enrollment (DynamoDB safe).
 *   2) Parallel login, navigation, and PDF uploading on /classroom/wait for all teachers.
 *   3) Parallel room entry for all groups.
 *   4) Parallel whiteboard initialization and PDF scene loading.
 *   5) Parallel page switching by teachers, verifying student-side synchronization.
 *   6) Parallel resource cleanup.
 *
 * Usage:
 *   $env:CONCURRENT_GROUPS="3"; npx playwright test e2e/classroom/07_room_pdf_sync_stress.spec.ts --project=chromium
 *
 * Faster reusable runs:
 *   # First run keeps generated courses/orders/PDFs for reuse.
 *   $env:CONCURRENT_GROUPS="10"; $env:STRESS_RUN_TS="1781889000000"; $env:SKIP_CLEANUP="1"; npx playwright test e2e/classroom/07_room_pdf_sync_stress.spec.ts --project=chromium
 *
 *   # Later runs reuse the same course ids, active enrollments, and PDF metadata.
 *   $env:CONCURRENT_GROUPS="10"; $env:STRESS_RUN_TS="1781889000000"; $env:REUSE_STRESS_SETUP="1"; $env:SKIP_CLEANUP="1"; $env:ENROLLMENT_PROPAGATION_WAIT_MS="0"; npx playwright test e2e/classroom/07_room_pdf_sync_stress.spec.ts --project=chromium
 */

import { test, expect, type Page, type Browser, chromium } from '@playwright/test';
import {
  createRecordedContext,
  printRecordingSummary,
  buildRunDir,
  RECORDINGS_ROOT,
} from '../helpers/recording_helper';
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
  registerStudentIfNeeded,
  grantPointsViaAdmin,
} from '../helpers/whiteboard_helpers';
import { getTestConfig, getStressGroupConfigs, ADMIN_EMAIL, ADMIN_PASSWORD } from '../test_data/whiteboard_test_data';

const GROUP_COUNT = parseInt(process.env.CONCURRENT_GROUPS || '3', 10);
const SUCCESS_THRESHOLD = parseFloat(process.env.SUCCESS_THRESHOLD || '0.75');
const STRESS_COURSE_DURATION_MINUTES = parseInt(process.env.STRESS_COURSE_DURATION_MINUTES || '10', 10);
const TEST_TIMEOUT_MS = Math.max(600_000, GROUP_COUNT * 120_000 + 300_000);
const REUSE_STRESS_SETUP = process.env.REUSE_STRESS_SETUP === '1';
const REUSE_ACCOUNTS = REUSE_STRESS_SETUP || process.env.REUSE_ACCOUNTS === '1';
const REUSE_POINTS = REUSE_STRESS_SETUP || process.env.REUSE_POINTS === '1';
const REUSE_COURSES = REUSE_STRESS_SETUP || process.env.REUSE_COURSES === '1';
const REUSE_APPROVALS = REUSE_STRESS_SETUP || process.env.REUSE_APPROVALS === '1';
const REUSE_ENROLLMENTS = REUSE_STRESS_SETUP || process.env.REUSE_ENROLLMENTS === '1';
const REUSE_PDF_UPLOADS = REUSE_STRESS_SETUP || process.env.REUSE_PDF_UPLOADS === '1';

function resolveHeadless(defaultValue: boolean): boolean {
  const raw = process.env.HEADLESS;
  if (!raw) return defaultValue;
  if (/^(1|true|yes)$/i.test(raw)) return true;
  if (/^(0|false|no)$/i.test(raw)) return false;
  throw new Error(`HEADLESS must be true/false/1/0/yes/no. Received: "${raw}"`);
}

function getStressTimestamp(): number {
  const raw = process.env.STRESS_RUN_TS || process.env.STRESS_RUN_ID || '';
  if (!raw) return Date.now();
  if (!/^\d+$/.test(raw)) {
    throw new Error(`STRESS_RUN_TS/STRESS_RUN_ID must be numeric for reusable course ids. Received: "${raw}"`);
  }
  return Number(raw);
}

type RoomSceneState = {
  scenePath: string;
  index: number;
  sceneCount: number;
};

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

async function uploadPdfOnWaitPage(
  teacherPage: Page,
  fileName: string,
  buffer: Buffer
): Promise<string> {
  console.log(`   📎 Uploading PDF: ${fileName} (${(buffer.length / 1024).toFixed(1)} KB)`);
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
  console.log(`   📎 Upload dialog: "${message}"`);

  expect(message).toContain('PDF 上傳成功');
  await expect(teacherPage.locator('text=已選擇').first()).toBeVisible({ timeout: 15000 });

  const sessionKey = new URL(teacherPage.url()).searchParams.get('session') || '';
  if (!sessionKey) {
    // Fallback: derive key from courseId in URL
    const courseId = new URL(teacherPage.url()).searchParams.get('courseId') || '';
    console.warn(`   ⚠️ session param missing, deriving from courseId: ${courseId}`);
    return `classroom_session_ready_${courseId}`;
  }
  console.log(`   📎 Session key: ${sessionKey}`);
  return sessionKey;
}

async function waitForPdfMetadata(
  page: Page,
  baseUrl: string,
  sessionKey: string,
  maxAttempts = 25
): Promise<any | null> {
  console.log(`   🔍 Waiting for PDF metadata in DynamoDB (uuid=${sessionKey})`);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await page.request
      .get(`${baseUrl}/api/whiteboard/pdf?uuid=${encodeURIComponent(sessionKey)}&check=1`)
      .catch(() => null);

    if (res?.ok()) {
      const json = await res.json().catch(() => null);
      if (json?.found) {
        console.log(`   ✅ PDF metadata confirmed (attempt ${attempt}/${maxAttempts})`);
        return json;
      }
      if (attempt % 5 === 0) {
        console.log(`   ⏳ PDF not yet in DynamoDB (attempt ${attempt}/${maxAttempts})...`);
      }
    }

    await page.waitForTimeout(1200);
  }
  console.warn(`   ❌ PDF metadata not found after ${maxAttempts} attempts`);
  return null;
}

async function fetchCourseById(page: Page, baseUrl: string, courseId: string): Promise<any | null> {
  const res = await page.request
    .get(`${baseUrl}/api/courses?id=${encodeURIComponent(courseId)}`)
    .catch(() => null);
  if (!res?.ok()) return null;
  const json = await res.json().catch(() => null);
  return json?.course || json?.data || null;
}

async function findActiveOrderForCourse(page: Page, baseUrl: string, courseId: string): Promise<any | null> {
  const res = await page.request
    .get(`${baseUrl}/api/orders?courseId=${encodeURIComponent(courseId)}&limit=50`)
    .catch(() => null);
  if (!res?.ok()) return null;
  const json = await res.json().catch(() => null);
  const orders = Array.isArray(json?.data) ? json.data : [];
  return orders.find((order: any) => {
    const status = String(order?.status || '').toUpperCase();
    return order?.courseId === courseId && status !== 'CANCELLED' && status !== 'FAILED';
  }) || null;
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

async function getPdfRuntimeSnapshot(page: Page): Promise<any> {
  return page.evaluate(() => {
    const w = window as any;
    const room = w.agoraRoom;
    const sceneState = room?.state?.sceneState;
    const canvases = Array.from(document.querySelectorAll('canvas')).map((canvas) => {
      const el = canvas as HTMLCanvasElement;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        width: el.width,
        height: el.height,
        visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };
    });

    return {
      url: location.href,
      header: document.body.innerText.match(/(TEACHER|STUDENT).{0,140}/)?.[0] || '',
      whiteboardReady: !!w.__classroom_whiteboard_ready,
      classroomReady: !!w.__classroom_ready,
      sdkLoaded: !!w.WhiteWebSdk?.WhiteWebSdk,
      roomReady: !!room,
      roomUuid: room?.uuid || room?.roomUuid || room?.state?.uuid || null,
      scenePath: String(sceneState?.scenePath || ''),
      sceneIndex: typeof sceneState?.index === 'number' ? sceneState.index : null,
      sceneCount: Array.isArray(sceneState?.scenes) ? sceneState.scenes.length : null,
      sceneNames: Array.isArray(sceneState?.scenes)
        ? sceneState.scenes.slice(0, 8).map((scene: any) => scene?.name || scene?.ppt?.src || '')
        : [],
      canvases,
    };
  }).catch((error) => ({ error: String((error as Error).message || error) }));
}

/**
 * Wait for the Agora whiteboard room SDK to initialise and expose itself on window.agoraRoom.
 * Returns true if ready within timeout, false otherwise.
 */
async function waitForAgoraRoomReady(page: Page, timeoutMs = 90000): Promise<boolean> {
  try {
    await page.waitForFunction(() => {
      return !!(window as any).agoraRoom && !!(window as any).agoraRoom.state;
    }, { timeout: timeoutMs });
    return true;
  } catch {
    const info = await page.evaluate(() => ({
      hasRoom: !!(window as any).agoraRoom,
      hasState: !!(window as any).agoraRoom?.state,
      url: window.location.href,
    }));
    console.warn(`   ⚠️ waitForAgoraRoomReady timed out.`, info);
    return false;
  }
}

/**
 * Wait for Room page's fetchPdfForSession to complete and expose the PDF scene.
 * First polls for the PDF in DynamoDB to confirm it's there, then waits for the
 * Agora whiteboard to load the PDF into scenes.
 */
async function waitForPdfSceneLoaded(page: Page, timeoutMs = 150000): Promise<RoomSceneState> {
  // Step 1: Wait for Agora whiteboard SDK to initialise
  console.log(`   🎯 Waiting for Agora whiteboard room to initialise...`);
  const roomReady = await waitForAgoraRoomReady(page, 90000);
  if (!roomReady) {
    throw new Error('Agora whiteboard room did not initialise within 90s');
  }

  // Diagnostic: print current scene state
  const initialState = await getRoomSceneState(page);
  console.log(`   🎯 Initial scene state:`, JSON.stringify(initialState));

  // Step 2: Wait for PDF scene to appear in the whiteboard
  console.log(`   🎯 Waiting for PDF scene path (/pdf/) to appear...`);
  await page.waitForFunction(() => {
    const room = (window as any).agoraRoom;
    const scenePath = room?.state?.sceneState?.scenePath;
    return typeof scenePath === 'string' && scenePath.includes('/pdf/');
  }, { timeout: timeoutMs });

  const state = await getRoomSceneState(page);
  if (!state) throw new Error('Scene state unavailable after PDF scene was expected');
  console.log(`   ✅ PDF scene loaded:`, JSON.stringify(state));
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
  let checks = 0;
  await expect
    .poll(async () => {
      checks++;
      const state = await getRoomSceneState(page);
      return state?.index ?? -1;
    }, { timeout: timeoutMs, intervals: [500, 1000] })
    .toBe(expectedIndex);
  if (checks > 3) {
    console.log(`   ✅ Scene index ${expectedIndex} observed after ${checks} checks`);
  }
}

interface GroupResult {
  groupId: string;
  courseId: string;
  enrolled: boolean;
  uploaded: boolean;
  entered: boolean;
  synced: boolean;
  error?: string;
  phase?: string;
}

function printStressSummary(results: GroupResult[], groupCount: number): void {
  const enrolled = results.filter(r => r.enrolled).length;
  const uploaded = results.filter(r => r.uploaded).length;
  const entered = results.filter(r => r.entered).length;
  const synced = results.filter(r => r.synced).length;

  console.log(`\n${'─'.repeat(75)}`);
  console.log(`📊 PDF Sync Stress Results — ${groupCount} Concurrent Groups`);
  console.log(`${'─'.repeat(75)}`);
  console.log(`  Enrolled:     ${enrolled}/${groupCount} (${Math.round(enrolled / groupCount * 100)}%)`);
  console.log(`  PDF Uploaded: ${uploaded}/${groupCount} (${Math.round(uploaded / groupCount * 100)}%)`);
  console.log(`  Entered:      ${entered}/${groupCount} (${Math.round(entered / groupCount * 100)}%)`);
  console.log(`  PDF Synced:   ${synced}/${groupCount} (${Math.round(synced / groupCount * 100)}%)`);
  console.log(`${'─'.repeat(75)}`);
  for (const r of results) {
    const statusIcon = r.synced ? '✅' : (r.entered ? '⚠️' : '❌');
    const failPhase = r.phase ? ` [failed at: ${r.phase}]` : '';
    console.log(`  ${statusIcon} [${r.groupId}] enrolled=${r.enrolled} uploaded=${r.uploaded} entered=${r.entered} sync=${r.synced}${failPhase}`);
    if (r.error) console.log(`       ↳ ${r.error}`);
  }
  console.log(`${'─'.repeat(75)}\n`);
}

// ─────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────

test.describe(`[stress-pdf-${GROUP_COUNT}x] Concurrent PDF Sync — ${GROUP_COUNT} Groups`, () => {
  test.setTimeout(TEST_TIMEOUT_MS);

  test(`${GROUP_COUNT} concurrent groups: enrollment → PDF upload → classroom entry → PDF sync`, async () => {
    const isHeadless = resolveHeadless(GROUP_COUNT >= 5);
    const runId = `pdf-stress-${GROUP_COUNT}x-${Date.now()}`;
    console.log(`🤖 Launching browser in ${isHeadless ? 'HEADLESS + 🎬 Recording' : 'HEADED'} mode (HEADLESS=${process.env.HEADLESS ?? 'auto'}, GROUP_COUNT=${GROUP_COUNT})`);
    if (isHeadless) {
      console.log(`   📹 Recordings → ${RECORDINGS_ROOT}\\${runId}`);
      console.log(`   ℹ️  View trace after test: npx playwright show-trace "<path>.zip"`);
    }
    const browser = await chromium.launch({
      headless: isHeadless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-gpu',
        '--no-first-run',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream'
      ]
    });

    try {
    const config = getTestConfig();
    const timestamp = getStressTimestamp();
    const groupConfigs = getStressGroupConfigs(GROUP_COUNT, timestamp);
    const pdfBuffer = loadStaticPdf(STATIC_PDFS.multiPage);
    const pdfName = 'test-multi-page.pdf';

    const results: GroupResult[] = groupConfigs.map(g => ({
      groupId: g.groupId,
      courseId: g.courseId,
      enrolled: false,
      uploaded: false,
      entered: false,
      synced: false,
    }));

    console.log(`\n${'═'.repeat(75)}`);
    console.log(`  PDF Sync Stress Test — ${GROUP_COUNT} Concurrent Groups`);
    console.log(`  Success threshold: ${Math.round(SUCCESS_THRESHOLD * 100)}%`);
    console.log(`  Course duration: ${STRESS_COURSE_DURATION_MINUTES} minutes`);
    console.log(`  Run timestamp: ${timestamp}`);
    console.log(`  Reuse setup: ${REUSE_STRESS_SETUP ? 'yes' : 'no'}`);
    console.log(`  Reuse accounts: ${REUSE_ACCOUNTS ? 'yes' : 'no'}`);
    console.log(`  Reuse points: ${REUSE_POINTS ? 'yes' : 'no'}`);
    console.log(`  Reuse courses: ${REUSE_COURSES ? 'yes' : 'no'}`);
    console.log(`  Reuse approvals: ${REUSE_APPROVALS ? 'yes' : 'no'}`);
    console.log(`  Reuse enrollments: ${REUSE_ENROLLMENTS ? 'yes' : 'no'}`);
    console.log(`  Reuse PDF uploads: ${REUSE_PDF_UPLOADS ? 'yes' : 'no'}`);
    console.log(`  Enrollment propagation wait: ${process.env.ENROLLMENT_PROPAGATION_WAIT_MS ?? '8000'}ms`);
    if ((REUSE_STRESS_SETUP || process.env.STRESS_RUN_TS) && !process.env.SKIP_CLEANUP) {
      console.warn('  ⚠️ Reusable setup requested without SKIP_CLEANUP=1; generated data will be deleted at cleanup.');
    }
    console.log(`${'═'.repeat(75)}`);
    groupConfigs.forEach(g => console.log(`  [${g.groupId}] teacher=${g.teacherEmail} course=${g.courseId}`));

    // ── Phase 0: Pre-register students + grant points ────────────────
    // Runs before any course creation so all accounts have sufficient
    // points when the enrollment subprocess later checks balance.
    console.log('\n📍 Phase 0: Register student accounts and pre-grant points');
    if (REUSE_ACCOUNTS) {
      console.log('   ♻️ Reusing existing student accounts (REUSE_ACCOUNTS=1)');
    } else {
      const preSetupCtx = await browser.newContext();
      const preSetupPage = await preSetupCtx.newPage();
      for (const g of groupConfigs) {
        await registerStudentIfNeeded(preSetupPage, g.studentEmail, config.studentPassword, config.bypassSecret);
      }
      await preSetupCtx.close();
    }

    if (REUSE_POINTS) {
      console.log('   ♻️ Reusing existing point balances (REUSE_POINTS=1)');
    } else {
      const preAdminCtx = await browser.newContext();
      const preAdminPage = await preAdminCtx.newPage();
      await injectDeviceCheckBypass(preAdminPage);
      await autoLogin(preAdminPage, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
      for (const g of groupConfigs) {
        await grantPointsViaAdmin(preAdminPage, g.studentEmail, 9999, config.bypassSecret);
      }
      await preAdminCtx.close();
    }

    // ── Phase 1: Course Creation (sequential) ────────────────────────
    console.log('\n📍 Phase 1: Course Creation (sequential)');
    for (let i = 0; i < groupConfigs.length; i++) {
      const g = groupConfigs[i];
      const r = results[i];
      try {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const existingCourse = REUSE_COURSES
          ? await fetchCourseById(page, config.baseUrl, g.courseId)
          : null;
        if (existingCourse) {
          console.log(`   ♻️ [${g.groupId}] Reusing existing course ${g.courseId} (status=${existingCourse.status || 'unknown'})`);
        } else {
          await createCourseAsTeacherWithDuration(page, g.courseId, g.teacherEmail, g.teacherPassword, config.bypassSecret, STRESS_COURSE_DURATION_MINUTES);
        }
        await ctx.close();
        console.log(`   ✅ [${g.groupId}] Course ready`);
      } catch (err) {
        r.error = `Course creation: ${(err as Error).message}`;
        r.phase = 'course_creation';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }

    // Grant points to teacher accounts now that they exist (created during Phase 1)
    if (REUSE_POINTS) {
      console.log('   ♻️ Reusing existing teacher point balances (REUSE_POINTS=1)');
    } else {
      const teacherPointsCtx = await browser.newContext();
      const teacherPointsPage = await teacherPointsCtx.newPage();
      await injectDeviceCheckBypass(teacherPointsPage);
      await autoLogin(teacherPointsPage, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
      for (const g of groupConfigs) {
        await grantPointsViaAdmin(teacherPointsPage, g.teacherEmail, 9999, config.bypassSecret);
      }
      await teacherPointsCtx.close();
    }

    // ── Phase 2: Admin Approval (sequential admin session) ───────────
    console.log('\n📍 Phase 2: Admin Approval');
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    for (let i = 0; i < groupConfigs.length; i++) {
      const g = groupConfigs[i];
      const r = results[i];
      if (r.phase) continue;
      try {
        if (REUSE_APPROVALS) {
          const existingCourse = await fetchCourseById(adminPage, config.baseUrl, g.courseId);
          const status = String(existingCourse?.status || '').toLowerCase();
          const stillPending =
            status.includes('pending') ||
            status.includes('draft') ||
            status.includes('review') ||
            status.includes('待') ||
            status.includes('審');
          if (existingCourse && !stillPending) {
            console.log(`   ♻️ [${g.groupId}] Reusing existing approval status (${existingCourse.status || 'unknown'})`);
            continue;
          }
        }
        await adminApproveCourse(adminPage, g.courseId, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
        console.log(`   ✅ [${g.groupId}] Approved`);
      } catch (err) {
        r.error = `Approval: ${(err as Error).message}`;
        r.phase = 'admin_approval';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }
    await adminCtx.close();

    // ── Phase 3: Student Enrollment (sequential) ─────────────────────
    console.log('\n📍 Phase 3: Student Enrollment (sequential)');
    const enrollmentCheckCtx = await browser.newContext();
    const enrollmentCheckPage = await enrollmentCheckCtx.newPage();
    for (let i = 0; i < groupConfigs.length; i++) {
      const g = groupConfigs[i];
      const r = results[i];
      if (r.phase) continue;
      try {
        const existingOrder = REUSE_ENROLLMENTS
          ? await findActiveOrderForCourse(enrollmentCheckPage, config.baseUrl, g.courseId)
          : null;
        if (existingOrder) {
          console.log(`   ♻️ [${g.groupId}] Reusing existing active order ${existingOrder.orderId || existingOrder.id || '(unknown)'}`);
        } else {
          await runEnrollmentFlow(g.courseId, g.teacherEmail, g.studentEmail);
        }
        r.enrolled = true;
        console.log(`   ✅ [${g.groupId}] Enrolled`);
      } catch (err) {
        r.error = `Enrollment: ${(err as Error).message}`;
        r.phase = 'enrollment';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }
    await enrollmentCheckCtx.close();

    // ── Phase 4: Parallel Login and Navigation ───────────────────────
    console.log('\n📍 Phase 4: Parallel Login and Navigation');
    interface GroupSession {
      idx: number;
      teacherCtx: any;
      teacherPage: Page;
      studentCtx: any;
      studentPage: Page;
    }

    const sessions: GroupSession[] = [];
    // Track recording finalisers (teacher + student per group)
    const sessionFinalisers: Array<{
      idx: number;
      finaliseTeacher: (passed: boolean) => Promise<void>;
      finaliseStudent: (passed: boolean) => Promise<void>;
    }> = [];

    for (let i = 0; i < groupConfigs.length; i++) {
      if (!results[i].enrolled) continue;
      const g = groupConfigs[i];
      const runDir = buildRunDir(runId, g.groupId);

      const teacherRec = await createRecordedContext(browser, runDir, 'teacher', isHeadless, { permissions: ['camera', 'microphone'] });
      const studentRec = await createRecordedContext(browser, runDir, 'student', isHeadless, { permissions: ['camera', 'microphone'] });

      const teacherPage = teacherRec.page;
      const studentPage = studentRec.page;

      // Capture browser logs for diagnostic
      teacherPage.on('console', msg => {
        if (msg.text().includes('[ClientClassroom]') || msg.text().includes('[BoardImpl]') || msg.type() === 'error') {
          console.log(`   🖥️ [T-${i}] ${msg.text()}`);
        }
      });
      studentPage.on('console', msg => {
        if (msg.text().includes('[ClientClassroom]') || msg.text().includes('[BoardImpl]') || msg.type() === 'error') {
          console.log(`   🖥️ [S-${i}] ${msg.text()}`);
        }
      });

      sessions.push({
        idx: i,
        teacherCtx: teacherRec.ctx,
        teacherPage,
        studentCtx: studentRec.ctx,
        studentPage,
      });
      sessionFinalisers.push({
        idx: i,
        finaliseTeacher: teacherRec.finalise,
        finaliseStudent: studentRec.finalise,
      });
    }

    // Login in parallel
    await Promise.all(sessions.map(async s => {
      const g = groupConfigs[s.idx];
      await injectDeviceCheckBypass(s.teacherPage);
      await injectDeviceCheckBypass(s.studentPage);
      await autoLogin(s.teacherPage, g.teacherEmail, g.teacherPassword, config.bypassSecret);
      await autoLogin(s.studentPage, g.studentEmail, g.studentPassword, config.bypassSecret);
    }));

    // Go to Wait Room in parallel
    await Promise.allSettled(sessions.map(async s => {
      const g = groupConfigs[s.idx];
      const r = results[s.idx];
      try {
        await goToWaitRoom(s.teacherPage, g.courseId, 'teacher');
        await goToWaitRoom(s.studentPage, g.courseId, 'student');
      } catch (err) {
        r.error = `Waitroom navigation: ${(err as Error).message}`;
        r.phase = 'waitroom_nav';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }));

    // ── Phase 5: PDF Upload on Wait Page (Parallel) ──────────────────
    console.log('\n📍 Phase 5: Parallel PDF Upload on Wait Page');
    await Promise.allSettled(sessions.map(async s => {
      const g = groupConfigs[s.idx];
      const r = results[s.idx];
      if (r.phase) return;

      try {
        const reusableSessionKey = `classroom_session_ready_${g.courseId}`;
        if (REUSE_PDF_UPLOADS) {
          const existingMetadata = await waitForPdfMetadata(s.teacherPage, config.baseUrl, reusableSessionKey, 1);
          if (existingMetadata?.found) {
            r.uploaded = true;
            console.log(`   ♻️ [${g.groupId}] Reusing existing PDF metadata (${reusableSessionKey})`);
            return;
          }
          console.log(`   ℹ️ [${g.groupId}] No reusable PDF metadata found; uploading PDF`);
        }
        const sessionKey = await uploadPdfOnWaitPage(s.teacherPage, pdfName, pdfBuffer);
        const metadata = await waitForPdfMetadata(s.teacherPage, config.baseUrl, sessionKey);
        expect(metadata?.found).toBe(true);
        r.uploaded = true;
        console.log(`   ✅ [${g.groupId}] PDF Uploaded and registered`);
      } catch (err) {
        r.error = `PDF Upload: ${(err as Error).message}`;
        r.phase = 'pdf_upload';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }));

    // ── Phase 6: Enter Classroom (Sequential Ready, Parallel Wait) ────
    console.log('\n📍 Phase 6: Classroom Entry');
    for (const s of sessions) {
      const g = groupConfigs[s.idx];
      const r = results[s.idx];
      if (r.phase) continue;

      try {
        await enterClassroom(s.teacherPage, 'teacher');
        await clickReadyButton(s.teacherPage, 'teacher');
        await enterClassroom(s.studentPage, 'student');
        await clickReadyButton(s.studentPage, 'student');
      } catch (err) {
        r.error = `Ready click: ${(err as Error).message}`;
        r.phase = 'ready_click';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }

    // Wait and navigate to room in parallel
    await Promise.allSettled(sessions.map(async s => {
      const g = groupConfigs[s.idx];
      const r = results[s.idx];
      if (r.phase) return;

      try {
        await Promise.all([
          waitAndEnterClassroom(s.teacherPage, 'teacher'),
          waitAndEnterClassroom(s.studentPage, 'student'),
        ]);
        r.entered = true;
        console.log(`   ✅ [${g.groupId}] Entered classroom room`);
      } catch (err) {
        r.error = `Classroom wait/enter: ${(err as Error).message}`;
        r.phase = 'classroom_enter';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }));

    // ── Phase 7: PDF Sync Verification (Parallel) ────────────────────
    console.log('\n📍 Phase 7: Parallel PDF Scene Render and Sync Verification');
    await Promise.allSettled(sessions.map(async s => {
      const g = groupConfigs[s.idx];
      const r = results[s.idx];
      if (!r.entered) return;

      try {
        const teacherState = await waitForPdfSceneLoaded(s.teacherPage);
        const studentState = await waitForPdfSceneLoaded(s.studentPage);

        expect(teacherState.scenePath).toContain('/pdf/');
        expect(studentState.scenePath).toContain('/pdf/');
        expect(teacherState.index).toBe(0);
        expect(studentState.index).toBe(0);
        expect(teacherState.sceneCount).toBeGreaterThanOrEqual(3);
        expect(studentState.sceneCount).toBeGreaterThanOrEqual(3);

        // Teacher switches to Page 2 (index 1)
        await setTeacherSceneIndex(s.teacherPage, 1);
        await waitForSceneIndex(s.teacherPage, 1);
        await waitForSceneIndex(s.studentPage, 1);

        // Teacher switches to Page 3 (index 2)
        await setTeacherSceneIndex(s.teacherPage, 2);
        await waitForSceneIndex(s.teacherPage, 2);
        await waitForSceneIndex(s.studentPage, 2);

        // Teacher switches back to Page 1 (index 0)
        await setTeacherSceneIndex(s.teacherPage, 0);
        await waitForSceneIndex(s.teacherPage, 0);
        await waitForSceneIndex(s.studentPage, 0);

        r.synced = true;
        console.log(`   ✅ [${g.groupId}] PDF Synchronization verified successfully`);
      } catch (err) {
        const [teacherSnapshot, studentSnapshot] = await Promise.all([
          getPdfRuntimeSnapshot(s.teacherPage),
          getPdfRuntimeSnapshot(s.studentPage),
        ]);
        console.log(`   🔎 [${g.groupId}] Teacher PDF snapshot: ${JSON.stringify(teacherSnapshot)}`);
        console.log(`   🔎 [${g.groupId}] Student PDF snapshot: ${JSON.stringify(studentSnapshot)}`);
        await Promise.all([
          s.teacherPage.screenshot({ path: `test-results/${g.groupId}-teacher-pdf-sync-fail.png`, fullPage: true }).catch(() => {}),
          s.studentPage.screenshot({ path: `test-results/${g.groupId}-student-pdf-sync-fail.png`, fullPage: true }).catch(() => {}),
        ]);
        r.error = `PDF Sync verification: ${(err as Error).message}`;
        r.phase = 'pdf_sync_verify';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }));

    // ── Cleanup ──────────────────────────────────────────────────────
    console.log('\n📍 Cleanup: Closing browser sessions');
    for (const s of sessions) {
      await s.teacherPage.close().catch(() => {});
      await s.studentPage.close().catch(() => {});
    }
    // Finalise recordings (saves trace zip + webm video) — no-op when headed
    const finalAssertPassed = results.filter(r => r.synced).length / GROUP_COUNT >= SUCCESS_THRESHOLD;
    await Promise.allSettled(
      sessionFinalisers.map(({ idx, finaliseTeacher, finaliseStudent }) => {
        const passed = finalAssertPassed && results[idx].synced;
        return Promise.all([finaliseTeacher(passed), finaliseStudent(passed)]);
      })
    );

    if (!process.env.SKIP_CLEANUP) {
      console.log('📍 Cleanup: Deleting courses and orders');
      const cleanAdminCtx = await browser.newContext();
      const cleanAdminPage = await cleanAdminCtx.newPage();
      await injectDeviceCheckBypass(cleanAdminPage);
      await autoLogin(cleanAdminPage, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
      for (const g of groupConfigs) {
        await cleanAdminPage.request.delete(`${config.baseUrl}/api/courses?id=${g.courseId}`).catch(() => {});
        await cleanAdminPage.request.delete(`${config.baseUrl}/api/orders?courseId=${g.courseId}`).catch(() => {});
      }
      await cleanAdminCtx.close();
      console.log('   🧹 Cleanup complete');
    }

    // ── Assertions ───────────────────────────────────────────────────
    printStressSummary(results, GROUP_COUNT);

    const syncedCount = results.filter(r => r.synced).length;
    const achievedRate = syncedCount / GROUP_COUNT;

    console.log(`   Required success rate: ${Math.round(SUCCESS_THRESHOLD * 100)}%`);
    console.log(`   Achieved success rate: ${Math.round(achievedRate * 100)}%`);

    expect(
      achievedRate,
      `PDF Sync stress test failed: ${syncedCount}/${GROUP_COUNT} groups synced (need ${Math.round(SUCCESS_THRESHOLD * 100)}%)`
    ).toBeGreaterThanOrEqual(SUCCESS_THRESHOLD);

    // Print recording paths summary (only meaningful in headless mode)
    if (isHeadless) {
      printRecordingSummary(runId, groupConfigs.map(g => g.groupId));
    }
    } finally {
      await browser.close().catch(() => {});
    }
  });
});

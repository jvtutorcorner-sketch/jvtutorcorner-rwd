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
 */

import { test, expect, type Page, type Browser } from '@playwright/test';
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
const TEST_TIMEOUT_MS = Math.max(600_000, GROUP_COUNT * 120_000 + 300_000);

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
  await expect
    .poll(async () => {
      const state = await getRoomSceneState(page);
      return state?.index ?? -1;
    }, { timeout: timeoutMs, intervals: [500, 1000] })
    .toBe(expectedIndex);
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

  test(`${GROUP_COUNT} concurrent groups: enrollment → PDF upload → classroom entry → PDF sync`, async ({ browser }) => {
    const config = getTestConfig();
    const timestamp = Date.now();
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
    console.log(`${'═'.repeat(75)}`);
    groupConfigs.forEach(g => console.log(`  [${g.groupId}] teacher=${g.teacherEmail} course=${g.courseId}`));

    // ── Phase 0: Pre-register students + grant points ────────────────
    // Runs before any course creation so all accounts have sufficient
    // points when the enrollment subprocess later checks balance.
    console.log('\n📍 Phase 0: Register student accounts and pre-grant points');
    const preSetupCtx = await browser.newContext();
    const preSetupPage = await preSetupCtx.newPage();
    for (const g of groupConfigs) {
      await registerStudentIfNeeded(preSetupPage, g.studentEmail, config.studentPassword, config.bypassSecret);
    }
    await preSetupCtx.close();

    const preAdminCtx = await browser.newContext();
    const preAdminPage = await preAdminCtx.newPage();
    await injectDeviceCheckBypass(preAdminPage);
    await autoLogin(preAdminPage, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
    for (const g of groupConfigs) {
      await grantPointsViaAdmin(preAdminPage, g.studentEmail, 9999, config.bypassSecret);
    }
    await preAdminCtx.close();

    // ── Phase 1: Course Creation (sequential) ────────────────────────
    console.log('\n📍 Phase 1: Course Creation (sequential)');
    for (let i = 0; i < groupConfigs.length; i++) {
      const g = groupConfigs[i];
      const r = results[i];
      try {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await createCourseAsTeacherWithDuration(page, g.courseId, g.teacherEmail, g.teacherPassword, config.bypassSecret, 10);
        await ctx.close();
        console.log(`   ✅ [${g.groupId}] Course created`);
      } catch (err) {
        r.error = `Course creation: ${(err as Error).message}`;
        r.phase = 'course_creation';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }

    // Grant points to teacher accounts now that they exist (created during Phase 1)
    const teacherPointsCtx = await browser.newContext();
    const teacherPointsPage = await teacherPointsCtx.newPage();
    await injectDeviceCheckBypass(teacherPointsPage);
    await autoLogin(teacherPointsPage, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
    for (const g of groupConfigs) {
      await grantPointsViaAdmin(teacherPointsPage, g.teacherEmail, 9999, config.bypassSecret);
    }
    await teacherPointsCtx.close();

    // ── Phase 2: Admin Approval (sequential admin session) ───────────
    console.log('\n📍 Phase 2: Admin Approval');
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    for (let i = 0; i < groupConfigs.length; i++) {
      const g = groupConfigs[i];
      const r = results[i];
      if (r.phase) continue;
      try {
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
    for (let i = 0; i < groupConfigs.length; i++) {
      const g = groupConfigs[i];
      const r = results[i];
      if (r.phase) continue;
      try {
        await runEnrollmentFlow(g.courseId, g.teacherEmail, g.studentEmail);
        r.enrolled = true;
        console.log(`   ✅ [${g.groupId}] Enrolled`);
      } catch (err) {
        r.error = `Enrollment: ${(err as Error).message}`;
        r.phase = 'enrollment';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }

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
    for (let i = 0; i < groupConfigs.length; i++) {
      if (!results[i].enrolled) continue;
      const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
      const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
      
      const teacherPage = await teacherCtx.newPage();
      const studentPage = await studentCtx.newPage();
      
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
        teacherCtx,
        teacherPage,
        studentCtx,
        studentPage,
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
        r.error = `PDF Sync verification: ${(err as Error).message}`;
        r.phase = 'pdf_sync_verify';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }));

    // ── Cleanup ──────────────────────────────────────────────────────
    console.log('\n📍 Cleanup: Closing browser sessions');
    for (const s of sessions) {
      await s.teacherCtx.close().catch(() => {});
      await s.studentCtx.close().catch(() => {});
    }

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
  });
});

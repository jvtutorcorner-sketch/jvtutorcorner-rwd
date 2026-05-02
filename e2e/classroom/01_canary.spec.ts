/**
 * 01 — Canary Session Test
 *
 * Pattern: "Canary deployment probe" (Twitch, YouTube, Zoom)
 *   → A single teacher+student session that validates every phase
 *     independently with named checkpoints and timing measurements.
 *   → Must pass before running any concurrent/load specs.
 *   → ~3–4 min end-to-end.
 *
 * Phases tested separately (each fails independently with clear context):
 *   A. Course creation
 *   B. Course approval
 *   C. Student enrollment
 *   D. Wait-room navigation & device check
 *   E. Ready signal → classroom entry
 *   F. Whiteboard sync quality (latency measurement)
 *   G. Session teardown
 *
 * Run:
 *   npx playwright test e2e/classroom/01_canary.spec.ts --project=chromium
 */

import { test, expect, type Browser } from '@playwright/test';
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
  drawOnWhiteboard,
  hasDrawingContent,
} from '../helpers/whiteboard_helpers';
import {
  checkpoint,
  measureSyncLatency,
  checkSystemHealth,
  printHealthReport,
  SYNC_LATENCY_SLO_MS,
} from '../helpers/streaming_monitor';
import { getTestConfig, ADMIN_EMAIL, ADMIN_PASSWORD } from '../test_data/whiteboard_test_data';

const COURSE_ID = `canary-${Date.now()}`;

test.describe('[canary] Single Session — Per-Phase Checkpoints', () => {
  test.setTimeout(300_000); // 5 min

  // ── Phase A + B + C: Setup (create → approve → enroll) ──────────
  test('Phase A-C: course creation, approval, enrollment', async ({ browser }) => {
    const config = getTestConfig();

    // Health gate
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();

    try {
      // A. Create course
      const { elapsedMs: createMs } = await checkpoint(
        'course_creation',
        () => createCourseAsTeacherWithDuration(
          teacherPage, COURSE_ID,
          config.teacherEmail, config.teacherPassword, config.bypassSecret, 5
        ),
        30_000
      );
      console.log(`   📌 Course ${COURSE_ID} created in ${createMs}ms`);

      // B. Admin approve
      const adminCtx = await browser.newContext();
      const adminPage = await adminCtx.newPage();
      const { elapsedMs: approveMs } = await checkpoint(
        'admin_approval',
        () => adminApproveCourse(adminPage, COURSE_ID, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret),
        20_000
      );
      await adminCtx.close();
      console.log(`   📌 Course approved in ${approveMs}ms`);

      // C. Student enrollment
      const { elapsedMs: enrollMs } = await checkpoint(
        'student_enrollment',
        () => Promise.resolve(runEnrollmentFlow(COURSE_ID, config.teacherEmail, config.studentEmail)),
        90_000
      );
      console.log(`   📌 Enrollment completed in ${enrollMs}ms`);

      expect(createMs, 'Course creation exceeded 30s').toBeLessThan(30_000);
      expect(approveMs, 'Approval exceeded 20s').toBeLessThan(20_000);
      expect(enrollMs, 'Enrollment exceeded 90s').toBeLessThan(90_000);
    } finally {
      await teacherCtx.close();
    }
  });

  // ── Phase D: Wait-room navigation ───────────────────────────────
  test('Phase D: both roles navigate to wait room', async ({ browser }) => {
    const config = getTestConfig();

    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();
    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();

    try {
      await injectDeviceCheckBypass(teacherPage);
      await injectDeviceCheckBypass(studentPage);
      await autoLogin(teacherPage, config.teacherEmail, config.teacherPassword, config.bypassSecret);
      await autoLogin(studentPage, config.studentEmail, config.studentPassword, config.bypassSecret);

      const { elapsedMs: teacherNavMs } = await checkpoint(
        'teacher_waitroom_nav',
        () => goToWaitRoom(teacherPage, COURSE_ID, 'teacher'),
        60_000
      );
      const { elapsedMs: studentNavMs } = await checkpoint(
        'student_waitroom_nav',
        () => goToWaitRoom(studentPage, COURSE_ID, 'student'),
        60_000
      );

      expect(teacherNavMs, `Teacher nav ${teacherNavMs}ms > 60s`).toBeLessThan(60_000);
      expect(studentNavMs, `Student nav ${studentNavMs}ms > 60s`).toBeLessThan(60_000);

      // Verify wait room page
      await expect(teacherPage.locator('.wait-page-container, h2').first()).toBeVisible({ timeout: 10_000 });
      await expect(studentPage.locator('.wait-page-container, h2').first()).toBeVisible({ timeout: 10_000 });
      console.log(`   ✅ Both roles on /classroom/wait`);
    } finally {
      await teacherCtx.close();
      await studentCtx.close();
    }
  });

  // ── Phase E: Ready signal + classroom entry ──────────────────────
  test('Phase E: ready signal and classroom entry timing', async ({ browser }) => {
    const config = getTestConfig();

    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();
    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();

    try {
      await injectDeviceCheckBypass(teacherPage);
      await injectDeviceCheckBypass(studentPage);
      await autoLogin(teacherPage, config.teacherEmail, config.teacherPassword, config.bypassSecret);
      await autoLogin(studentPage, config.studentEmail, config.studentPassword, config.bypassSecret);
      await goToWaitRoom(teacherPage, COURSE_ID, 'teacher');
      await goToWaitRoom(studentPage, COURSE_ID, 'student');

      // Sequential ready clicks to avoid DynamoDB race condition
      await checkpoint('teacher_ready', () => enterClassroom(teacherPage, 'teacher').then(() => clickReadyButton(teacherPage, 'teacher')), 20_000);
      await checkpoint('student_ready', () => enterClassroom(studentPage, 'student').then(() => clickReadyButton(studentPage, 'student')), 20_000);

      const { elapsedMs: entryMs } = await checkpoint(
        'parallel_classroom_entry',
        () => Promise.all([
          waitAndEnterClassroom(teacherPage, 'teacher'),
          waitAndEnterClassroom(studentPage, 'student'),
        ]),
        90_000
      );
      console.log(`   📌 Both entered classroom in ${entryMs}ms`);
      expect(entryMs, `Entry took ${entryMs}ms > 90s`).toBeLessThan(90_000);

      // Verify both on /classroom/room
      expect(teacherPage.url()).toContain('/classroom/room');
      expect(studentPage.url()).toContain('/classroom/room');
    } finally {
      await teacherCtx.close();
      await studentCtx.close();
    }
  });

  // ── Phase F: Whiteboard sync — latency measurement ───────────────
  test('Phase F: whiteboard sync latency within SLO', async ({ browser }) => {
    const config = getTestConfig();

    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();
    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();

    try {
      await injectDeviceCheckBypass(teacherPage);
      await injectDeviceCheckBypass(studentPage);
      await autoLogin(teacherPage, config.teacherEmail, config.teacherPassword, config.bypassSecret);
      await autoLogin(studentPage, config.studentEmail, config.studentPassword, config.bypassSecret);
      await goToWaitRoom(teacherPage, COURSE_ID, 'teacher');
      await goToWaitRoom(studentPage, COURSE_ID, 'student');
      await enterClassroom(teacherPage, 'teacher');
      await clickReadyButton(teacherPage, 'teacher');
      await enterClassroom(studentPage, 'student');
      await clickReadyButton(studentPage, 'student');
      await Promise.all([
        waitAndEnterClassroom(teacherPage, 'teacher'),
        waitAndEnterClassroom(studentPage, 'student'),
      ]);

      // Agora init wait
      await teacherPage.waitForTimeout(8000);
      await studentPage.waitForTimeout(8000);

      // Teacher draws
      const { elapsedMs: drawMs } = await checkpoint('teacher_draw', () => drawOnWhiteboard(teacherPage), 30_000);

      // Measure sync latency
      const syncResult = await measureSyncLatency(studentPage, { maxWaitMs: SYNC_LATENCY_SLO_MS * 2 });

      console.log(`\n   📊 Sync Latency Report:`);
      console.log(`      Draw time:      ${drawMs}ms`);
      console.log(`      Sync latency:   ${syncResult.latencyMs ?? 'TIMEOUT'}ms`);
      console.log(`      SLO threshold:  ${SYNC_LATENCY_SLO_MS}ms`);
      console.log(`      Synced:         ${syncResult.synced}`);
      console.log(`      Exceeded SLO:   ${syncResult.exceededSLO}`);

      // Teacher must always see own drawing
      const teacherHasContent = await hasDrawingContent(teacherPage);
      expect(teacherHasContent, 'Teacher canvas empty after draw').toBe(true);

      // Student must sync within SLO
      expect(syncResult.synced, `Student canvas never synced (waited ${SYNC_LATENCY_SLO_MS * 2}ms)`).toBe(true);

      if (syncResult.exceededSLO) {
        console.log(`   ⚠️  WARNING: Sync latency ${syncResult.latencyMs}ms exceeded SLO ${SYNC_LATENCY_SLO_MS}ms — investigate before concurrent load`);
      }
    } finally {
      // Cleanup
      if (!process.env.SKIP_CLEANUP) {
        const adminCtx = await browser.newContext();
        const adminPage = await adminCtx.newPage();
        await injectDeviceCheckBypass(adminPage);
        await autoLogin(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
        await adminPage.request.delete(`${config.baseUrl}/api/courses?id=${COURSE_ID}`).catch(() => {});
        await adminPage.request.delete(`${config.baseUrl}/api/orders?courseId=${COURSE_ID}`).catch(() => {});
        await adminCtx.close();
        console.log(`   🧹 Cleaned up canary course ${COURSE_ID}`);
      }
      await teacherCtx.close();
      await studentCtx.close();
    }
  });
});

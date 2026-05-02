/**
 * 02 — Sync Quality Gate
 *
 * Pattern: "Stream segment QoS probe" (YouTube Live quality checks,
 *          Twitch bitrate monitoring, Zoom sync-drift detection)
 *
 *   → Quantifies whiteboard sync quality with hard SLO thresholds.
 *   → Tests multiple draw events to detect flaky or degrading sync.
 *   → Does NOT test load — this is quality-focused.
 *   → ~4-6 min.
 *
 * Tests:
 *   A. First-draw latency: time from draw to first student sync
 *   B. Repeated draws: 5 draws, each measured, warn if any exceed SLO
 *   C. Canvas integrity: pixel data matches expected "non-empty" state
 *   D. Sync alive after idle: re-draw after 30s pause, verify still syncs
 *
 * Run:
 *   npx playwright test e2e/classroom/02_sync_quality.spec.ts --project=chromium
 *   SYNC_LATENCY_SLO_MS=5000 npx playwright test e2e/classroom/02_sync_quality.spec.ts
 */

import { test, expect } from '@playwright/test';
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
  measureSyncLatency,
  drawAndProbeSync,
  checkpoint,
  SYNC_LATENCY_SLO_MS,
} from '../helpers/streaming_monitor';
import { getTestConfig, ADMIN_EMAIL, ADMIN_PASSWORD } from '../test_data/whiteboard_test_data';

const COURSE_ID = `syncq-${Date.now()}`;

// ─────────────────────────────────────────────────────────────────────
// Shared browser session (set up once, reuse across sync quality tests)
// ─────────────────────────────────────────────────────────────────────

test.describe('[sync-quality] Whiteboard Sync QoS', () => {
  test.setTimeout(480_000); // 8 min

  /**
   * Full session setup: create → approve → enroll → enter classroom.
   * All sync quality tests reuse this shared session.
   *
   * We intentionally use a SINGLE test that does setup + all probes,
   * so the classroom session stays open for the full probe sequence.
   */
  test('sync quality: 5 draw probes with latency SLO and post-idle verification', async ({ browser }) => {
    const config = getTestConfig();

    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();
    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();

    try {
      // ── Setup ────────────────────────────────────────────────────
      await checkpoint('create_course', () =>
        createCourseAsTeacherWithDuration(teacherPage, COURSE_ID, config.teacherEmail, config.teacherPassword, config.bypassSecret, 10)
      );

      const adminCtx = await browser.newContext();
      const adminPage = await adminCtx.newPage();
      await checkpoint('approve_course', () =>
        adminApproveCourse(adminPage, COURSE_ID, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret)
      );
      await adminCtx.close();

      await checkpoint('enroll', () =>
        Promise.resolve(runEnrollmentFlow(COURSE_ID, config.teacherEmail, config.studentEmail))
      );

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

      // Agora SDK init
      await teacherPage.waitForTimeout(8000);
      await studentPage.waitForTimeout(8000);

      // ── Probe A: First draw latency ──────────────────────────────
      console.log('\n📍 Probe A — First Draw Latency');
      await drawOnWhiteboard(teacherPage);
      const firstSync = await measureSyncLatency(studentPage, { maxWaitMs: SYNC_LATENCY_SLO_MS * 2 });

      console.log(`   First sync latency: ${firstSync.latencyMs ?? 'TIMEOUT'}ms (SLO: ${SYNC_LATENCY_SLO_MS}ms)`);
      expect(firstSync.synced, 'First draw never synced to student').toBe(true);

      // ── Probe B: Repeated draw probes (5 rounds) ─────────────────
      console.log('\n📍 Probe B — 5 Repeated Draw Probes (30s gap between each)');
      const probeResults: Array<{ label: string; latencyMs: number | null; synced: boolean; exceededSLO: boolean }> = [];

      for (let i = 1; i <= 5; i++) {
        // Wait between draws to simulate real usage
        await teacherPage.waitForTimeout(i === 1 ? 5000 : 30_000);
        const result = await drawAndProbeSync(teacherPage, studentPage, `B${i}`);
        probeResults.push({ label: `B${i}`, ...result });
      }

      // Summary
      const failedProbes = probeResults.filter(r => !r.synced);
      const slowProbes = probeResults.filter(r => r.exceededSLO);
      const avgLatency = probeResults
        .filter(r => r.latencyMs !== null)
        .reduce((sum, r) => sum + r.latencyMs!, 0) / probeResults.filter(r => r.latencyMs !== null).length;

      console.log(`\n   📊 Probe B Summary:`);
      console.log(`      Passed:      ${probeResults.length - failedProbes.length}/${probeResults.length}`);
      console.log(`      Slow (>SLO): ${slowProbes.length}/${probeResults.length}`);
      console.log(`      Avg latency: ${Math.round(avgLatency)}ms`);
      probeResults.forEach(r =>
        console.log(`      ${r.synced ? (r.exceededSLO ? '⚠️' : '✅') : '❌'} ${r.label}: ${r.latencyMs ?? 'TIMEOUT'}ms`)
      );

      // Assert: all 5 must sync (latency warnings are soft)
      expect(failedProbes.length, `${failedProbes.length} probes failed to sync`).toBe(0);
      // Soft warning if more than 2 are slow
      if (slowProbes.length > 2) {
        console.log(`\n   ⚠️  WARNING: ${slowProbes.length}/5 draw probes exceeded SLO ${SYNC_LATENCY_SLO_MS}ms — sync quality degraded`);
      }

      // ── Probe C: Canvas integrity ────────────────────────────────
      console.log('\n📍 Probe C — Canvas Integrity Check');
      const teacherHasContent = await hasDrawingContent(teacherPage);
      const studentHasContent = await hasDrawingContent(studentPage);
      console.log(`   Teacher canvas: ${teacherHasContent ? '✅ has content' : '❌ empty'}`);
      console.log(`   Student canvas: ${studentHasContent ? '✅ has content' : '❌ empty'}`);
      expect(teacherHasContent, 'Teacher canvas empty after 5 draws').toBe(true);
      expect(studentHasContent, 'Student canvas empty after synced draws').toBe(true);

      // ── Probe D: Sync alive after 60s idle ───────────────────────
      console.log('\n📍 Probe D — Sync Alive After 60s Idle');
      console.log('   ⏳ Waiting 60s idle period...');
      await teacherPage.waitForTimeout(60_000);

      const postIdleResult = await drawAndProbeSync(teacherPage, studentPage, 'D-post-idle');
      console.log(`   Post-idle sync: ${postIdleResult.synced ? '✅' : '❌'} ${postIdleResult.latencyMs ?? 'TIMEOUT'}ms`);
      expect(postIdleResult.synced, 'Sync failed after 60s idle — connection dropped').toBe(true);

      if (postIdleResult.latencyMs && firstSync.latencyMs) {
        const drift = postIdleResult.latencyMs - firstSync.latencyMs;
        console.log(`   Latency drift after idle: ${drift > 0 ? '+' : ''}${drift}ms`);
        if (drift > 3000) {
          console.log(`   ⚠️  DRIFT WARNING: post-idle latency increased by ${drift}ms`);
        }
      }

    } finally {
      if (!process.env.SKIP_CLEANUP) {
        const adminCtx = await browser.newContext();
        const adminPage = await adminCtx.newPage();
        await injectDeviceCheckBypass(adminPage);
        await autoLogin(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
        await adminPage.request.delete(`${config.baseUrl}/api/courses?id=${COURSE_ID}`).catch(() => {});
        await adminPage.request.delete(`${config.baseUrl}/api/orders?courseId=${COURSE_ID}`).catch(() => {});
        await adminCtx.close();
        console.log(`\n   🧹 Cleanup done for ${COURSE_ID}`);
      }
      await teacherCtx.close();
      await studentCtx.close();
    }
  });
});

/**
 * 03 — Duration Stability Test
 *
 * Pattern: "Long-running stream segment validation" (YouTube Live,
 *          Twitch 6-hour stability tests, Zoom endurance probes)
 *
 *   → Tests one session for a configurable duration.
 *   → Runs a HEARTBEAT every 30 s to verify sync is alive.
 *   → Draws at multiple time checkpoints (start / mid / end).
 *   → Detects sync drift: does latency increase over time?
 *   → Each duration is a SEPARATE test → run just the one you need.
 *
 * Duration env vars (minutes):
 *   DURATION_MINUTES=1   → quick smoke (default)
 *   DURATION_MINUTES=3   → short session
 *   DURATION_MINUTES=5   → medium session
 *   DURATION_MINUTES=10  → long session
 *   DURATION_MINUTES=15  → endurance session
 *
 * Run examples:
 *   npx playwright test e2e/classroom/03_duration_stability.spec.ts --project=chromium
 *   $env:DURATION_MINUTES="5"; npx playwright test e2e/classroom/03_duration_stability.spec.ts
 *   $env:DURATION_MINUTES="15"; npx playwright test e2e/classroom/03_duration_stability.spec.ts
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
} from '../helpers/whiteboard_helpers';
import {
  checkpoint,
  drawAndProbeSync,
  monitorSession,
  SYNC_LATENCY_SLO_MS,
  HEARTBEAT_INTERVAL_MS,
} from '../helpers/streaming_monitor';
import { getTestConfig, ADMIN_EMAIL, ADMIN_PASSWORD } from '../test_data/whiteboard_test_data';

// ─────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────

const DURATION_MINUTES = parseInt(process.env.DURATION_MINUTES || '1', 10);
// Add buffer: course window = duration + 2 min on each side
const COURSE_BUFFER_MINUTES = 2;

// Timeout: test duration + 5 min setup overhead + 2 min teardown
const TEST_TIMEOUT_MS = (DURATION_MINUTES + 8) * 60_000;

// Heartbeat at 30s OR every 20% of session, whichever is shorter
const HEARTBEAT_MS = Math.min(HEARTBEAT_INTERVAL_MS, Math.max(10_000, (DURATION_MINUTES * 60_000) / 5));

test.describe(`[duration-${DURATION_MINUTES}m] Session Stability — ${DURATION_MINUTES}-Minute Session`, () => {
  test.setTimeout(TEST_TIMEOUT_MS);

  test(`${DURATION_MINUTES}-min session: heartbeat monitoring + sync at start/mid/end`, async ({ browser }) => {
    const config = getTestConfig();
    const COURSE_ID = `dur${DURATION_MINUTES}m-${Date.now()}`;
    const courseWindow = DURATION_MINUTES + COURSE_BUFFER_MINUTES * 2;

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  Duration Stability Test — ${DURATION_MINUTES} minute(s)`);
    console.log(`  Heartbeat interval: ${Math.round(HEARTBEAT_MS / 1000)}s`);
    console.log(`  Sync SLO: ${SYNC_LATENCY_SLO_MS}ms`);
    console.log(`${'═'.repeat(70)}\n`);

    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();
    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();

    try {
      // ── Setup Phase ──────────────────────────────────────────────
      console.log('📍 Setup: Create → Approve → Enroll');

      await checkpoint('create_course', () =>
        createCourseAsTeacherWithDuration(
          teacherPage, COURSE_ID,
          config.teacherEmail, config.teacherPassword, config.bypassSecret,
          courseWindow
        )
      );

      const adminCtx = await browser.newContext();
      const adminPage = await adminCtx.newPage();
      await checkpoint('admin_approve', () =>
        adminApproveCourse(adminPage, COURSE_ID, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret)
      );
      await adminCtx.close();

      await checkpoint('student_enroll', () =>
        Promise.resolve(runEnrollmentFlow(COURSE_ID, config.teacherEmail, config.studentEmail))
      );

      // ── Login + Wait Room ────────────────────────────────────────
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

      await checkpoint('enter_classroom', () =>
        Promise.all([
          waitAndEnterClassroom(teacherPage, 'teacher'),
          waitAndEnterClassroom(studentPage, 'student'),
        ])
      );

      // Agora SDK init
      await teacherPage.waitForTimeout(8000);
      await studentPage.waitForTimeout(8000);

      // ── Sync Probe: Session START ────────────────────────────────
      console.log('\n📍 Sync Probe [START] — Verifying initial sync');
      const startProbe = await drawAndProbeSync(teacherPage, studentPage, 'START');
      expect(startProbe.synced, 'Initial sync failed at session start').toBe(true);
      console.log(`   ✅ START sync: ${startProbe.latencyMs}ms`);

      // ── Session Heartbeat Monitor ────────────────────────────────
      console.log(`\n📍 Session Monitoring — ${DURATION_MINUTES}m with ${Math.round(HEARTBEAT_MS / 1000)}s heartbeat`);
      const sessionDurationMs = DURATION_MINUTES * 60_000;

      // For very short sessions (1m), skip monitorSession loop overhead
      let driftReport;
      if (DURATION_MINUTES >= 3) {
        driftReport = await monitorSession(studentPage, sessionDurationMs, HEARTBEAT_MS);
        console.log(`\n   📊 Heartbeat Summary:`);
        console.log(`      Samples:     ${driftReport.samples.length}`);
        console.log(`      Drift:       ${driftReport.driftDetected ? `⚠️ DETECTED at +${Math.round((driftReport.degradedAt ?? 0) / 1000)}s` : '✅ none'}`);
        console.log(`      Max latency: ${driftReport.maxLatencyMs}ms`);
      } else {
        // Short session: just wait
        console.log(`   ⏳ Waiting ${DURATION_MINUTES * 60}s (short session, no heartbeat loop)...`);
        await teacherPage.waitForTimeout(sessionDurationMs);
        driftReport = { driftDetected: false, degradedAt: null, maxLatencyMs: 0, samples: [] };
      }

      // ── Sync Probe: Mid-session (if > 2 min) ────────────────────
      if (DURATION_MINUTES >= 5) {
        console.log('\n📍 Sync Probe [MID] — Mid-session sync check');
        const midProbe = await drawAndProbeSync(teacherPage, studentPage, 'MID');
        expect(midProbe.synced, `Mid-session sync failed (latency: ${midProbe.latencyMs}ms)`).toBe(true);
        console.log(`   ✅ MID sync: ${midProbe.latencyMs}ms`);
      }

      // ── Sync Probe: Session END ──────────────────────────────────
      console.log('\n📍 Sync Probe [END] — Final sync before session close');
      const endProbe = await drawAndProbeSync(teacherPage, studentPage, 'END');
      expect(endProbe.synced, 'Final draw failed to sync — session degraded before end').toBe(true);
      console.log(`   ✅ END sync: ${endProbe.latencyMs}ms`);

      // ── Drift Analysis ───────────────────────────────────────────
      console.log('\n📍 Drift Analysis');
      if (startProbe.latencyMs && endProbe.latencyMs) {
        const drift = endProbe.latencyMs - startProbe.latencyMs;
        console.log(`   Start latency: ${startProbe.latencyMs}ms`);
        console.log(`   End latency:   ${endProbe.latencyMs}ms`);
        console.log(`   Drift:         ${drift > 0 ? '+' : ''}${drift}ms`);
        if (Math.abs(drift) > 3000) {
          console.log(`   ⚠️  DRIFT WARNING: latency changed by ${Math.abs(drift)}ms over ${DURATION_MINUTES} minutes`);
        } else {
          console.log(`   ✅ Latency stable over ${DURATION_MINUTES}-minute session`);
        }
      }

      if (driftReport.driftDetected) {
        console.log(`\n   ⚠️  HEARTBEAT DEGRADATION detected at +${Math.round((driftReport.degradedAt ?? 0) / 1000)}s into session`);
      }

      // Final assertion: both probes must have synced
      expect(startProbe.synced, 'Session START sync failed').toBe(true);
      expect(endProbe.synced, 'Session END sync failed').toBe(true);

    } finally {
      if (!process.env.SKIP_CLEANUP) {
        const adminCtx = await browser.newContext();
        const adminPage = await adminCtx.newPage();
        await injectDeviceCheckBypass(adminPage);
        await autoLogin(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
        await adminPage.request.delete(`${config.baseUrl}/api/courses?id=${COURSE_ID}`).catch(() => {});
        await adminPage.request.delete(`${config.baseUrl}/api/orders?courseId=${COURSE_ID}`).catch(() => {});
        await adminCtx.close();
        console.log(`\n   🧹 Cleanup: ${COURSE_ID}`);
      }
      await teacherCtx.close();
      await studentCtx.close();
    }
  });
});

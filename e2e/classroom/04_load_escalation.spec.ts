/**
 * 04 — Staged Load Escalation
 *
 * Pattern: "Graduated rollout / load ramp" (Twitch 1%→10%→100%,
 *          YouTube staged capacity tests, Zoom per-shard load tests)
 *
 *   → Each concurrent level is a SEPARATE test.
 *   → Circuit-breaker: if a level has ≥50% failure, print a warning
 *     and record the result — the next level still runs so you can
 *     measure degradation curve (not hard-abort).
 *   → Success threshold: configurable via SUCCESS_THRESHOLD env var
 *     (default: 0.75 = 75% groups must fully sync).
 *   → Each test measures:
 *       - Enrollment success rate
 *       - Classroom entry success rate
 *       - Whiteboard sync success rate
 *       - Average sync latency across successful groups
 *
 * Load levels:
 *   CONCURRENT_GROUPS=1   → canary load (should be run after 01_canary)
 *   CONCURRENT_GROUPS=3   → small class
 *   CONCURRENT_GROUPS=5   → medium class
 *   CONCURRENT_GROUPS=10  → large class
 *
 * Run a specific level:
 *   $env:CONCURRENT_GROUPS="3"; npx playwright test e2e/classroom/04_load_escalation.spec.ts
 *   $env:CONCURRENT_GROUPS="5"; npx playwright test e2e/classroom/04_load_escalation.spec.ts
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
  checkpoint,
  measureSyncLatency,
  SYNC_LATENCY_SLO_MS,
} from '../helpers/streaming_monitor';
import { getTestConfig, getStressGroupConfigs, ADMIN_EMAIL, ADMIN_PASSWORD } from '../test_data/whiteboard_test_data';

// ─────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────

const GROUP_COUNT = parseInt(process.env.CONCURRENT_GROUPS || '3', 10);
const SUCCESS_THRESHOLD = parseFloat(process.env.SUCCESS_THRESHOLD || '0.75');
const TEST_TIMEOUT_MS = Math.max(600_000, GROUP_COUNT * 120_000 + 300_000);

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

interface GroupResult {
  groupId: string;
  courseId: string;
  enrolled: boolean;
  entered: boolean;
  synced: boolean;
  syncLatencyMs: number | null;
  error?: string;
  phase?: string; // which phase failed
}

function printLoadSummary(results: GroupResult[], groupCount: number): void {
  const enrolled = results.filter(r => r.enrolled).length;
  const entered = results.filter(r => r.entered).length;
  const synced = results.filter(r => r.synced).length;
  const avgLatency = results
    .filter(r => r.syncLatencyMs !== null)
    .reduce((s, r) => s + r.syncLatencyMs!, 0) / Math.max(1, synced);

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📊 Load Escalation Results — ${groupCount} Concurrent Groups`);
  console.log(`${'─'.repeat(70)}`);
  console.log(`  Enrolled:     ${enrolled}/${groupCount} (${Math.round(enrolled / groupCount * 100)}%)`);
  console.log(`  Entered:      ${entered}/${groupCount} (${Math.round(entered / groupCount * 100)}%)`);
  console.log(`  Synced:       ${synced}/${groupCount} (${Math.round(synced / groupCount * 100)}%)`);
  console.log(`  Avg latency:  ${synced > 0 ? Math.round(avgLatency) + 'ms' : 'N/A'}`);
  console.log(`  SLO:          ${SYNC_LATENCY_SLO_MS}ms`);
  console.log(`${'─'.repeat(70)}`);
  for (const r of results) {
    const statusIcon = r.synced ? '✅' : (r.entered ? '⚠️' : '❌');
    const latStr = r.syncLatencyMs !== null ? `${r.syncLatencyMs}ms` : 'N/A';
    const failPhase = r.phase ? ` [failed at: ${r.phase}]` : '';
    console.log(`  ${statusIcon} [${r.groupId}] enrolled=${r.enrolled} entered=${r.entered} sync=${r.synced} lat=${latStr}${failPhase}`);
    if (r.error) console.log(`       ↳ ${r.error}`);
  }
  console.log(`${'─'.repeat(70)}\n`);
}

// ─────────────────────────────────────────────────────────────────────
// Test
// ─────────────────────────────────────────────────────────────────────

test.describe(`[load-${GROUP_COUNT}x] Concurrent Load — ${GROUP_COUNT} Groups`, () => {
  test.setTimeout(TEST_TIMEOUT_MS);

  test(`${GROUP_COUNT} concurrent groups: enrollment → classroom → sync`, async ({ browser }) => {
    const config = getTestConfig();
    const timestamp = Date.now();
    const groupConfigs = getStressGroupConfigs(GROUP_COUNT, timestamp);
    const results: GroupResult[] = groupConfigs.map(g => ({
      groupId: g.groupId,
      courseId: g.courseId,
      enrolled: false,
      entered: false,
      synced: false,
      syncLatencyMs: null,
    }));

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  Load Escalation — ${GROUP_COUNT} Concurrent Groups`);
    console.log(`  Success threshold: ${Math.round(SUCCESS_THRESHOLD * 100)}%`);
    console.log(`${'═'.repeat(70)}`);
    groupConfigs.forEach(g => console.log(`  [${g.groupId}] teacher=${g.teacherEmail} course=${g.courseId}`));

    // ── Phase 1: Course Creation (sequential, one browser context) ─
    console.log('\n📍 Phase 1: Course Creation (sequential)');
    for (let i = 0; i < groupConfigs.length; i++) {
      const g = groupConfigs[i];
      const r = results[i];
      try {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await checkpoint(`create_${g.groupId}`, () =>
          createCourseAsTeacherWithDuration(page, g.courseId, g.teacherEmail, g.teacherPassword, config.bypassSecret, 10)
        );
        await ctx.close();
        console.log(`   ✅ [${g.groupId}] Course created`);
      } catch (err) {
        r.error = `Course creation: ${(err as Error).message}`;
        r.phase = 'course_creation';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }

    // ── Phase 2: Admin Approval (single admin session) ─────────────
    console.log('\n📍 Phase 2: Admin Approval');
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    for (let i = 0; i < groupConfigs.length; i++) {
      const g = groupConfigs[i];
      const r = results[i];
      if (r.phase) continue; // skip if already failed
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

    // ── Phase 3: Enrollment (sequential — prevents DynamoDB throttle) ──
    console.log('\n📍 Phase 3: Student Enrollment (sequential)');
    for (let i = 0; i < groupConfigs.length; i++) {
      const g = groupConfigs[i];
      const r = results[i];
      if (r.phase) continue;
      try {
        await checkpoint(`enroll_${g.groupId}`, () =>
          Promise.resolve(runEnrollmentFlow(g.courseId, g.teacherEmail, g.studentEmail))
        );
        r.enrolled = true;
        console.log(`   ✅ [${g.groupId}] Enrolled`);
      } catch (err) {
        r.error = `Enrollment: ${(err as Error).message}`;
        r.phase = 'enrollment';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }

    // Circuit breaker: if fewer than 50% enrolled, warn loudly
    const enrolledCount = results.filter(r => r.enrolled).length;
    if (enrolledCount < GROUP_COUNT * 0.5) {
      console.log(`\n   🚨 CIRCUIT BREAKER WARNING: only ${enrolledCount}/${GROUP_COUNT} groups enrolled`);
      console.log(`      Likely DynamoDB throttling or course creation issue.`);
      console.log(`      Continuing to measure partial degradation...\n`);
    }

    // ── Phase 4: Parallel Classroom Entry ─────────────────────────
    console.log('\n📍 Phase 4: Parallel Classroom Entry');

    interface GroupSession {
      idx: number;
      teacherCtx: any;
      teacherPage: any;
      studentCtx: any;
      studentPage: any;
    }

    const sessions: GroupSession[] = [];

    for (let i = 0; i < groupConfigs.length; i++) {
      if (!results[i].enrolled) continue;
      const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
      const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
      sessions.push({
        idx: i,
        teacherCtx,
        teacherPage: await teacherCtx.newPage(),
        studentCtx,
        studentPage: await studentCtx.newPage(),
      });
    }

    // Login all in parallel
    await Promise.all(sessions.map(async s => {
      const g = groupConfigs[s.idx];
      await injectDeviceCheckBypass(s.teacherPage);
      await injectDeviceCheckBypass(s.studentPage);
      await autoLogin(s.teacherPage, g.teacherEmail, g.teacherPassword, config.bypassSecret);
      await autoLogin(s.studentPage, g.studentEmail, g.studentPassword, config.bypassSecret);
    }));

    // Navigate to wait room in parallel
    await Promise.allSettled(sessions.map(async s => {
      const g = groupConfigs[s.idx];
      const r = results[s.idx];
      try {
        await goToWaitRoom(s.teacherPage, g.courseId, 'teacher');
        await goToWaitRoom(s.studentPage, g.courseId, 'student');
      } catch (err) {
        r.error = `Wait room nav: ${(err as Error).message}`;
        r.phase = 'waitroom_nav';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }));

    // Enter classroom: sequential ready clicks per group (DynamoDB safety)
    for (const s of sessions) {
      const g = groupConfigs[s.idx];
      const r = results[s.idx];
      if (r.phase) continue;
      try {
        await enterClassroom(s.teacherPage, 'teacher');
        await clickReadyButton(s.teacherPage, 'teacher');
        await enterClassroom(s.studentPage, 'student');
        await clickReadyButton(s.studentPage, 'student');
        await Promise.all([
          waitAndEnterClassroom(s.teacherPage, 'teacher'),
          waitAndEnterClassroom(s.studentPage, 'student'),
        ]);
        r.entered = true;
        console.log(`   ✅ [${g.groupId}] Entered classroom`);
      } catch (err) {
        r.error = `Classroom entry: ${(err as Error).message}`;
        r.phase = 'classroom_entry';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }

    // Agora SDK init wait
    await Promise.all(sessions
      .filter(s => results[s.idx].entered)
      .map(s => s.teacherPage.waitForTimeout(8000).catch(() => {}))
    );

    // ── Phase 5: Whiteboard Draw + Sync Verification (parallel) ───
    console.log('\n📍 Phase 5: Whiteboard Draw + Sync Verification (parallel)');

    await Promise.allSettled(sessions.map(async s => {
      const g = groupConfigs[s.idx];
      const r = results[s.idx];
      if (!r.entered) return;

      try {
        await drawOnWhiteboard(s.teacherPage);
        const syncResult = await measureSyncLatency(s.studentPage, { maxWaitMs: SYNC_LATENCY_SLO_MS * 2 });

        r.syncLatencyMs = syncResult.latencyMs;
        r.synced = syncResult.synced;

        if (syncResult.synced) {
          const icon = syncResult.exceededSLO ? '⚠️' : '✅';
          console.log(`   ${icon} [${g.groupId}] Synced in ${syncResult.latencyMs}ms`);
        } else {
          console.error(`   ❌ [${g.groupId}] Sync timeout after ${SYNC_LATENCY_SLO_MS * 2}ms`);
          r.phase = 'whiteboard_sync';
        }
      } catch (err) {
        r.error = `Sync check: ${(err as Error).message}`;
        r.phase = 'whiteboard_sync';
        console.error(`   ❌ [${g.groupId}] ${r.error}`);
      }
    }));

    // ── Cleanup ───────────────────────────────────────────────────
    for (const s of sessions) {
      await s.teacherCtx.close().catch(() => {});
      await s.studentCtx.close().catch(() => {});
    }

    if (!process.env.SKIP_CLEANUP) {
      const cleanAdminCtx = await browser.newContext();
      const cleanAdminPage = await cleanAdminCtx.newPage();
      await injectDeviceCheckBypass(cleanAdminPage);
      await autoLogin(cleanAdminPage, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
      for (const g of groupConfigs) {
        await cleanAdminPage.request.delete(`${config.baseUrl}/api/courses?id=${g.courseId}`).catch(() => {});
        await cleanAdminPage.request.delete(`${config.baseUrl}/api/orders?courseId=${g.courseId}`).catch(() => {});
      }
      await cleanAdminCtx.close();
      console.log(`\n   🧹 Cleanup complete for ${GROUP_COUNT} groups`);
    }

    // ── Results Summary + Assert ──────────────────────────────────
    printLoadSummary(results, GROUP_COUNT);

    const syncedCount = results.filter(r => r.synced).length;
    const achievedRate = syncedCount / GROUP_COUNT;

    console.log(`   Required success rate: ${Math.round(SUCCESS_THRESHOLD * 100)}%`);
    console.log(`   Achieved success rate: ${Math.round(achievedRate * 100)}%`);

    if (achievedRate < SUCCESS_THRESHOLD) {
      // Identify the most common failure phase
      const phaseCounts: Record<string, number> = {};
      for (const r of results.filter(r => r.phase)) {
        phaseCounts[r.phase!] = (phaseCounts[r.phase!] || 0) + 1;
      }
      const topPhase = Object.entries(phaseCounts).sort((a, b) => b[1] - a[1])[0];
      console.log(`\n   🚨 Most failures at phase: ${topPhase?.[0] ?? 'unknown'} (${topPhase?.[1] ?? 0} groups)`);
    }

    expect(
      achievedRate,
      `Load test (${GROUP_COUNT}x) failed: ${syncedCount}/${GROUP_COUNT} groups synced (need ${Math.round(SUCCESS_THRESHOLD * 100)}%)`
    ).toBeGreaterThanOrEqual(SUCCESS_THRESHOLD);
  });
});

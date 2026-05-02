/**
 * Multi-Duration Stress Test for Classroom Whiteboard Sync
 * 
 * This test runs stress tests with different course durations (1, 3, 5, 10, 15 minutes)
 * and escalating concurrent loads (1, 3, 5, 10 concurrent groups).
 * 
 * Usage:
 *   npx playwright test e2e/classroom_stress_test_multi_duration.spec.ts -g "stress" --project=chromium
 *
 * Environment Variables:
 *   TEST_DURATIONS=1,3,5 (override default durations)
 *   TEST_CONCURRENT_LOADS=1,3,5 (override default concurrent loads)
 *   NEXT_PUBLIC_BASE_URL=http://www.jvtutorcorner.com (set production URL)
 */

import { test, expect, Browser } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import {
  getTestConfig,
  getStressGroupConfigs,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  COURSE_ID_PREFIXES,
} from './test_data/whiteboard_test_data';
import {
  runEnrollmentFlow,
  injectDeviceCheckBypass,
  autoLogin,
  goToWaitRoom,
  enterClassroom,
  clickReadyButton,
  waitAndEnterClassroom,
  drawOnWhiteboard,
  hasDrawingContent,
  createCourseAsTeacherWithDuration,
  adminApproveCourse,
  cleanupTestData,
} from './helpers/whiteboard_helpers';
import { measureSyncLatency } from './helpers/streaming_monitor';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// ─────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────

const DEFAULT_DURATIONS = [1, 3, 5, 10, 15]; // minutes
const DEFAULT_CONCURRENT_LOADS = [1, 3, 5, 10]; // number of concurrent groups

const TEST_DURATIONS = process.env.TEST_DURATIONS 
  ? process.env.TEST_DURATIONS.split(',').map(d => parseInt(d, 10))
  : DEFAULT_DURATIONS;

const TEST_CONCURRENT_LOADS = process.env.TEST_CONCURRENT_LOADS
  ? process.env.TEST_CONCURRENT_LOADS.split(',').map(c => parseInt(c, 10))
  : DEFAULT_CONCURRENT_LOADS;

const STAY_SECONDS_MIN = parseInt(process.env.GROUP_STAY_SECONDS_MIN || '15', 10);
const STAY_SECONDS_STEP = parseInt(process.env.GROUP_STAY_SECONDS_STEP || '15', 10);
const STAY_SECONDS_MAX = parseInt(process.env.GROUP_STAY_SECONDS_MAX || '90', 10);

function getGroupStaySeconds(concurrentLoad: number): number[] {
  const raw = process.env.GROUP_STAY_SECONDS;
  if (raw && raw.trim()) {
    const parsed = raw
      .split(',')
      .map(v => parseInt(v.trim(), 10))
      .filter(v => Number.isFinite(v) && v >= 0);
    if (parsed.length > 0) {
      return Array.from({ length: concurrentLoad }, (_, idx) => parsed[idx % parsed.length]);
    }
  }

  return Array.from({ length: concurrentLoad }, (_, idx) =>
    Math.min(STAY_SECONDS_MIN + idx * STAY_SECONDS_STEP, STAY_SECONDS_MAX)
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helper: Generate unique course IDs for each duration/load combination
// ─────────────────────────────────────────────────────────────────────

function generateCourseId(durationMinutes: number, groupIndex: number, timestamp: number): string {
  return `${COURSE_ID_PREFIXES.stress}${durationMinutes}m-g${groupIndex}-${timestamp}`;
}

// ─────────────────────────────────────────────────────────────────────
// Test Suite: Multi-Duration Stress Tests
// ─────────────────────────────────────────────────────────────────────

test.describe('[stress-multi-duration] Escalating Concurrent Loads with Variable Course Durations', () => {
  test.setTimeout(1200000); // 20 minutes timeout for full test suite

  for (const durationMinutes of TEST_DURATIONS) {
    for (const concurrentLoad of TEST_CONCURRENT_LOADS) {
      const testName = `stress-duration-${durationMinutes}m-load-${concurrentLoad}groups`;

      test(testName, async ({ browser }) => {
        const config = getTestConfig();
        const baseUrl = config.baseUrl;
        const timestamp = Date.now();

        console.log(`\n${'═'.repeat(80)}`);
        console.log(`🔴 MULTI-DURATION STRESS TEST`);
        console.log(`   📊 Course Duration: ${durationMinutes} minutes`);
        console.log(`   👥 Concurrent Groups: ${concurrentLoad}`);
        console.log(`   🕐 Timestamp: ${timestamp}`);
        console.log(`${'═'.repeat(80)}\n`);

        // ─── Step 1: Generate group configurations ───
        const groupConfigs = getStressGroupConfigs(concurrentLoad, timestamp).map((g, idx) => ({
          ...g,
          courseId: generateCourseId(durationMinutes, idx, timestamp),
        }));
        const groupStaySeconds = getGroupStaySeconds(concurrentLoad);

        console.log(`   🕒 Group stay seconds: ${groupStaySeconds.join(', ')}`);

        console.log(`📍 Step 1: Creating ${concurrentLoad} courses (${durationMinutes}min each)...`);
        const courseCreationErrors: string[] = [];

        for (const group of groupConfigs) {
          try {
            const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
            const teacherPage = await teacherCtx.newPage();

            console.log(`   ⏳ [${group.groupId}] Teacher creating course...`);
            await createCourseAsTeacherWithDuration(
              teacherPage,
              group.courseId,
              group.teacherEmail,
              group.teacherPassword,
              config.bypassSecret,
              durationMinutes
            );

            await teacherCtx.close();
          } catch (err) {
            const errorMsg = `[${group.groupId}] Course creation failed: ${(err as Error)?.message || String(err)}`;
            console.error(`   ❌ ${errorMsg}`);
            courseCreationErrors.push(errorMsg);
          }
        }

        if (courseCreationErrors.length > 0) {
          console.error(`\n⚠️ Course Creation Phase: ${courseCreationErrors.length}/${concurrentLoad} errors`);
          courseCreationErrors.forEach(e => console.error(`    - ${e}`));
        } else {
          console.log(`✅ All ${concurrentLoad} courses created successfully`);
        }

        // ─── Step 2: Admin approves all courses (SEQUENTIAL) ───
        console.log(`\n📍 Step 2: Admin approving all ${concurrentLoad} courses...`);
        const adminCtx = await browser.newContext();
        const adminPage = await adminCtx.newPage();

        for (const group of groupConfigs) {
          try {
            await adminApproveCourse(
              adminPage,
              group.courseId,
              ADMIN_EMAIL,
              ADMIN_PASSWORD,
              config.bypassSecret
            );
          } catch (err) {
            console.error(`   ❌ [${group.groupId}] Admin approval failed: ${(err as Error)?.message}`);
          }
        }
        await adminCtx.close();
        console.log(`✅ Admin approval phase completed`);

        // ─── Step 3: Trigger enrollment flows (PARALLEL but with waits) ───
        console.log(`\n📍 Step 3: Triggering enrollment flows for all groups...`);
        const enrollmentPromises = groupConfigs.map(g => 
          new Promise<string>((resolve) => {
            runEnrollmentFlow(g.courseId, g.teacherEmail, g.studentEmail);
            resolve(g.courseId);
          })
        );
        await Promise.allSettled(enrollmentPromises);
        console.log(`✅ Enrollment flows triggered`);

        // ─── Step 4: Execute stress test - all groups enter classroom in parallel ───
        console.log(`\n📍 Step 4: ${concurrentLoad} concurrent groups entering classroom (${durationMinutes}min course)...`);
        
        const testStart = Date.now();
        const groupErrors: Array<{ groupId: string; error: string }> = [];
        const groupResults: Array<{
          groupId: string;
          duration: number;
          staySeconds: number;
          canvasDrawn: boolean;
          canvasSynced: boolean;
          postStaySynced: boolean;
          initialSyncLatencyMs: number | null;
          postStaySyncLatencyMs: number | null;
        }> = [];

        const groupPromises = groupConfigs.map(async (group) => {
          const groupTimer = Date.now();
          try {
            // Create contexts for teacher and student
            const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
            const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });

            const teacherPage = await teacherCtx.newPage();
            const studentPage = await studentCtx.newPage();

            // ─── Login & Navigation ───
            console.log(`   ⏳ [${group.groupId}] Logging in and navigating...`);
            await injectDeviceCheckBypass(teacherPage);
            await autoLogin(teacherPage, group.teacherEmail, group.teacherPassword, config.bypassSecret);
            await goToWaitRoom(teacherPage, group.courseId, 'teacher');

            await injectDeviceCheckBypass(studentPage);
            await autoLogin(studentPage, group.studentEmail, group.studentPassword, config.bypassSecret);
            await goToWaitRoom(studentPage, group.courseId, 'student');

            // ─── Enter Classroom (Sequential: teacher → student) ───
            console.log(`   ⏳ [${group.groupId}] Teacher entering classroom...`);
            await enterClassroom(teacherPage, 'teacher');
            
            console.log(`   ⏳ [${group.groupId}] Student entering classroom...`);
            await enterClassroom(studentPage, 'student');

            // ─── Ready Button (Sequential: teacher → student) ───
            console.log(`   ⏳ [${group.groupId}] Teacher clicking ready...`);
            await clickReadyButton(teacherPage, 'teacher');
            
            console.log(`   ⏳ [${group.groupId}] Student clicking ready...`);
            await clickReadyButton(studentPage, 'student');

            // ─── Final Classroom Entry (Parallel) ───
            console.log(`   ⏳ [${group.groupId}] Final classroom entry...`);
            await Promise.all([
              waitAndEnterClassroom(teacherPage, 'teacher'),
              waitAndEnterClassroom(studentPage, 'student'),
            ]);

            // ─── Whiteboard Drawing & Sync Verification ───
            console.log(`   ⏳ [${group.groupId}] Verifying whiteboard...`);
            const teacherCanvas = teacherPage.locator('canvas:visible').first();
            await expect(teacherCanvas).toBeVisible({ timeout: 30000 });
            console.log(`   ✅ [${group.groupId}] Canvas visible for teacher`);

            // Teacher first draw (baseline sync)
            await drawOnWhiteboard(teacherPage);
            console.log(`   ✅ [${group.groupId}] Teacher drawing completed`);

            // Verify teacher's canvas has drawing
            const teacherDrawn = await hasDrawingContent(teacherPage);
            console.log(`   📊 [${group.groupId}] Teacher canvas check: ${teacherDrawn}`);

            const initialSync = await measureSyncLatency(studentPage, { maxWaitMs: 20000, pollIntervalMs: 500 });
            console.log(`   📊 [${group.groupId}] Initial sync latency: ${initialSync.latencyMs ?? 'TIMEOUT'}ms`);

            const staySeconds = groupStaySeconds[parseInt(group.groupId.replace('group-', ''), 10)] ?? STAY_SECONDS_MIN;
            console.log(`   ⏳ [${group.groupId}] Staying in classroom for ${staySeconds}s to verify stability...`);
            await teacherPage.waitForTimeout(staySeconds * 1000);

            // Post-stay sync probe
            await drawOnWhiteboard(teacherPage);
            const postStaySync = await measureSyncLatency(studentPage, { maxWaitMs: 20000, pollIntervalMs: 500 });
            console.log(`   📊 [${group.groupId}] Post-stay sync latency: ${postStaySync.latencyMs ?? 'TIMEOUT'}ms`);

            const studentSynced = initialSync.synced;
            const postStaySynced = postStaySync.synced;

            if (!teacherPage.url().includes('/classroom/room') || !studentPage.url().includes('/classroom/room')) {
              throw new Error('Connection dropped before post-stay verification');
            }

            // Calculate duration
            const groupDuration = Date.now() - groupTimer;
            groupResults.push({
              groupId: group.groupId,
              duration: groupDuration,
              staySeconds,
              canvasDrawn: teacherDrawn,
              canvasSynced: studentSynced,
              postStaySynced,
              initialSyncLatencyMs: initialSync.latencyMs,
              postStaySyncLatencyMs: postStaySync.latencyMs,
            });

            console.log(`   ✅ [${group.groupId}] Completed in ${(groupDuration / 1000).toFixed(2)}s (stay ${staySeconds}s)`);

            if (!postStaySynced) {
              throw new Error(`Post-stay sync failed after ${staySeconds}s dwell`);
            }

            // Cleanup
            await teacherCtx.close();
            await studentCtx.close();
          } catch (err) {
            const errorMsg = `${(err as Error)?.message || String(err)}`;
            groupErrors.push({ groupId: group.groupId, error: errorMsg });
            console.error(`   ❌ [${group.groupId}] Failed: ${errorMsg}`);
          }
        });

        // Execute all groups in parallel
        await Promise.allSettled(groupPromises);
        const totalDuration = Date.now() - testStart;

        // ─── Report Results ───
        console.log(`\n${'─'.repeat(80)}`);
        console.log(`📊 TEST RESULTS - Duration: ${durationMinutes}m, Load: ${concurrentLoad} groups`);
        console.log(`${'─'.repeat(80)}`);
        
        console.log(`\n⏱️  Timing:`);
        console.log(`   Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
        console.log(`   Average per Group: ${(totalDuration / concurrentLoad / 1000).toFixed(2)}s`);

        console.log(`\n📈 Group Results:`);
        groupResults.forEach(result => {
          console.log(
            `   [${result.groupId}] total=${(result.duration / 1000).toFixed(1)}s | stay=${result.staySeconds}s | ` +
            `teacher=${result.canvasDrawn ? '✅' : '❌'} | initSync=${result.canvasSynced ? '✅' : '❌'}(${result.initialSyncLatencyMs ?? 'TIMEOUT'}ms) | ` +
            `postStaySync=${result.postStaySynced ? '✅' : '❌'}(${result.postStaySyncLatencyMs ?? 'TIMEOUT'}ms)`
          );
        });

        if (groupErrors.length > 0) {
          console.log(`\n❌ Failures (${groupErrors.length}):`);
          groupErrors.forEach(err => {
            console.log(`   [${err.groupId}] ${err.error}`);
          });
        }

        console.log(`\n🎯 Success Rate: ${((groupResults.length / concurrentLoad) * 100).toFixed(1)}%`);

        // ─── Cleanup ───
        console.log(`\n📍 Cleanup: Deleting ${concurrentLoad} test courses...`);
        const cleanupCtx = await browser.newContext();
        const cleanupPage = await cleanupCtx.newPage();
        await cleanupTestData(
          cleanupPage,
          groupConfigs.map(g => g.courseId),
          concurrentLoad,
          config.bypassSecret
        );
        await cleanupCtx.close();

        // ─── Final Assertion ───
        const successCount = groupResults.filter(r => r.canvasDrawn && r.canvasSynced && r.postStaySynced).length;
        const expectedSuccess = concurrentLoad;
        
        console.log(`\n${'═'.repeat(80)}`);
        if (successCount >= expectedSuccess * 0.8) {
          console.log(`✅ STRESS TEST PASSED`);
          console.log(`   ${successCount}/${expectedSuccess} groups completed successfully (≥80% success rate)`);
        } else {
          console.log(`⚠️ STRESS TEST WARNING`);
          console.log(`   ${successCount}/${expectedSuccess} groups completed successfully (<80% success rate)`);
        }
        console.log(`${'═'.repeat(80)}\n`);

        expect(successCount).toBeGreaterThanOrEqual(expectedSuccess * 0.8);
      });
    }
  }
});

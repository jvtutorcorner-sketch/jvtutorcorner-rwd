/**
 * recording_helper.ts
 *
 * Provides utilities for video recording and Playwright trace capture
 * when running classroom stress tests in headless mode.
 *
 * Storage Strategy:
 *   - Env override: PLAYWRIGHT_RECORDINGS_ROOT
 *   - Default     : <repo>/test-results/playwright-recordings/<runId>/
 *
 * Usage (in a test):
 *   const rec = await RecordingSession.create(browser, groupId, runId, isHeadless);
 *   // ... run test steps on rec.teacherPage / rec.studentPage ...
 *   await rec.stop(passed);   // saves video + trace on headless; no-op on headed
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Browser, BrowserContext, Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Drive-aware base directory
// ─────────────────────────────────────────────────────────────────────────────

function getRecordingsRoot(): string {
  return process.env.PLAYWRIGHT_RECORDINGS_ROOT
    ? path.resolve(process.env.PLAYWRIGHT_RECORDINGS_ROOT)
    : path.resolve(process.cwd(), 'test-results', 'playwright-recordings');
}

export const RECORDINGS_ROOT = getRecordingsRoot();

/**
 * Build the directory for a specific test run.
 * Pattern: <root>/<runId>/<groupId>/
 */
export function buildRunDir(runId: string, groupId: string): string {
  return path.join(RECORDINGS_ROOT, runId, groupId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Context factory: adds video + trace when headless
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordedContext {
  ctx: BrowserContext;
  page: Page;
  /** Call after the test completes (pass = true) or fails (pass = false). */
  finalise(passed: boolean): Promise<void>;
}

/**
 * Create a BrowserContext with optional video recording and tracing.
 *
 * @param browser     - The Playwright Browser instance.
 * @param runDir      - Directory where recordings for this group are stored.
 * @param role        - 'teacher' | 'student' — used to name the output files.
 * @param isHeadless  - Activates video recording + tracing only when true.
 * @param extraOpts   - Additional newContext options (e.g. permissions).
 */
export async function createRecordedContext(
  browser: Browser,
  runDir: string,
  role: 'teacher' | 'student',
  isHeadless: boolean,
  extraOpts: Parameters<Browser['newContext']>[0] = {}
): Promise<RecordedContext> {
  const videoDir = path.join(runDir, 'videos', role);
  const traceDir = path.join(runDir, 'traces');

  if (isHeadless) {
    fs.mkdirSync(videoDir, { recursive: true });
    fs.mkdirSync(traceDir, { recursive: true });
  }

  const ctx = await browser.newContext({
    ...extraOpts,
    ...(isHeadless
      ? {
          recordVideo: {
            dir: videoDir,
            size: { width: 1280, height: 720 },
          },
        }
      : {}),
  });

  if (isHeadless) {
    await ctx.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });
  }

  const page = await ctx.newPage();

  const finalise = async (passed: boolean): Promise<void> => {
    if (!isHeadless) {
      await ctx.close().catch(() => {});
      return;
    }

    // Save trace
    const traceLabel = passed ? 'pass' : 'fail';
    const tracePath = path.join(traceDir, `${role}-${traceLabel}.zip`);
    try {
      await ctx.tracing.stop({ path: tracePath });
      console.log(`   🎞️  [${role}] Trace saved → ${tracePath}`);
    } catch (e) {
      console.warn(`   ⚠️  [${role}] Trace save error: ${(e as Error).message}`);
    }

    // Close context — this triggers video file finalisation
    await ctx.close().catch(() => {});

    // Log video path for reference
    const videoFiles = fs.existsSync(videoDir)
      ? fs.readdirSync(videoDir).filter(f => f.endsWith('.webm'))
      : [];
    if (videoFiles.length > 0) {
      console.log(`   🎬 [${role}] Video saved → ${path.join(videoDir, videoFiles[0])}`);
    }
  };

  return { ctx, page, finalise };
}

// ─────────────────────────────────────────────────────────────────────────────
// High-level session: wraps both teacher + student contexts for a group
// ─────────────────────────────────────────────────────────────────────────────

export interface GroupRecordingSession {
  teacherCtx: BrowserContext;
  teacherPage: Page;
  studentCtx: BrowserContext;
  studentPage: Page;
  /** Finalise both contexts. Call in every code path (pass/fail). */
  finalise(passed: boolean): Promise<void>;
}

/**
 * Create a paired teacher+student recording session for a single group.
 *
 * @param browser    - The Playwright Browser instance.
 * @param groupId    - Group identifier string (e.g. 'group-0').
 * @param runId      - Unique run identifier (e.g. timestamp string or test name).
 * @param isHeadless - Whether to activate recording.
 */
export async function createGroupRecordingSession(
  browser: Browser,
  groupId: string,
  runId: string,
  isHeadless: boolean
): Promise<GroupRecordingSession> {
  const runDir = buildRunDir(runId, groupId);

  const teacher = await createRecordedContext(browser, runDir, 'teacher', isHeadless, {
    permissions: ['camera', 'microphone'],
  });
  const student = await createRecordedContext(browser, runDir, 'student', isHeadless, {
    permissions: ['camera', 'microphone'],
  });

  const finalise = async (passed: boolean): Promise<void> => {
    await Promise.allSettled([teacher.finalise(passed), student.finalise(passed)]);
  };

  return {
    teacherCtx: teacher.ctx,
    teacherPage: teacher.page,
    studentCtx: student.ctx,
    studentPage: student.page,
    finalise,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: print recording output summary at the end of a test run
// ─────────────────────────────────────────────────────────────────────────────

export function printRecordingSummary(runId: string, groupIds: string[]): void {
  const root = path.join(RECORDINGS_ROOT, runId);
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📹 Recording Output — Run: ${runId}`);
  console.log(`   Root: ${root}`);
  for (const gid of groupIds) {
    const dir = path.join(root, gid);
    if (!fs.existsSync(dir)) continue;

    const videos: string[] = [];
    const traces: string[] = [];

    const videoTeacher = path.join(dir, 'videos', 'teacher');
    const videoStudent = path.join(dir, 'videos', 'student');
    const traceDir     = path.join(dir, 'traces');

    [videoTeacher, videoStudent].forEach(d => {
      if (fs.existsSync(d)) {
        fs.readdirSync(d)
          .filter(f => f.endsWith('.webm'))
          .forEach(f => videos.push(path.join(d, f)));
      }
    });

    if (fs.existsSync(traceDir)) {
      fs.readdirSync(traceDir)
        .filter(f => f.endsWith('.zip'))
        .forEach(f => traces.push(path.join(traceDir, f)));
    }

    if (videos.length > 0 || traces.length > 0) {
      console.log(`\n   [${gid}]`);
      videos.forEach(v  => console.log(`     🎬 ${v}`));
      traces.forEach(t  => console.log(`     🎞️  ${t}  (view: npx playwright show-trace "${t}")`));
    }
  }
  console.log(`${'─'.repeat(70)}\n`);
}

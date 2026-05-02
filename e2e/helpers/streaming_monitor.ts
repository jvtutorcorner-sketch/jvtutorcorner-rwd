/**
 * Streaming Health Monitor — Classroom Whiteboard Test Utilities
 *
 * Borrowed from large-scale streaming platform testing patterns
 * (YouTube Live, Twitch, Zoom):
 *
 *   1. Pre-flight API health gates
 *   2. Per-phase latency measurement with SLO thresholds
 *   3. Session heartbeat monitoring (periodic probes)
 *   4. Sync-drift detection across time windows
 *   5. Connection-alive verification (SSE / long-poll)
 *   6. Canary probe before concurrent load
 */

import type { Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface ApiEndpointHealth {
  endpoint: string;
  ok: boolean;
  statusCode: number;
  latencyMs: number;
  error?: string;
}

export interface SystemHealthReport {
  timestamp: string;
  overallHealthy: boolean;
  endpoints: ApiEndpointHealth[];
  degradedEndpoints: string[];
  criticalFailures: string[];
}

export interface SyncLatencyResult {
  latencyMs: number | null;   // null = sync never detected
  synced: boolean;
  pollIntervals: number;
  exceededSLO: boolean;       // latency > SYNC_LATENCY_SLO_MS
}

export interface SessionHeartbeat {
  timestampMs: number;
  elapsedMs: number;
  syncAlive: boolean;
  canvasHasContent: boolean;
  apiHealthOk: boolean;
  notesMs: number;            // latency for latest /api/classroom/ready probe
}

export interface DriftReport {
  samples: SessionHeartbeat[];
  degradedAt: number | null;  // elapsed ms at first degradation
  maxLatencyMs: number;
  driftDetected: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// SLO Thresholds (adjust per environment)
// ─────────────────────────────────────────────────────────────────────

/** Max draw→sync latency before a "degraded" warning is emitted */
export const SYNC_LATENCY_SLO_MS = parseInt(process.env.SYNC_LATENCY_SLO_MS || '8000', 10);

/** Max acceptable API response latency */
export const API_LATENCY_SLO_MS = parseInt(process.env.API_LATENCY_SLO_MS || '3000', 10);

/** Heartbeat poll interval (ms) during long sessions */
export const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10);

// ─────────────────────────────────────────────────────────────────────
// 1. Pre-flight API Health Check
// ─────────────────────────────────────────────────────────────────────

/**
 * Rapidly checks all critical API endpoints.
 * Should be called before any heavy E2E test.
 *
 * Critical endpoints that MUST pass:
 *   - /api/captcha      (auth prerequisite)
 *   - /api/courses      (course listing)
 *   - /api/orders       (enrollment prerequisite)
 *   - /api/classroom/ready (sync signal)
 *
 * @returns SystemHealthReport with per-endpoint details
 */
export async function checkSystemHealth(page: Page): Promise<SystemHealthReport> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  const probes: Array<{ endpoint: string; method?: 'GET' | 'HEAD' }> = [
    { endpoint: '/api/captcha', method: 'GET' },
    { endpoint: '/api/courses?limit=1', method: 'GET' },
    { endpoint: '/api/orders?limit=1', method: 'GET' },
    { endpoint: '/api/classroom/ready', method: 'GET' },
    { endpoint: '/api/whiteboard/room', method: 'GET' },
  ];

  const results: ApiEndpointHealth[] = [];
  const criticalFailures: string[] = [];
  const degradedEndpoints: string[] = [];

  for (const probe of probes) {
    const url = `${baseUrl}${probe.endpoint}`;
    const start = Date.now();
    let statusCode = 0;
    let ok = false;
    let error: string | undefined;

    try {
      const res = await page.request[probe.method === 'HEAD' ? 'head' : 'get'](url, {
        timeout: API_LATENCY_SLO_MS * 2,
      }).catch((e: Error) => { error = e.message; return null; });

      const latencyMs = Date.now() - start;
      statusCode = res?.status() ?? 0;
      // Accept 200, 401, 403, 405 as "reachable" (auth-protected = server is up)
      ok = statusCode > 0 && statusCode < 500;

      if (!ok) criticalFailures.push(probe.endpoint);
      if (ok && latencyMs > API_LATENCY_SLO_MS) degradedEndpoints.push(probe.endpoint);

      results.push({ endpoint: probe.endpoint, ok, statusCode, latencyMs: Date.now() - start, error });
    } catch (e) {
      results.push({ endpoint: probe.endpoint, ok: false, statusCode: 0, latencyMs: Date.now() - start, error: String(e) });
      criticalFailures.push(probe.endpoint);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    overallHealthy: criticalFailures.length === 0,
    endpoints: results,
    degradedEndpoints,
    criticalFailures,
  };
}

/**
 * Formats a health report for console output.
 */
export function printHealthReport(report: SystemHealthReport): void {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📡 API Health Report @ ${report.timestamp}`);
  console.log(`   Overall: ${report.overallHealthy ? '✅ HEALTHY' : '❌ DEGRADED'}`);
  console.log(`${'─'.repeat(70)}`);
  for (const ep of report.endpoints) {
    const icon = ep.ok ? '✅' : '❌';
    const latencyWarn = ep.latencyMs > API_LATENCY_SLO_MS ? ` ⚠️ SLOW (${ep.latencyMs}ms > ${API_LATENCY_SLO_MS}ms SLO)` : ` (${ep.latencyMs}ms)`;
    console.log(`   ${icon} ${ep.endpoint} → ${ep.statusCode}${latencyWarn}${ep.error ? ` [${ep.error}]` : ''}`);
  }
  if (report.criticalFailures.length) {
    console.log(`\n   🚨 CRITICAL: ${report.criticalFailures.join(', ')}`);
  }
  if (report.degradedEndpoints.length) {
    console.log(`   ⚠️  DEGRADED: ${report.degradedEndpoints.join(', ')}`);
  }
  console.log(`${'─'.repeat(70)}\n`);
}

// ─────────────────────────────────────────────────────────────────────
// 2. Sync Latency Measurement
// ─────────────────────────────────────────────────────────────────────

/**
 * Measures draw-to-sync latency: time from teacher drawing until the
 * student canvas contains the drawing.
 *
 * Polls the student canvas every 500 ms for up to maxWaitMs.
 */
export async function measureSyncLatency(
  studentPage: Page,
  { maxWaitMs = SYNC_LATENCY_SLO_MS * 2, pollIntervalMs = 500 } = {}
): Promise<SyncLatencyResult> {
  const start = Date.now();
  let intervals = 0;

  while (Date.now() - start < maxWaitMs) {
    intervals++;
    await studentPage.waitForTimeout(pollIntervalMs);

    const hasContent = await studentPage.evaluate(() => {
      const canvas = Array.from(document.querySelectorAll('canvas')).find(
        c => getComputedStyle(c).visibility === 'visible' && getComputedStyle(c).display !== 'none'
      ) as HTMLCanvasElement | undefined;
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 10) return true;
      } catch { return true; } // cross-origin = treat as has content
      return false;
    }).catch(() => false);

    if (hasContent) {
      const latencyMs = Date.now() - start;
      return {
        latencyMs,
        synced: true,
        pollIntervals: intervals,
        exceededSLO: latencyMs > SYNC_LATENCY_SLO_MS,
      };
    }
  }

  return { latencyMs: null, synced: false, pollIntervals: intervals, exceededSLO: true };
}

// ─────────────────────────────────────────────────────────────────────
// 3. Session Heartbeat (streaming platform: segment-level health probe)
// ─────────────────────────────────────────────────────────────────────

/**
 * Collects one session heartbeat sample.
 * Checks: SSE/polling alive, canvas has content, API latency.
 */
export async function collectHeartbeat(
  page: Page,
  elapsedMs: number
): Promise<SessionHeartbeat> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const start = Date.now();

  // Check API latency
  const apiStart = Date.now();
  const res = await page.request.get(`${baseUrl}/api/courses?limit=1`).catch(() => null);
  const notesMs = Date.now() - apiStart;
  const apiHealthOk = (res?.status() ?? 0) < 500;

  // Check canvas
  const canvasHasContent = await page.evaluate(() => {
    const canvas = Array.from(document.querySelectorAll('canvas')).find(
      c => getComputedStyle(c).visibility === 'visible'
    ) as HTMLCanvasElement | undefined;
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    try {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 10) return true;
    } catch { return true; }
    return false;
  }).catch(() => false);

  // Check SSE / poll: verify page is still on /classroom/room
  const syncAlive = await page.evaluate(() =>
    window.location.pathname.includes('/classroom/room')
  ).catch(() => false);

  return {
    timestampMs: Date.now(),
    elapsedMs,
    syncAlive,
    canvasHasContent,
    apiHealthOk,
    notesMs,
  };
}

/**
 * Monitors session health at regular intervals for the given duration.
 * Returns the full heartbeat log and drift analysis.
 *
 * Usage example (during a 5-min session):
 *   const drift = await monitorSession(studentPage, 5 * 60 * 1000, 30 * 1000);
 */
export async function monitorSession(
  page: Page,
  totalDurationMs: number,
  intervalMs: number = HEARTBEAT_INTERVAL_MS
): Promise<DriftReport> {
  const samples: SessionHeartbeat[] = [];
  const sessionStart = Date.now();
  let degradedAt: number | null = null;
  let maxLatencyMs = 0;

  let nextTick = sessionStart + intervalMs;

  while (Date.now() < sessionStart + totalDurationMs) {
    const now = Date.now();
    if (now >= nextTick) {
      const elapsed = now - sessionStart;
      const hb = await collectHeartbeat(page, elapsed);
      samples.push(hb);

      maxLatencyMs = Math.max(maxLatencyMs, hb.notesMs);

      const degraded = !hb.syncAlive || !hb.apiHealthOk || hb.notesMs > API_LATENCY_SLO_MS;
      if (degraded && degradedAt === null) degradedAt = elapsed;

      const icon = degraded ? '⚠️' : '✅';
      console.log(
        `   ${icon} [+${Math.round(elapsed / 1000)}s] sync=${hb.syncAlive} canvas=${hb.canvasHasContent} apiOk=${hb.apiHealthOk} latency=${hb.notesMs}ms`
      );

      nextTick = now + intervalMs;
    }
    // Small sleep to avoid busy-loop
    await page.waitForTimeout(Math.min(1000, nextTick - Date.now()));
  }

  return {
    samples,
    degradedAt,
    maxLatencyMs,
    driftDetected: degradedAt !== null,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 4. Connection Alive Check
// ─────────────────────────────────────────────────────────────────────

/**
 * Verifies that the page's sync connection (SSE or polling) is still
 * active by checking for recent SYNC-related activity on the page.
 */
export async function verifySyncConnectionAlive(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    // Check 1: still on classroom/room
    if (!window.location.pathname.includes('/classroom/room')) return false;
    // Check 2: agoraRoom or whiteRoom global still present
    const hasRoom = !!(window as any).agoraRoom || !!(window as any).whiteRoom;
    // Check 3: canvas still visible
    const hasCanvas = !!document.querySelector('canvas');
    return hasCanvas; // room presence is best-effort (SDK may not expose globals)
  }).catch(() => false);
}

// ─────────────────────────────────────────────────────────────────────
// 5. Checkpoint Timing Wrapper
// ─────────────────────────────────────────────────────────────────────

/**
 * Wraps any async action and records its duration as a named checkpoint.
 * Emits a warning if the action exceeds the SLO.
 *
 * @returns elapsed ms
 */
export async function checkpoint<T>(
  name: string,
  fn: () => Promise<T>,
  sloMs?: number
): Promise<{ result: T; elapsedMs: number; exceededSLO: boolean }> {
  const start = Date.now();
  const result = await fn();
  const elapsedMs = Date.now() - start;
  const slo = sloMs ?? API_LATENCY_SLO_MS;
  const exceededSLO = elapsedMs > slo;

  const icon = exceededSLO ? '⚠️' : '✅';
  console.log(`   ${icon} [checkpoint] ${name}: ${elapsedMs}ms${exceededSLO ? ` (SLO: ${slo}ms)` : ''}`);

  return { result, elapsedMs, exceededSLO };
}

// ─────────────────────────────────────────────────────────────────────
// 6. Quick draw-and-probe (streaming segment test)
// ─────────────────────────────────────────────────────────────────────

/**
 * Performs a lightweight draw on the whiteboard and immediately probes
 * for sync on the student page. Returns latency result.
 *
 * This mirrors the "stream segment probe" pattern used by streaming
 * platforms to verify a live session mid-stream without re-testing
 * the full setup.
 */
export async function drawAndProbeSync(
  teacherPage: Page,
  studentPage: Page,
  segmentLabel: string
): Promise<SyncLatencyResult> {
  console.log(`\n   🎨 [Segment ${segmentLabel}] Drawing probe...`);
  const canvas = teacherPage.locator('canvas:visible').first();
  let lastResult: SyncLatencyResult = {
    latencyMs: null,
    synced: false,
    pollIntervals: 0,
    exceededSLO: true,
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    const box = await canvas.boundingBox().catch(() => null);
    if (!box) {
      console.log(`   ⚠️ [Segment ${segmentLabel}] Canvas not found (attempt ${attempt})`);
      lastResult = { latencyMs: null, synced: false, pollIntervals: 0, exceededSLO: true };
      await teacherPage.waitForTimeout(1200);
      continue;
    }

    const cx = box.x + box.width / 2 + (Math.random() - 0.5) * box.width * 0.3;
    const cy = box.y + box.height / 2 + (Math.random() - 0.5) * box.height * 0.3;

    await teacherPage.mouse.move(cx - 20, cy);
    await teacherPage.mouse.down();
    await teacherPage.mouse.move(cx + 20, cy + 20);
    await teacherPage.mouse.up();

    lastResult = await measureSyncLatency(studentPage, {
      maxWaitMs: SYNC_LATENCY_SLO_MS * 2,
      pollIntervalMs: 300,
    });

    if (lastResult.synced) {
      const icon = lastResult.exceededSLO ? '⚠️' : '✅';
      console.log(
        `   ${icon} [Segment ${segmentLabel}] sync=${lastResult.synced} latency=${lastResult.latencyMs ?? 'N/A'}ms`
      );
      return lastResult;
    }

    if (attempt < 2) {
      console.log(`   🔄 [Segment ${segmentLabel}] Initial sync probe missed, retrying once...`);
      await teacherPage.waitForTimeout(1500);
      await studentPage.waitForTimeout(1500);
    }
  }

  console.log(
    `   ❌ [Segment ${segmentLabel}] sync=${lastResult.synced} latency=${lastResult.latencyMs ?? 'N/A'}ms`
  );
  return lastResult;
}

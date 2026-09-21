/**
 * draw_workload.ts — realistic, continuous whiteboard draw-sync load.
 *
 * The old probe (whiteboard_helpers.drawOnWhiteboard) draws 3–5 straight lines
 * in ~1–2 s and checks "any pixel on the student canvas". That cannot detect
 * dropped or partial strokes and measures no real latency. This workload:
 *
 *   - draws handwriting-like strokes (seeded cubic Béziers, eased speed, jitter)
 *     at a target pointer density (DRAW_PPS) for DRAW_DURATION_SEC,
 *   - never waits for verification while drawing (a load, not a probe),
 *   - verifies EACH stroke on the student by sampling points along its curve,
 *     mapped through a teacher→student transform calibrated at start,
 *   - reports per-stroke latency (mouse-up → first probe that saw the stroke),
 *     p50/p95/max, lost and partial strokes, clear / erase / page-turn sync,
 *     achieved pointer density, app API 5xx, and main-thread CPU per page.
 *
 * Strokes in one round are confined to separate grid cells (no overlap), the
 * board is cleared between rounds (no dirty-canvas false positives), and each
 * stroke's samples are baselined on the student first (a PDF page background or
 * leftover ink cannot fake a pass).
 *
 * Environment knobs (all optional):
 *   DRAW_DURATION_SEC        0      0 = disabled (callers keep the old smoke probe)
 *   DRAW_STROKES_PER_MIN     12
 *   DRAW_PPS                 80     pointer events per second while the pen is down
 *   DRAW_CLEAR_EVERY         10     strokes per round (then drain → erase? → clear)
 *   DRAW_ERASER_RATIO        0.1    probability of erasing one stroke per round
 *   DRAW_PAGE_TURNS          0      page turns per minute (only if the room has >1 scene)
 *   DRAW_SEED                hash(label)
 *   DRAW_STAGGER_MS          2000   callers multiply by group index
 *   DRAW_PROBE_INTERVAL_MS   100
 *   DRAW_MAX_WAIT_MS         8000   per-stroke give-up (defaults to SYNC_LATENCY_SLO_MS)
 *   DRAW_MIN_SAMPLE_FRACTION 0.8    share of samples that must show ink
 *   DRAW_P95_SLO_MS          1000
 *   DRAW_LOSS_SLO            0      max (lost + partial) / verifiable
 *   DRAW_ALLOW_API_5XX       0      1 = do not fail the SLO on app API 5xx
 */

import type { Page, Response } from '@playwright/test';
import {
  DEFAULT_STROKE_SHAPE,
  classifyHits,
  createRng,
  fitAreaToStudent,
  gridCells,
  hashSeed,
  insetRect,
  mapPoint,
  planRound,
  similarityResidual,
  solveSimilarity,
  summarizeLatencies,
  type LatencySummary,
  type Point,
  type Rect,
  type Similarity,
  type StrokePlan,
} from './draw_plan';
import {
  captureInkBaseline,
  inkAtPoints,
  newInkCentroid,
  pointsLandOnWhiteboard,
  whiteboardSurfaceRect,
  WHITEBOARD_SCOPE_SELECTOR,
} from './canvas_probe';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

export interface DrawWorkloadConfig {
  label: string;
  durationSec: number;
  strokesPerMinute: number;
  pointsPerSecond: number;
  clearEvery: number;
  eraserRatio: number;
  pageTurnsPerMinute: number;
  seed: number;
  startDelayMs: number;
  probeIntervalMs: number;
  maxWaitMs: number;
  minSampleFraction: number;
  p95SloMs: number;
  lossSlo: number;
  allowApi5xx: boolean;
}

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`${name} must be a number, got "${raw}"`);
  return v;
};

/** True when DRAW_DURATION_SEC > 0 (the realistic workload should replace the smoke probe). */
export function drawWorkloadEnabled(): boolean {
  return num('DRAW_DURATION_SEC', 0) > 0;
}

export function readDrawWorkloadEnv(label: string, overrides: Partial<DrawWorkloadConfig> = {}): DrawWorkloadConfig {
  const cfg: DrawWorkloadConfig = {
    label,
    durationSec: num('DRAW_DURATION_SEC', 0),
    strokesPerMinute: num('DRAW_STROKES_PER_MIN', 12),
    pointsPerSecond: num('DRAW_PPS', 80),
    clearEvery: Math.max(1, Math.round(num('DRAW_CLEAR_EVERY', 10))),
    eraserRatio: num('DRAW_ERASER_RATIO', 0.1),
    pageTurnsPerMinute: num('DRAW_PAGE_TURNS', 0),
    seed: process.env.DRAW_SEED ? Math.round(num('DRAW_SEED', 0)) >>> 0 : hashSeed(label),
    startDelayMs: 0,
    probeIntervalMs: Math.max(20, num('DRAW_PROBE_INTERVAL_MS', 100)),
    maxWaitMs: num('DRAW_MAX_WAIT_MS', num('SYNC_LATENCY_SLO_MS', 8000)),
    minSampleFraction: num('DRAW_MIN_SAMPLE_FRACTION', 0.8),
    p95SloMs: num('DRAW_P95_SLO_MS', 1000),
    lossSlo: num('DRAW_LOSS_SLO', 0),
    allowApi5xx: process.env.DRAW_ALLOW_API_5XX === '1',
    ...overrides,
  };
  if (cfg.pointsPerSecond <= 0) throw new Error('DRAW_PPS must be > 0');
  if (cfg.strokesPerMinute <= 0) throw new Error('DRAW_STROKES_PER_MIN must be > 0');
  return cfg;
}

export const DRAW_STAGGER_MS = () => num('DRAW_STAGGER_MS', 2000);

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

export type StrokeState = 'pending' | 'synced' | 'partial' | 'lost' | 'unverifiable';

export interface StrokeResult {
  id: string;
  round: number;
  pointCount: number;
  tDownMs: number;
  tUpMs: number;
  achievedPps: number;
  eligibleSamples: number;
  state: StrokeState;
  latencyMs: number | null;
  bestFraction: number;
}

export interface OpStats {
  count: number;
  failed: number;
  skipped: number;
  latenciesMs: number[];
  latency: LatencySummary;
}

export interface DrawWorkloadReport {
  label: string;
  config: DrawWorkloadConfig;
  startedAt: string;
  durationMs: number;
  calibration: null | {
    transform: Similarity;
    residualPx: number;
    area: Rect;
    cells: number;
    studentRadiusPx: number;
  };
  strokes: StrokeResult[];
  totals: { drawn: number; synced: number; partial: number; lost: number; unverifiable: number; verifiable: number };
  lossRate: number | null;
  latenciesMs: number[];
  latency: LatencySummary;
  achievedPpsMean: number | null;
  clears: OpStats;
  erases: OpStats;
  pageTurns: OpStats;
  http: { api5xx: number; other5xx: number; samples: string[] };
  cpu: { teacherMainThreadPct: number | null; studentMainThreadPct: number | null };
  tainted: boolean;
  errors: string[];
  fatal: string | null;
  sloViolations: string[];
}

const emptyOps = (): OpStats => ({ count: 0, failed: 0, skipped: 0, latenciesMs: [], latency: summarizeLatencies([]) });

// ─────────────────────────────────────────────────────────────────────────────
// Small utilities
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

async function pollUntil<T>(
  fn: () => Promise<T | null | undefined>,
  timeoutMs: number,
  intervalMs: number
): Promise<{ value: T | null; elapsedMs: number }> {
  const start = Date.now();
  for (;;) {
    const v = await fn().catch(() => null);
    if (v !== null && v !== undefined) return { value: v, elapsedMs: Date.now() - start };
    if (Date.now() - start >= timeoutMs) return { value: null, elapsedMs: Date.now() - start };
    await sleep(intervalMs);
  }
}

function trackHttp5xx(pages: Page[]) {
  const state = { api5xx: 0, other5xx: 0, samples: [] as string[] };
  const handler = (r: Response) => {
    const status = r.status();
    if (status < 500) return;
    const url = r.url();
    const isApi = /\/api\//.test(url) && !/agora|netless|rtelink|sd-rtn|herewhite/i.test(url);
    if (isApi) state.api5xx++;
    else state.other5xx++;
    if (state.samples.length < 10) state.samples.push(`${status} ${r.request().method()} ${url.slice(0, 160)}`);
  };
  for (const p of pages) p.on('response', handler);
  return {
    state,
    stop: () => {
      for (const p of pages) p.off('response', handler);
    },
  };
}

/** Main-thread busy % over the sampled window (Chromium CDP Performance.TaskDuration). */
async function startCpuSampler(page: Page): Promise<() => Promise<number | null>> {
  try {
    const session = await page.context().newCDPSession(page);
    await session.send('Performance.enable');
    const read = async (): Promise<number | null> => {
      const { metrics } = await session.send('Performance.getMetrics');
      const m = metrics.find((x: { name: string; value: number }) => x.name === 'TaskDuration');
      return m ? m.value : null;
    };
    const t0 = Date.now();
    const d0 = await read();
    return async () => {
      try {
        const d1 = await read();
        const wallSec = (Date.now() - t0) / 1000;
        await session.detach().catch(() => {});
        if (d0 === null || d1 === null || wallSec <= 0) return null;
        return Math.round(((d1 - d0) / wallSec) * 100);
      } catch {
        return null;
      }
    };
  } catch {
    return async () => null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Whiteboard actions (toolbar first, SDK fallback)
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_TITLE = { pencil: '畫筆', eraser: '橡皮擦' } as const;

async function selectTool(page: Page, tool: keyof typeof TOOL_TITLE): Promise<void> {
  const btn = page.locator(`button[title="${TOOL_TITLE[tool]}"]`).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click({ timeout: 3000 });
    return;
  }
  const ok = await page.evaluate((name) => {
    const w = window as unknown as {
      agoraRoom?: { setMemberState?: (s: object) => void };
      __wb_setTool?: (t: string) => void;
    };
    if (w.agoraRoom?.setMemberState) {
      w.agoraRoom.setMemberState({ currentApplianceName: name });
      return true;
    }
    // Canvas whiteboard (EnhancedWhiteboard) exposes __wb_setTool('pencil'|'eraser').
    if (typeof w.__wb_setTool === 'function') {
      w.__wb_setTool(name);
      return true;
    }
    return false;
  }, tool);
  if (!ok) throw new Error(`cannot select tool "${tool}": no toolbar button, whiteboard room API, or canvas hook`);
}

async function clearWhiteboard(page: Page): Promise<void> {
  const btn = page.locator('button[title="清空畫布"]').first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click({ timeout: 3000 });
    return;
  }
  const ok = await page.evaluate(() => {
    const w = window as unknown as {
      agoraRoom?: { cleanCurrentScene?: () => void };
      __wb_clear?: () => void;
    };
    if (w.agoraRoom?.cleanCurrentScene) {
      w.agoraRoom.cleanCurrentScene();
      return true;
    }
    // Canvas whiteboard (EnhancedWhiteboard) exposes __wb_clear().
    if (typeof w.__wb_clear === 'function') {
      w.__wb_clear();
      return true;
    }
    return false;
  });
  if (!ok) throw new Error('cannot clear whiteboard: no toolbar button, whiteboard room API, or canvas hook');
}

async function waitForWhiteboardReady(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForFunction(
    (scope) => {
      const w = window as unknown as {
        agoraRoom?: { phase?: string };
        __wb_setTool?: (t: string) => void;
      };
      const root = document.querySelector(scope);
      const hasVisibleCanvas =
        !!root &&
        Array.from(root.querySelectorAll('canvas')).some((c) => {
          const r = (c as HTMLCanvasElement).getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
      if (!hasVisibleCanvas) return false;
      const room = w.agoraRoom;
      // Netless: wait until the room SDK reports a connected phase.
      if (room) return !room.phase || /connected/i.test(String(room.phase));
      // Canvas whiteboard (EnhancedWhiteboard): ready once its control hook is installed.
      return typeof w.__wb_setTool === 'function';
    },
    WHITEBOARD_SCOPE_SELECTOR,
    { timeout: timeoutMs }
  );
}

interface DrawnStroke {
  tDownMs: number;
  tUpMs: number;
  achievedPps: number;
}

/** Send a pointer path at a paced density. Returns timing and achieved density. */
async function drawPath(page: Page, points: Point[], pps: number): Promise<DrawnStroke> {
  const intervalMs = 1000 / pps;
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  const tDownMs = Date.now();
  for (let i = 1; i < points.length; i++) {
    const wait = tDownMs + i * intervalMs - Date.now();
    if (wait > 1) await sleep(wait);
    await page.mouse.move(points[i].x, points[i].y);
  }
  await page.mouse.up();
  const tUpMs = Date.now();
  const seconds = Math.max(0.001, (tUpMs - tDownMs) / 1000);
  return { tDownMs, tUpMs, achievedPps: points.length > 1 ? (points.length - 1) / seconds : 0 };
}

async function drawCross(page: Page, c: Point, arm: number, pps: number): Promise<void> {
  const seg = (a: Point, b: Point, n = 10) =>
    Array.from({ length: n }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / (n - 1), y: a.y + ((b.y - a.y) * i) / (n - 1) }));
  await drawPath(page, seg({ x: c.x - arm, y: c.y }, { x: c.x + arm, y: c.y }), pps);
  await drawPath(page, seg({ x: c.x, y: c.y - arm }, { x: c.x, y: c.y + arm }), pps);
}

// ─────────────────────────────────────────────────────────────────────────────
// Calibration: teacher → student transform + usable drawing cells
// ─────────────────────────────────────────────────────────────────────────────

interface Calibration {
  transform: Similarity;
  residualPx: number;
  area: Rect;
  cells: Rect[];
  studentRadiusPx: number;
}

/**
 * Wait for ink that appeared after baseline `key`. With `stable`, require two
 * consecutive readings that agree (the stroke finished syncing/rendering).
 * Tainted or resized canvases are fatal, not a timeout.
 */
async function waitForNewInk(page: Page, key: string, timeoutMs: number, stable: boolean): Promise<Point | null> {
  const start = Date.now();
  let previous: { x: number; y: number; count: number } | null = null;
  for (;;) {
    const c = await newInkCentroid(page, key);
    if (c.tainted) throw new Error('whiteboard canvas is cross-origin tainted; pixel probe cannot be trusted');
    if (c.resized) throw new Error('whiteboard canvas was resized during calibration; retry');
    if (c.count >= 6 && c.x !== null && c.y !== null) {
      const current = { x: c.x, y: c.y, count: c.count };
      if (!stable) return { x: current.x, y: current.y };
      if (
        previous &&
        Math.hypot(previous.x - current.x, previous.y - current.y) <= 1.5 &&
        Math.abs(previous.count - current.count) <= Math.max(2, previous.count * 0.15)
      ) {
        return { x: current.x, y: current.y };
      }
      previous = current;
    } else {
      previous = null;
    }
    if (Date.now() - start >= timeoutMs) return null;
    await sleep(200);
  }
}

async function calibrate(teacher: Page, student: Page, cfg: DrawWorkloadConfig): Promise<Calibration> {
  const [tRect, sRect] = await Promise.all([whiteboardSurfaceRect(teacher), whiteboardSurfaceRect(student)]);
  if (!tRect || !sRect) {
    throw new Error(`calibration: whiteboard canvas not found (teacher=${!!tRect}, student=${!!sRect})`);
  }

  const marks = [
    { fx: 0.3, fy: 0.35 },
    { fx: 0.7, fy: 0.65 },
  ];
  const pairs: Array<[Point, Point]> = [];

  for (let i = 0; i < marks.length; i++) {
    const intended = { x: tRect.x + tRect.w * marks[i].fx, y: tRect.y + tRect.h * marks[i].fy };
    const [lands] = await pointsLandOnWhiteboard(teacher, [intended]);
    if (!lands) throw new Error(`calibration: mark ${i} at (${intended.x.toFixed(0)},${intended.y.toFixed(0)}) is covered or off the whiteboard`);

    const key = `cal-${cfg.label}-${i}-${Date.now()}`;
    await Promise.all([captureInkBaseline(teacher, key), captureInkBaseline(student, key)]);
    await drawCross(teacher, intended, 14, cfg.pointsPerSecond);

    const teacherInk = await waitForNewInk(teacher, key, 10_000, false);
    if (!teacherInk) {
      throw new Error('calibration: the teacher canvas shows no new ink where the mark was drawn (probe cannot see the board)');
    }
    const drift = Math.hypot(teacherInk.x - intended.x, teacherInk.y - intended.y);
    if (drift > 12) {
      throw new Error(`calibration: teacher ink centroid is ${drift.toFixed(1)}px from the drawn mark (canvas/pointer mismatch)`);
    }

    const studentInk = await waitForNewInk(student, key, cfg.maxWaitMs + 7_000, true);
    if (!studentInk) {
      throw new Error(`calibration: the student never received calibration mark ${i} within ${cfg.maxWaitMs + 7_000}ms`);
    }
    pairs.push([teacherInk, studentInk]);

    await clearWhiteboard(teacher);
    await sleep(800);
  }

  const transform = solveSimilarity(pairs[0][0], pairs[1][0], pairs[0][1], pairs[1][1]);
  if (!(transform.scale >= 0.25 && transform.scale <= 4)) {
    throw new Error(`calibration: implausible teacher→student scale ${transform.scale.toFixed(3)}`);
  }
  // A non-uniform mapping (e.g. letterboxing that stretches one axis) would make
  // the uniform model wrong; catch it rather than produce bogus sample points.
  const tdx = pairs[1][0].x - pairs[0][0].x;
  const tdy = pairs[1][0].y - pairs[0][0].y;
  const sdx = pairs[1][1].x - pairs[0][1].x;
  const sdy = pairs[1][1].y - pairs[0][1].y;
  const scaleX = Math.abs(tdx) > 20 ? sdx / tdx : transform.scale;
  const scaleY = Math.abs(tdy) > 20 ? sdy / tdy : transform.scale;
  if (Math.abs(scaleX - scaleY) > 0.08 * transform.scale) {
    throw new Error(`calibration: non-uniform mapping (scaleX=${scaleX.toFixed(3)}, scaleY=${scaleY.toFixed(3)})`);
  }
  const residualPx = similarityResidual(transform, pairs);

  // The board can extend below the fold (e.g. teacher toolbar pushes it down in a
  // 1280x720 viewport). Pointer events and pixel reads only work on-screen, so clip
  // both sides to their visible viewport before laying out the grid.
  const visibleRect = async (page: Page, r: Rect): Promise<Rect> => {
    const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    const x1 = Math.max(r.x, 0);
    const y1 = Math.max(r.y, 0);
    const x2 = Math.min(r.x + r.w, vp.w);
    const y2 = Math.min(r.y + r.h, vp.h);
    return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
  };
  const [tVisible, sVisible] = await Promise.all([visibleRect(teacher, tRect), visibleRect(student, sRect)]);

  let area = insetRect(tVisible, Math.min(tVisible.w, tVisible.h) * 0.08);
  area = fitAreaToStudent(area, transform, insetRect(sVisible, 6));
  if (area.w < 120 || area.h < 90) {
    throw new Error(`calibration: usable drawing area too small (${area.w.toFixed(0)}x${area.h.toFixed(0)})`);
  }

  // Keep only cells whose centre and inner corners actually land on the board.
  const cells = gridCells(area, cfg.clearEvery);
  const probePoints = cells.flatMap((c) => {
    const inner = insetRect(c, Math.min(c.w, c.h) * 0.1);
    return [
      { x: c.x + c.w / 2, y: c.y + c.h / 2 },
      { x: inner.x, y: inner.y },
      { x: inner.x + inner.w, y: inner.y },
      { x: inner.x, y: inner.y + inner.h },
      { x: inner.x + inner.w, y: inner.y + inner.h },
    ];
  });
  const lands = await pointsLandOnWhiteboard(teacher, probePoints);
  const usable = cells.filter((_, i) => lands.slice(i * 5, i * 5 + 5).every(Boolean));
  if (usable.length < Math.ceil(cfg.clearEvery / 2)) {
    throw new Error(`calibration: only ${usable.length}/${cells.length} grid cells are drawable (overlays or small board)`);
  }

  return { transform, residualPx, area, cells: usable, studentRadiusPx: Math.max(3, Math.round(4 * transform.scale)) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main workload
// ─────────────────────────────────────────────────────────────────────────────

interface PendingStroke {
  plan: StrokePlan;
  mapped: Point[];
  eligible: boolean[];
  result: StrokeResult;
}

const MIN_ELIGIBLE_SAMPLES = 3;

export async function runDrawWorkload(
  teacher: Page,
  student: Page,
  cfgIn: DrawWorkloadConfig
): Promise<DrawWorkloadReport> {
  const cfg = { ...cfgIn };
  const report: DrawWorkloadReport = {
    label: cfg.label,
    config: cfg,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    calibration: null,
    strokes: [],
    totals: { drawn: 0, synced: 0, partial: 0, lost: 0, unverifiable: 0, verifiable: 0 },
    lossRate: null,
    latenciesMs: [],
    latency: summarizeLatencies([]),
    achievedPpsMean: null,
    clears: emptyOps(),
    erases: emptyOps(),
    pageTurns: emptyOps(),
    http: { api5xx: 0, other5xx: 0, samples: [] },
    cpu: { teacherMainThreadPct: null, studentMainThreadPct: null },
    tainted: false,
    errors: [],
    fatal: null,
    sloViolations: [],
  };

  if (cfg.startDelayMs > 0) await sleep(cfg.startDelayMs);
  const wallStart = Date.now();
  // Opt-in diagnostics: surface teacher/student console + whiteboard relay requests
  // to explain why strokes do or do not sync (DRAW_DIAG=1). Off by default.
  if (process.env.DRAW_DIAG === '1') {
    teacher.on('console', (m) => console.log(`[diag T console] ${m.type()}: ${m.text()}`.slice(0, 300)));
    teacher.on('pageerror', (e) => console.log(`[diag T pageerror] ${e.message}`.slice(0, 300)));
    teacher.on('request', (r) => {
      if (/\/api\/whiteboard\//.test(r.url())) console.log(`[diag T req] ${r.method()} ${r.url().slice(0, 160)}`);
    });
    teacher.on('requestfailed', (r) => {
      if (/\/api\/whiteboard\//.test(r.url())) console.log(`[diag T reqfail] ${r.method()} ${r.url().slice(0, 120)} — ${r.failure()?.errorText ?? '?'}`);
    });
    student.on('console', (m) => console.log(`[diag S console] ${m.type()}: ${m.text()}`.slice(0, 300)));
  }
  const http = trackHttp5xx([teacher, student]);
  const [stopCpuTeacher, stopCpuStudent] = await Promise.all([startCpuSampler(teacher), startCpuSampler(student)]);
  const rng = createRng((cfg.seed ^ 0x5bd1e995) >>> 0);
  const pending: PendingStroke[] = [];
  let stopProbe = false;
  let prober: Promise<void> = Promise.resolve();

  try {
    await Promise.all([waitForWhiteboardReady(teacher, 90_000), waitForWhiteboardReady(student, 90_000)]);
    await selectTool(teacher, 'pencil');

    const cal = await calibrate(teacher, student, cfg);
    report.calibration = {
      transform: cal.transform,
      residualPx: Number(cal.residualPx.toFixed(2)),
      area: cal.area,
      cells: cal.cells.length,
      studentRadiusPx: cal.studentRadiusPx,
    };

    // ── Verifier: runs concurrently with drawing, one evaluate per tick ──
    prober = (async () => {
      while (!(stopProbe && pending.length === 0)) {
        if (pending.length) {
          const batch = pending.slice();
          const points = batch.flatMap((b) => b.mapped);
          const observedAt = Date.now();
          try {
            const res = await inkAtPoints(student, points, { radiusPx: cal.studentRadiusPx });
            if (res.tainted) report.tainted = true;
            const now = Date.now();
            let offset = 0;
            for (const b of batch) {
              const hits = res.hits.slice(offset, offset + b.mapped.length);
              offset += b.mapped.length;
              const verdict = classifyHits(hits, b.eligible, cfg.minSampleFraction);
              b.result.bestFraction = Math.max(b.result.bestFraction, verdict.fraction);
              let done = false;
              if (verdict.synced && !res.tainted) {
                b.result.state = 'synced';
                b.result.latencyMs = Math.max(0, observedAt - b.result.tUpMs);
                done = true;
              } else if (now - b.result.tUpMs > cfg.maxWaitMs) {
                b.result.state = b.result.bestFraction > 0 ? 'partial' : 'lost';
                done = true;
              }
              if (done) {
                const idx = pending.indexOf(b);
                if (idx >= 0) pending.splice(idx, 1);
              }
            }
          } catch (err) {
            report.errors.push(`probe: ${(err as Error).message}`.slice(0, 300));
            if (report.errors.length > 50) {
              // Stop verifying; the draw loop sees `fatal` and aborts. Remaining
              // strokes are resolved as lost/partial in the finally block.
              report.fatal = report.fatal ?? `student probe kept failing: ${(err as Error).message}`;
              return;
            }
          }
        }
        await sleep(cfg.probeIntervalMs);
      }
    })();

    const shape = { ...DEFAULT_STROKE_SHAPE, pointsPerSecond: cfg.pointsPerSecond };
    const strokeIntervalMs = 60_000 / cfg.strokesPerMinute;
    const deadline = Date.now() + cfg.durationSec * 1000;
    let lastPageTurnAt = Date.now();

    for (let round = 0; Date.now() < deadline; round++) {
      const plans = planRound(cfg.seed, round, cal.cells, cfg.clearEvery, shape);
      const roundStrokes: PendingStroke[] = [];

      for (const plan of plans) {
        if (report.fatal) throw new Error(report.fatal);
        if (Date.now() >= deadline) break;
        const mapped = plan.samples.map((p) => mapPoint(cal.transform, p));
        const baseline = await inkAtPoints(student, mapped, { radiusPx: cal.studentRadiusPx });
        if (baseline.tainted) report.tainted = true;
        const eligible = baseline.hits.map((h) => !h);

        const drawn = await drawPath(teacher, plan.points, cfg.pointsPerSecond);
        const eligibleCount = eligible.filter(Boolean).length;
        const result: StrokeResult = {
          id: plan.id,
          round,
          pointCount: plan.points.length,
          tDownMs: drawn.tDownMs,
          tUpMs: drawn.tUpMs,
          achievedPps: Math.round(drawn.achievedPps),
          eligibleSamples: eligibleCount,
          state: eligibleCount >= MIN_ELIGIBLE_SAMPLES ? 'pending' : 'unverifiable',
          latencyMs: null,
          bestFraction: 0,
        };
        report.strokes.push(result);
        const entry: PendingStroke = { plan, mapped, eligible, result };
        roundStrokes.push(entry);
        if (result.state === 'pending') pending.push(entry);

        // Handwriting is bursty: vary the gap around the target rate.
        const gap = strokeIntervalMs * (0.6 + rng() * 0.8) - (drawn.tUpMs - drawn.tDownMs);
        await sleep(Math.min(Math.max(40, gap), Math.max(0, deadline - Date.now())));
      }

      // Drain: every stroke of this round must resolve before the board changes.
      await pollUntil(async () => (roundStrokes.every((s) => s.result.state !== 'pending') ? true : null), cfg.maxWaitMs + 3_000, 50);

      const synced = roundStrokes.filter((s) => s.result.state === 'synced');

      // Erase one synced stroke and verify it disappears on the student.
      if (synced.length && rng() < cfg.eraserRatio) {
        const target = synced[Math.floor(rng() * synced.length)];
        const points = target.mapped.filter((_, i) => target.eligible[i]);
        try {
          await selectTool(teacher, 'eraser');
          const scrub = await drawPath(teacher, target.plan.points, cfg.pointsPerSecond);
          await selectTool(teacher, 'pencil');
          const { value } = await pollUntil(
            async () => ((await inkAtPoints(student, points, { radiusPx: cal.studentRadiusPx })).hits.every((h) => !h) ? true : null),
            cfg.maxWaitMs,
            cfg.probeIntervalMs
          );
          report.erases.count++;
          if (value) report.erases.latenciesMs.push(Math.max(0, Date.now() - scrub.tUpMs));
          else report.erases.failed++;
        } catch (err) {
          report.erases.failed++;
          report.errors.push(`erase: ${(err as Error).message}`.slice(0, 300));
          await selectTool(teacher, 'pencil').catch(() => {});
        }
      }

      // Page turn at a round boundary (only meaningful with a multi-scene PDF).
      if (cfg.pageTurnsPerMinute > 0 && Date.now() - lastPageTurnAt >= 60_000 / cfg.pageTurnsPerMinute) {
        lastPageTurnAt = Date.now();
        await turnPage(teacher, student, cfg, report);
      }

      // Clear and verify the round's ink disappears on the student.
      const leftover = roundStrokes
        .filter((s) => s.result.state === 'synced' || s.result.state === 'partial')
        .flatMap((s) => s.mapped.filter((_, i) => s.eligible[i]));
      const clearAt = Date.now();
      try {
        await clearWhiteboard(teacher);
        report.clears.count++;
        if (leftover.length) {
          const { value } = await pollUntil(
            async () => ((await inkAtPoints(student, leftover, { radiusPx: cal.studentRadiusPx })).hits.every((h) => !h) ? true : null),
            cfg.maxWaitMs,
            cfg.probeIntervalMs
          );
          if (value) report.clears.latenciesMs.push(Date.now() - clearAt);
          else report.clears.failed++;
        } else {
          report.clears.skipped++;
        }
      } catch (err) {
        report.clears.failed++;
        report.errors.push(`clear: ${(err as Error).message}`.slice(0, 300));
      }
    }
  } catch (err) {
    report.fatal = report.fatal ?? (err as Error).message;
  } finally {
    stopProbe = true;
    // Unresolved strokes after a fatal error still get a verdict.
    await Promise.race([prober.catch(() => {}), sleep(cfg.maxWaitMs + 3_000)]);
    for (const s of pending) {
      if (s.result.state === 'pending') s.result.state = s.result.bestFraction > 0 ? 'partial' : 'lost';
    }
    http.stop();
    const [teacherPct, studentPct] = await Promise.all([stopCpuTeacher(), stopCpuStudent()]);
    report.cpu = { teacherMainThreadPct: teacherPct, studentMainThreadPct: studentPct };
    report.http = { api5xx: http.state.api5xx, other5xx: http.state.other5xx, samples: http.state.samples };
    report.durationMs = Date.now() - wallStart;
    finalizeReport(report);
  }

  return report;
}

async function turnPage(teacher: Page, student: Page, cfg: DrawWorkloadConfig, report: DrawWorkloadReport): Promise<void> {
  const readIndex = (page: Page) =>
    page.evaluate(() => {
      const s = (window as unknown as { agoraRoom?: { state?: { sceneState?: { index?: number; scenes?: unknown[] } } } })
        .agoraRoom?.state?.sceneState;
      return s ? { index: Number(s.index ?? 0), count: Array.isArray(s.scenes) ? s.scenes.length : 0 } : null;
    });
  try {
    const state = await readIndex(teacher);
    if (!state || state.count < 2) {
      report.pageTurns.skipped++;
      return;
    }
    const forward = state.index + 1 < state.count;
    const expected = forward ? state.index + 1 : state.index - 1;
    const btn = teacher.locator(`button[title="${forward ? '下一頁' : '上一頁'}"]`).first();
    const t0 = Date.now();
    if (await btn.isEnabled().catch(() => false)) {
      await btn.click({ timeout: 3000 });
    } else {
      await teacher.evaluate((i) => {
        (window as unknown as { agoraRoom?: { setSceneIndex?: (n: number) => void } }).agoraRoom?.setSceneIndex?.(i);
      }, expected);
    }
    report.pageTurns.count++;
    const { value } = await pollUntil(
      async () => ((await readIndex(student))?.index === expected ? true : null),
      cfg.maxWaitMs,
      cfg.probeIntervalMs
    );
    if (value) report.pageTurns.latenciesMs.push(Date.now() - t0);
    else report.pageTurns.failed++;
  } catch (err) {
    report.pageTurns.failed++;
    report.errors.push(`page turn: ${(err as Error).message}`.slice(0, 300));
  }
}

function finalizeReport(report: DrawWorkloadReport): void {
  const t = report.totals;
  t.drawn = report.strokes.length;
  t.synced = report.strokes.filter((s) => s.state === 'synced').length;
  t.partial = report.strokes.filter((s) => s.state === 'partial').length;
  t.lost = report.strokes.filter((s) => s.state === 'lost').length;
  t.unverifiable = report.strokes.filter((s) => s.state === 'unverifiable').length;
  t.verifiable = t.synced + t.partial + t.lost;
  report.lossRate = t.verifiable ? (t.partial + t.lost) / t.verifiable : null;
  report.latenciesMs = report.strokes.filter((s) => s.latencyMs !== null).map((s) => s.latencyMs as number);
  report.latency = summarizeLatencies(report.latenciesMs);
  const pps = report.strokes.map((s) => s.achievedPps).filter((v) => v > 0);
  report.achievedPpsMean = pps.length ? Math.round(pps.reduce((a, b) => a + b, 0) / pps.length) : null;
  for (const ops of [report.clears, report.erases, report.pageTurns]) ops.latency = summarizeLatencies(ops.latenciesMs);
  report.sloViolations = evaluateDrawSlo(report);
}

/** SLO check; an empty array means the workload passed. */
export function evaluateDrawSlo(report: DrawWorkloadReport): string[] {
  const cfg = report.config;
  const v: string[] = [];
  if (report.fatal) v.push(`fatal: ${report.fatal}`);
  if (report.tainted) v.push('whiteboard canvas was tainted; pixel verification is not trustworthy');
  if (report.totals.verifiable === 0) v.push('no verifiable strokes were drawn');
  if (report.lossRate !== null && report.lossRate > cfg.lossSlo) {
    v.push(`stroke loss ${(report.lossRate * 100).toFixed(1)}% > ${(cfg.lossSlo * 100).toFixed(1)}% (lost=${report.totals.lost}, partial=${report.totals.partial})`);
  }
  if (report.latency.p95Ms !== null && report.latency.p95Ms > cfg.p95SloMs) {
    v.push(`stroke p95 ${report.latency.p95Ms}ms > ${cfg.p95SloMs}ms`);
  }
  if (report.clears.failed) v.push(`${report.clears.failed} clear(s) did not sync`);
  if (report.pageTurns.failed) v.push(`${report.pageTurns.failed} page turn(s) did not sync`);
  if (!cfg.allowApi5xx && report.http.api5xx > 0) v.push(`${report.http.api5xx} app API 5xx during drawing`);
  return v;
}

/** One-line human summary. */
export function formatDrawReport(r: DrawWorkloadReport): string {
  const t = r.totals;
  const p = (x: number | null) => (x === null ? '?' : `${x}ms`);
  return [
    `strokes=${t.drawn} synced=${t.synced} lost=${t.lost} partial=${t.partial} unverifiable=${t.unverifiable}`,
    `loss=${r.lossRate === null ? '?' : `${(r.lossRate * 100).toFixed(1)}%`}`,
    `p50=${p(r.latency.p50Ms)} p95=${p(r.latency.p95Ms)} max=${p(r.latency.maxMs)}`,
    `pps≈${r.achievedPpsMean ?? '?'}`,
    `clear p95=${p(r.clears.latency.p95Ms)}${r.clears.failed ? ` (failed ${r.clears.failed})` : ''}`,
    `erase=${r.erases.count}${r.erases.failed ? `/${r.erases.failed} failed` : ''}`,
    `turns=${r.pageTurns.count}${r.pageTurns.failed ? `/${r.pageTurns.failed} failed` : ''}`,
    `api5xx=${r.http.api5xx}`,
    `cpu T/S=${r.cpu.teacherMainThreadPct ?? '?'}%/${r.cpu.studentMainThreadPct ?? '?'}%`,
    r.calibration ? `scale=${r.calibration.transform.scale.toFixed(3)} cells=${r.calibration.cells}` : 'uncalibrated',
  ].join(' | ');
}

/** Aggregate p95 across groups from raw latencies (true global percentile). */
export function aggregateDrawReports(reports: DrawWorkloadReport[]) {
  const latencies = reports.flatMap((r) => r.latenciesMs);
  const verifiable = reports.reduce((a, r) => a + r.totals.verifiable, 0);
  const lostOrPartial = reports.reduce((a, r) => a + r.totals.lost + r.totals.partial, 0);
  return {
    groups: reports.length,
    strokes: reports.reduce((a, r) => a + r.totals.drawn, 0),
    verifiable,
    lossRate: verifiable ? lostOrPartial / verifiable : null,
    latency: summarizeLatencies(latencies),
    api5xx: reports.reduce((a, r) => a + r.http.api5xx, 0),
    failedGroups: reports.filter((r) => r.sloViolations.length > 0).map((r) => r.label),
  };
}

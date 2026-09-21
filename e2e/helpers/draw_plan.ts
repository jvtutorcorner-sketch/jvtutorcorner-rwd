/**
 * draw_plan.ts — pure, dependency-free planning math for the realistic
 * whiteboard draw workload (see draw_workload.ts).
 *
 * Kept free of Playwright/Node imports on purpose so it can be unit-tested with
 * `node --experimental-strip-types` / the ts-resolve hook (scripts/verify-draw-plan.mjs).
 *
 * Coordinates are CSS client pixels (the space Playwright's page.mouse uses).
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StrokePlan {
  id: string;
  round: number;
  /** Pointer path the teacher sends, in teacher client coords. */
  points: Point[];
  /** Points on the ideal curve (t = 0.15…0.85) used to verify ink arrived. */
  samples: Point[];
  /** Cell the stroke is confined to (strokes within one round never overlap). */
  cell: Rect;
  /** Nominal duration of the stroke at the planned speed. */
  durationMs: number;
}

export interface StrokeShapeConfig {
  /** Target pointer events per second while the pen is down. */
  pointsPerSecond: number;
  /** Pen speed range in px/s (handwriting ≈ 250–700). */
  speedPxPerSec: [number, number];
  /** Fraction of the cell's shorter side used as stroke length range. */
  lengthOfCell: [number, number];
  /** Max perpendicular bulge of the Bézier controls, as a fraction of length. */
  curvature: number;
  /** ± pixel jitter applied to intermediate pointer points. */
  jitterPx: number;
  /** Number of verification samples along the curve. */
  sampleCount: number;
  /** Minimum pointer points per stroke regardless of pps. */
  minPoints: number;
}

export const DEFAULT_STROKE_SHAPE: StrokeShapeConfig = {
  pointsPerSecond: 80,
  speedPxPerSec: [250, 650],
  lengthOfCell: [0.45, 0.85],
  curvature: 0.35,
  jitterPx: 1.2,
  sampleCount: 7,
  minPoints: 8,
};

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic RNG
// ─────────────────────────────────────────────────────────────────────────────

/** 32-bit string hash (FNV-1a) → seed. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for test plans. Returns [0,1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const range = (rng: () => number, [lo, hi]: [number, number]) => lerp(lo, hi, rng());
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ─────────────────────────────────────────────────────────────────────────────
// Geometry
// ─────────────────────────────────────────────────────────────────────────────

export function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Shrink a rect by `inset` on every side. */
export function insetRect(r: Rect, inset: number): Rect {
  const dx = Math.min(inset, r.w / 2 - 1);
  const dy = Math.min(inset, r.h / 2 - 1);
  return { x: r.x + dx, y: r.y + dy, w: Math.max(2, r.w - 2 * dx), h: Math.max(2, r.h - 2 * dy) };
}

export function rectContains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/**
 * Split `area` into a grid with at least `count` cells whose aspect roughly
 * follows the area's. Cells are returned row-major.
 */
export function gridCells(area: Rect, count: number): Rect[] {
  const n = Math.max(1, Math.floor(count));
  const aspect = area.w / Math.max(1, area.h);
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * aspect)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cw = area.w / cols;
  const ch = area.h / rows;
  const cells: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ x: area.x + c * cw, y: area.y + r * ch, w: cw, h: ch });
    }
  }
  return cells;
}

/**
 * Plan one handwriting-like stroke confined to `cell`: a cubic Bézier with a
 * random bulge, sampled at the pen speed × pps so the pointer density matches
 * real writing, with small jitter on intermediate points.
 */
export function planStrokeInCell(
  rng: () => number,
  cell: Rect,
  shape: StrokeShapeConfig,
  id: string,
  round: number
): StrokePlan {
  // Keep a margin so jitter + stroke width never leaves the cell.
  const inner = insetRect(cell, Math.max(4, Math.min(cell.w, cell.h) * 0.12));
  const shortSide = Math.min(inner.w, inner.h);
  const diagonal = Math.hypot(inner.w, inner.h);
  const length = clamp(range(rng, shape.lengthOfCell) * Math.max(shortSide, diagonal * 0.6), 12, diagonal * 0.95);

  // Pick a direction, then place the chord so both ends are inside the cell.
  const angle = rng() * Math.PI * 2;
  let dx = Math.cos(angle) * length;
  let dy = Math.sin(angle) * length;
  // Scale the chord down if it cannot fit the cell in this direction.
  const fit = Math.min(1, inner.w / Math.max(1, Math.abs(dx)), inner.h / Math.max(1, Math.abs(dy)));
  dx *= fit * 0.98;
  dy *= fit * 0.98;
  const minX = inner.x + Math.max(0, -dx);
  const maxX = inner.x + inner.w - Math.max(0, dx);
  const minY = inner.y + Math.max(0, -dy);
  const maxY = inner.y + inner.h - Math.max(0, dy);
  const p0 = { x: lerp(minX, Math.max(minX, maxX), rng()), y: lerp(minY, Math.max(minY, maxY), rng()) };
  const p3 = { x: p0.x + dx, y: p0.y + dy };

  // Perpendicular bulge for the two control points.
  const chord = Math.hypot(dx, dy) || 1;
  const nx = -dy / chord;
  const ny = dx / chord;
  const bulge1 = (rng() * 2 - 1) * shape.curvature * chord;
  const bulge2 = (rng() * 2 - 1) * shape.curvature * chord;
  const clampToInner = (p: Point): Point => ({
    x: clamp(p.x, inner.x, inner.x + inner.w),
    y: clamp(p.y, inner.y, inner.y + inner.h),
  });
  const p1 = clampToInner({ x: lerp(p0.x, p3.x, 1 / 3) + nx * bulge1, y: lerp(p0.y, p3.y, 1 / 3) + ny * bulge1 });
  const p2 = clampToInner({ x: lerp(p0.x, p3.x, 2 / 3) + nx * bulge2, y: lerp(p0.y, p3.y, 2 / 3) + ny * bulge2 });

  // Approximate arc length for timing.
  let arc = 0;
  let prev = p0;
  for (let i = 1; i <= 20; i++) {
    const q = cubicBezier(p0, p1, p2, p3, i / 20);
    arc += Math.hypot(q.x - prev.x, q.y - prev.y);
    prev = q;
  }

  const speed = range(rng, shape.speedPxPerSec);
  const durationMs = Math.max(60, (arc / speed) * 1000);
  const pointCount = Math.max(shape.minPoints, Math.round((durationMs / 1000) * shape.pointsPerSecond));

  const points: Point[] = [];
  for (let i = 0; i < pointCount; i++) {
    // Ease-in-out timing so the pen accelerates then slows like a hand.
    const s = i / (pointCount - 1);
    const t = 0.5 - Math.cos(Math.PI * s) / 2;
    const q = cubicBezier(p0, p1, p2, p3, t);
    const isEnd = i === 0 || i === pointCount - 1;
    const j = isEnd ? 0 : shape.jitterPx;
    points.push(clampToInner({ x: q.x + (rng() * 2 - 1) * j, y: q.y + (rng() * 2 - 1) * j }));
  }

  const samples: Point[] = [];
  const sc = Math.max(3, shape.sampleCount);
  for (let i = 0; i < sc; i++) {
    samples.push(cubicBezier(p0, p1, p2, p3, lerp(0.15, 0.85, i / (sc - 1))));
  }

  return { id, round, points, samples, cell, durationMs };
}

/** Plan one round: one stroke per cell (first `count` cells, shuffled deterministically). */
export function planRound(
  seed: number,
  round: number,
  cells: Rect[],
  count: number,
  shape: StrokeShapeConfig = DEFAULT_STROKE_SHAPE
): StrokePlan[] {
  const rng = createRng((seed ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0);
  const order = cells.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const k = Math.floor(rng() * (i + 1));
    [order[i], order[k]] = [order[k], order[i]];
  }
  const n = Math.min(count, cells.length);
  const plans: StrokePlan[] = [];
  for (let i = 0; i < n; i++) {
    plans.push(planStrokeInCell(rng, cells[order[i]], shape, `r${round}-s${i}`, round));
  }
  return plans;
}

// ─────────────────────────────────────────────────────────────────────────────
// Teacher → student coordinate mapping
// ─────────────────────────────────────────────────────────────────────────────

/** Uniform scale + translation (no rotation) mapping teacher coords to student coords. */
export interface Similarity {
  scale: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Similarity = { scale: 1, tx: 0, ty: 0 };

export function mapPoint(t: Similarity, p: Point): Point {
  return { x: p.x * t.scale + t.tx, y: p.y * t.scale + t.ty };
}

/**
 * Solve teacher→student similarity from two corresponding marks.
 * The whiteboard follower view keeps the broadcaster's camera, so the student
 * sees the same content scaled uniformly and shifted when viewport sizes differ.
 */
export function solveSimilarity(teacherA: Point, teacherB: Point, studentA: Point, studentB: Point): Similarity {
  const td = Math.hypot(teacherB.x - teacherA.x, teacherB.y - teacherA.y);
  const sd = Math.hypot(studentB.x - studentA.x, studentB.y - studentA.y);
  if (td < 1) throw new Error('solveSimilarity: calibration marks are too close together');
  const scale = sd / td;
  // Average both anchors for the translation to damp centroid noise.
  const tx = ((studentA.x - scale * teacherA.x) + (studentB.x - scale * teacherB.x)) / 2;
  const ty = ((studentA.y - scale * teacherA.y) + (studentB.y - scale * teacherB.y)) / 2;
  return { scale, tx, ty };
}

/** Residual (px, student space) of a similarity against the calibration marks. */
export function similarityResidual(t: Similarity, pairs: Array<[Point, Point]>): number {
  let worst = 0;
  for (const [tp, sp] of pairs) {
    const m = mapPoint(t, tp);
    worst = Math.max(worst, Math.hypot(m.x - sp.x, m.y - sp.y));
  }
  return worst;
}

/**
 * Largest teacher-space sub-rect of `teacherArea` whose image under `t`
 * stays inside `studentBounds`.
 */
export function fitAreaToStudent(teacherArea: Rect, t: Similarity, studentBounds: Rect): Rect {
  if (t.scale <= 0) return teacherArea;
  // Inverse-map the student bounds into teacher space and intersect.
  const inv = (p: Point): Point => ({ x: (p.x - t.tx) / t.scale, y: (p.y - t.ty) / t.scale });
  const a = inv({ x: studentBounds.x, y: studentBounds.y });
  const b = inv({ x: studentBounds.x + studentBounds.w, y: studentBounds.y + studentBounds.h });
  const x1 = Math.max(teacherArea.x, Math.min(a.x, b.x));
  const y1 = Math.max(teacherArea.y, Math.min(a.y, b.y));
  const x2 = Math.min(teacherArea.x + teacherArea.w, Math.max(a.x, b.x));
  const y2 = Math.min(teacherArea.y + teacherArea.h, Math.max(a.y, b.y));
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────────────

/** Nearest-rank percentile (p in 0..100). Returns null for an empty set. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((clamp(p, 0, 100) / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

export interface LatencySummary {
  count: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
}

export function summarizeLatencies(values: number[]): LatencySummary {
  return {
    count: values.length,
    p50Ms: percentile(values, 50),
    p95Ms: percentile(values, 95),
    maxMs: values.length ? Math.max(...values) : null,
  };
}

/**
 * Decide a stroke's verification state from sample hits.
 * `eligible` = samples that were clean in the student's baseline (a PDF page
 * background or an earlier mark already inked there cannot prove anything).
 */
export function classifyHits(
  hits: boolean[],
  eligible: boolean[],
  minFraction: number
): { eligibleCount: number; inkedCount: number; fraction: number; synced: boolean } {
  let eligibleCount = 0;
  let inkedCount = 0;
  for (let i = 0; i < hits.length; i++) {
    if (!eligible[i]) continue;
    eligibleCount++;
    if (hits[i]) inkedCount++;
  }
  const fraction = eligibleCount ? inkedCount / eligibleCount : 0;
  return { eligibleCount, inkedCount, fraction, synced: eligibleCount > 0 && fraction >= minFraction };
}

/**
 * canvas_probe.ts — the ONE place that answers "is there whiteboard ink here?"
 *
 * Replaces three near-identical any-pixel checks that used to live in
 * whiteboard_helpers.hasDrawingContent and streaming_monitor (measureSyncLatency,
 * collectHeartbeat). Those checks:
 *   - scanned only the first visible canvas anywhere on the page,
 *   - could not tell 1 stroke from 50 (so they could not see dropped strokes),
 *   - and returned TRUE when the canvas was cross-origin tainted.
 *
 * Every probe here is scoped to the whiteboard (`.whiteboard-container`, falling
 * back to all visible canvases), looks at every visible canvas layer, and reports
 * `tainted` explicitly so strict callers can refuse to pass on it.
 *
 * All coordinates are CSS client pixels (Playwright page.mouse space).
 */

import type { Page } from '@playwright/test';
import type { Point, Rect } from './draw_plan';

export const WHITEBOARD_SCOPE_SELECTOR = '.whiteboard-container';
export const DEFAULT_ALPHA_MIN = 10;

export interface InkHits {
  hits: boolean[];
  tainted: boolean;
  canvasCount: number;
}

export interface InkCentroid {
  count: number;
  x: number | null;
  y: number | null;
  tainted: boolean;
  /** True when a canvas changed size since the baseline (baseline is stale). */
  resized: boolean;
  canvasCount: number;
}

/**
 * For each client point, does any visible whiteboard canvas have ink within
 * `radiusPx` (CSS px) of it? One page.evaluate for all points.
 */
export async function inkAtPoints(
  page: Page,
  points: Point[],
  opts: { radiusPx?: number; alphaMin?: number; scope?: string } = {}
): Promise<InkHits> {
  if (!points.length) return { hits: [], tainted: false, canvasCount: 0 };
  return page.evaluate(
    ({ points, radiusPx, alphaMin, scope }) => {
      const root = document.querySelector(scope);
      const canvases = Array.from((root ?? document).querySelectorAll('canvas')).filter((c) => {
        const el = c as HTMLCanvasElement;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && el.width > 0 && el.height > 0;
      }) as HTMLCanvasElement[];

      let tainted = false;
      const ctxCache = new Map<HTMLCanvasElement, CanvasRenderingContext2D | null>();
      const ctxOf = (c: HTMLCanvasElement) => {
        if (!ctxCache.has(c)) {
          let ctx: CanvasRenderingContext2D | null = null;
          try {
            ctx = c.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
          } catch {
            ctx = null;
          }
          ctxCache.set(c, ctx);
        }
        return ctxCache.get(c) ?? null;
      };
      const rects = canvases.map((c) => c.getBoundingClientRect());

      const hits = points.map((p) => {
        for (let i = 0; i < canvases.length; i++) {
          const c = canvases[i];
          const r = rects[i];
          if (p.x < r.left - radiusPx || p.x > r.right + radiusPx || p.y < r.top - radiusPx || p.y > r.bottom + radiusPx) continue;
          const ctx = ctxOf(c);
          if (!ctx) continue;
          const sx = c.width / r.width;
          const sy = c.height / r.height;
          const x0 = Math.max(0, Math.floor((p.x - radiusPx - r.left) * sx));
          const y0 = Math.max(0, Math.floor((p.y - radiusPx - r.top) * sy));
          const x1 = Math.min(c.width, Math.ceil((p.x + radiusPx - r.left) * sx) + 1);
          const y1 = Math.min(c.height, Math.ceil((p.y + radiusPx - r.top) * sy) + 1);
          if (x1 <= x0 || y1 <= y0) continue;
          try {
            const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
            for (let k = 3; k < data.length; k += 4) {
              if (data[k] > alphaMin) return true;
            }
          } catch {
            tainted = true;
          }
        }
        return false;
      });

      return { hits, tainted, canvasCount: canvases.length };
    },
    {
      points,
      radiusPx: opts.radiusPx ?? 3,
      alphaMin: opts.alphaMin ?? DEFAULT_ALPHA_MIN,
      scope: opts.scope ?? WHITEBOARD_SCOPE_SELECTOR,
    }
  );
}

/**
 * Does the whiteboard contain any ink at all?
 * `strict` (default true): a tainted canvas counts as NO ink, so it can never pass.
 */
export async function hasAnyInk(
  page: Page,
  opts: { strict?: boolean; alphaMin?: number; scope?: string } = {}
): Promise<{ hasInk: boolean; tainted: boolean; canvasCount: number }> {
  const result = await page.evaluate(
    ({ alphaMin, scope }) => {
      const root = document.querySelector(scope);
      const canvases = Array.from((root ?? document).querySelectorAll('canvas')).filter((c) => {
        const el = c as HTMLCanvasElement;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && el.width > 0 && el.height > 0;
      }) as HTMLCanvasElement[];
      let tainted = false;
      for (const c of canvases) {
        let ctx: CanvasRenderingContext2D | null = null;
        try {
          ctx = c.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
        } catch {
          ctx = null;
        }
        if (!ctx) continue;
        try {
          const data = ctx.getImageData(0, 0, c.width, c.height).data;
          for (let k = 3; k < data.length; k += 4) {
            if (data[k] > alphaMin) return { hasInk: true, tainted, canvasCount: canvases.length };
          }
        } catch {
          tainted = true;
        }
      }
      return { hasInk: false, tainted, canvasCount: canvases.length };
    },
    { alphaMin: opts.alphaMin ?? DEFAULT_ALPHA_MIN, scope: opts.scope ?? WHITEBOARD_SCOPE_SELECTOR }
  );
  const strict = opts.strict ?? true;
  return { ...result, hasInk: result.hasInk || (!strict && result.tainted) };
}

/**
 * Snapshot a downsampled ink mask of every whiteboard canvas under `key`.
 * Pair with newInkCentroid() to locate ink that appeared AFTER the snapshot,
 * which works even on top of a PDF page background.
 */
export async function captureInkBaseline(
  page: Page,
  key: string,
  opts: { step?: number; alphaMin?: number; scope?: string } = {}
): Promise<{ tainted: boolean; canvasCount: number }> {
  return page.evaluate(
    ({ key, step, alphaMin, scope }) => {
      const w = window as unknown as { __inkBaselines?: Record<string, unknown> };
      w.__inkBaselines = w.__inkBaselines ?? {};
      const root = document.querySelector(scope);
      const canvases = Array.from((root ?? document).querySelectorAll('canvas')).filter((c) => {
        const el = c as HTMLCanvasElement;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && el.width > 0 && el.height > 0;
      }) as HTMLCanvasElement[];
      let tainted = false;
      const masks = canvases.map((c) => {
        let ctx: CanvasRenderingContext2D | null = null;
        try {
          ctx = c.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
        } catch {
          ctx = null;
        }
        const cols = Math.ceil(c.width / step);
        const rows = Math.ceil(c.height / step);
        const mask = new Uint8Array(cols * rows);
        if (ctx) {
          try {
            const data = ctx.getImageData(0, 0, c.width, c.height).data;
            for (let y = 0, row = 0; y < c.height; y += step, row++) {
              for (let x = 0, col = 0; x < c.width; x += step, col++) {
                if (data[(y * c.width + x) * 4 + 3] > alphaMin) mask[row * cols + col] = 1;
              }
            }
          } catch {
            tainted = true;
          }
        }
        return { canvas: c, width: c.width, height: c.height, cols, mask };
      });
      w.__inkBaselines[key] = { step, masks };
      return { tainted, canvasCount: canvases.length };
    },
    { key, step: opts.step ?? 2, alphaMin: opts.alphaMin ?? DEFAULT_ALPHA_MIN, scope: opts.scope ?? WHITEBOARD_SCOPE_SELECTOR }
  );
}

/** Centroid (client px) of ink present now but absent from baseline `key`. */
export async function newInkCentroid(
  page: Page,
  key: string,
  opts: { alphaMin?: number } = {}
): Promise<InkCentroid> {
  return page.evaluate(
    ({ key, alphaMin }) => {
      type Mask = { canvas: HTMLCanvasElement; width: number; height: number; cols: number; mask: Uint8Array };
      const w = window as unknown as { __inkBaselines?: Record<string, { step: number; masks: Mask[] }> };
      const base = w.__inkBaselines?.[key];
      if (!base) return { count: 0, x: null, y: null, tainted: false, resized: true, canvasCount: 0 };
      let tainted = false;
      let resized = false;
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      for (const m of base.masks) {
        const c = m.canvas;
        if (!c.isConnected || c.width !== m.width || c.height !== m.height) {
          resized = true;
          continue;
        }
        let ctx: CanvasRenderingContext2D | null = null;
        try {
          ctx = c.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
        } catch {
          ctx = null;
        }
        if (!ctx) continue;
        const r = c.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        try {
          const data = ctx.getImageData(0, 0, c.width, c.height).data;
          for (let y = 0, row = 0; y < c.height; y += base.step, row++) {
            for (let x = 0, col = 0; x < c.width; x += base.step, col++) {
              if (data[(y * c.width + x) * 4 + 3] > alphaMin && !m.mask[row * m.cols + col]) {
                count++;
                sumX += r.left + ((x + 0.5) * r.width) / c.width;
                sumY += r.top + ((y + 0.5) * r.height) / c.height;
              }
            }
          }
        } catch {
          tainted = true;
        }
      }
      return {
        count,
        x: count ? sumX / count : null,
        y: count ? sumY / count : null,
        tainted,
        resized,
        canvasCount: base.masks.length,
      };
    },
    { key, alphaMin: opts.alphaMin ?? DEFAULT_ALPHA_MIN }
  );
}

/** Client rect of the largest visible whiteboard canvas (the drawing surface). */
export async function whiteboardSurfaceRect(page: Page, scope = WHITEBOARD_SCOPE_SELECTOR): Promise<Rect | null> {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope);
    let best: DOMRect | null = null;
    for (const c of Array.from((root ?? document).querySelectorAll('canvas'))) {
      const el = c as HTMLCanvasElement;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (!best || r.width * r.height > best.width * best.height) best = r;
    }
    return best ? { x: best.left, y: best.top, w: best.width, h: best.height } : null;
  }, scope);
}

/**
 * For each client point, would a pointer event there land on the whiteboard
 * (not on a toolbar, overlay, dialog, or outside the viewport)?
 */
export async function pointsLandOnWhiteboard(
  page: Page,
  points: Point[],
  scope = WHITEBOARD_SCOPE_SELECTOR
): Promise<boolean[]> {
  return page.evaluate(
    ({ points, scope }) => {
      const root = document.querySelector(scope);
      return points.map((p) => {
        if (!root || p.x < 0 || p.y < 0 || p.x >= window.innerWidth || p.y >= window.innerHeight) return false;
        const el = document.elementFromPoint(p.x, p.y);
        if (!el || !root.contains(el)) return false;
        return !el.closest('button, a, input, select, textarea, [role="dialog"], [role="button"]');
      });
    },
    { points, scope }
  );
}

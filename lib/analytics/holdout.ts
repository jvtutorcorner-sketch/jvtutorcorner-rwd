// lib/analytics/holdout.ts
//
// Stable 10% recommendation holdout (docs/ai-platform/ai-feature-benefit-
// assessment-2026-09-27.md §1.1). A holdout user sees the popularity-only
// ranking the engine already uses for cold-start users; everyone else gets
// personalised results. The arm is a pure function of userId, so the
// recommendations API and the impression tracker always agree.
//
// Change SALT to reshuffle arms (e.g. to start a new experiment).

import type { RecArm } from './events';

const SALT = 'rec-holdout-v1';
export const DEFAULT_HOLDOUT_PCT = 10;
const MAX_HOLDOUT_PCT = 50;

/** FNV-1a 32-bit hash. */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Holdout share from ANALYTICS_REC_HOLDOUT_PCT (default 10, clamped 0–50; 0 disables). */
export function holdoutPct(): number {
  const raw = process.env.ANALYTICS_REC_HOLDOUT_PCT;
  if (raw === undefined || raw.trim() === '') return DEFAULT_HOLDOUT_PCT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_HOLDOUT_PCT;
  return Math.min(MAX_HOLDOUT_PCT, Math.max(0, Math.floor(n)));
}

export function assignArm(userId: string, pct: number = holdoutPct()): RecArm {
  if (!userId || pct <= 0) return 'treatment';
  return fnv1a32(`${SALT}:${userId}`) % 100 < pct ? 'holdout' : 'treatment';
}

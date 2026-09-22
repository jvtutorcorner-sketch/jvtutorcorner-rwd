// lib/ai/entitlements.ts
//
// 7-layer AI feature entitlement resolver. resolveFeature() fetches the up-to-7
// scope rows for a feature and resolves them top-down:
//   GLOBAL → TENANT → PLAN → TEACHER → COURSE → LESSON → USER
//
// enabled is tri-state on|off|inherit; a lower layer may override a higher one,
// EXCEPT a `locked:off` at any layer is final (kill switch). Params:
//   - non-cost (pointCost display, modelPolicy, syncOrAsync): nearest scope wins
//   - cost-bearing (limits, maxCostPerRequest, requiredPlan): most restrictive
// Then a plan gate (requiredPlan vs the resolved plan) can force off.
//
// The pure `resolve()` is exported for offline tests. `resolveFeature()` wires it
// to the store (lib/ai/featureConfigStore.ts) and lib/planAccess.ts.

import { hasPlanAccess, PLAN_LEVELS } from '@/lib/planAccess';
import { getFeatureRows, type FeatureConfigRow } from '@/lib/ai/featureConfigStore';

export interface FeatureSeed {
  defaultEnabled: boolean;
  requiredPlan?: string;
  syncOrAsync?: 'sync' | 'async';
  pointCost?: number;
}

// Code seed: the default posture per feature when no DB row overrides it.
// Mirrors the Plan×Feature matrix in the architecture plan §7.
export const FEATURE_SEEDS: Record<string, FeatureSeed> = {
  marker_timeline: { defaultEnabled: true, syncOrAsync: 'sync' },
  l1_detect: { defaultEnabled: false, requiredPlan: 'pro', syncOrAsync: 'async' },
  l2_segment: { defaultEnabled: false, requiredPlan: 'pro', syncOrAsync: 'async' },
  l3_lesson: { defaultEnabled: false, requiredPlan: 'basic', syncOrAsync: 'async' },
  l4_profile: { defaultEnabled: false, requiredPlan: 'pro', syncOrAsync: 'async' },
  copilot: { defaultEnabled: false, requiredPlan: 'pro', syncOrAsync: 'sync' },
  tutor: { defaultEnabled: false, requiredPlan: 'basic', syncOrAsync: 'sync' },
  assessment: { defaultEnabled: false, requiredPlan: 'pro', syncOrAsync: 'sync' },
  ai_review: { defaultEnabled: false, requiredPlan: 'pro', syncOrAsync: 'async' },
  ai_image: { defaultEnabled: false, syncOrAsync: 'async' },
  ai_video: { defaultEnabled: false, syncOrAsync: 'async' },
  ai_digital_human: { defaultEnabled: false, syncOrAsync: 'async' },
  ai_voice: { defaultEnabled: false, syncOrAsync: 'async' },
};

export interface EntitlementContext {
  orgId?: string;
  planId?: string;
  teacherId?: string;
  courseId?: string;
  sessionId?: string; // LESSON scope
  userId?: string;
}

export interface Entitlement {
  featureId: string;
  enabled: boolean;
  reason: 'ok' | 'default-off' | 'off' | 'locked' | 'plan';
  locked: boolean;
  pointCost?: number;
  requiredPlan?: string;
  syncOrAsync?: 'sync' | 'async';
  modelPolicy?: Record<string, unknown>;
  limits: { daily?: number; monthly?: number; perLesson?: number };
  maxCostPerRequestMusd?: number;
}

// Scope order top→down (least→most specific).
export function scopeChain(ctx: EntitlementContext): string[] {
  const chain: string[] = ['GLOBAL'];
  if (ctx.orgId) chain.push(`TENANT#${ctx.orgId}`);
  if (ctx.planId) chain.push(`PLAN#${ctx.planId}`);
  if (ctx.teacherId) chain.push(`TEACHER#${ctx.teacherId}`);
  if (ctx.courseId) chain.push(`COURSE#${ctx.courseId}`);
  if (ctx.sessionId) chain.push(`LESSON#${ctx.sessionId}`);
  if (ctx.userId) chain.push(`USER#${ctx.userId}`);
  return chain;
}

const min = (a: number | undefined, b: number | undefined) =>
  a == null ? b : b == null ? a : Math.min(a, b);
const maxPlan = (a: string | undefined, b: string | undefined) => {
  if (!a) return b;
  if (!b) return a;
  return (PLAN_LEVELS[a] ?? 0) >= (PLAN_LEVELS[b] ?? 0) ? a : b;
};

/**
 * PURE resolution. `rows` are the config rows for this feature; `chain` is the
 * ordered scope keys (top→down). No I/O — unit-testable.
 */
export function resolve(
  featureId: string,
  rows: FeatureConfigRow[],
  chain: string[],
  seed: FeatureSeed,
  planId: string | undefined
): Entitlement {
  const byScope = new Map(rows.map((r) => [r.scope, r]));

  let enabled = seed.defaultEnabled;
  let sawExplicit = false;
  let locked = false;
  let lockedOff = false;

  const out: Entitlement = {
    featureId,
    enabled: false,
    reason: 'default-off',
    locked: false,
    requiredPlan: seed.requiredPlan,
    syncOrAsync: seed.syncOrAsync,
    pointCost: seed.pointCost,
    limits: {},
  };

  for (const scope of chain) {
    const row = byScope.get(scope);
    if (!row) continue;
    // enabled resolution
    if (row.locked && row.enabled === 'off') { lockedOff = true; locked = true; }
    if (row.enabled === 'on') { enabled = true; sawExplicit = true; }
    else if (row.enabled === 'off') { enabled = false; sawExplicit = true; }
    if (row.locked) locked = true;
    // params — non-cost: nearest wins (later in chain overwrites)
    if (row.pointCost != null) out.pointCost = row.pointCost;
    if (row.syncOrAsync) out.syncOrAsync = row.syncOrAsync;
    if (row.modelPolicy) out.modelPolicy = row.modelPolicy;
    // params — cost-bearing: most restrictive
    out.limits.daily = min(out.limits.daily, row.dailyLimit);
    out.limits.monthly = min(out.limits.monthly, row.monthlyLimit);
    out.limits.perLesson = min(out.limits.perLesson, row.perLessonLimit);
    out.maxCostPerRequestMusd = min(out.maxCostPerRequestMusd, row.maxCostPerRequestMusd);
    out.requiredPlan = maxPlan(out.requiredPlan, row.requiredPlan);
  }

  out.locked = locked;

  if (lockedOff) {
    out.enabled = false;
    out.reason = 'locked';
    return out;
  }

  // plan gate
  if (enabled && out.requiredPlan && !hasPlanAccess(planId, out.requiredPlan)) {
    out.enabled = false;
    out.reason = 'plan';
    return out;
  }

  out.enabled = enabled;
  out.reason = enabled ? 'ok' : sawExplicit ? 'off' : 'default-off';
  return out;
}

/** Store-backed resolution for one feature in a context. */
export async function resolveFeature(featureId: string, ctx: EntitlementContext): Promise<Entitlement> {
  const seed = FEATURE_SEEDS[featureId] ?? { defaultEnabled: false };
  const rows = await getFeatureRows(featureId);
  return resolve(featureId, rows, scopeChain(ctx), seed, ctx.planId);
}

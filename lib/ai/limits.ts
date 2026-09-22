// lib/ai/limits.ts
//
// Enforce the per-feature usage limits an entitlement resolves (limits.perLesson,
// limits.daily) using the request-count counters that recordUsage already keeps
// in cost-rollups (FEATURE#f#LESSON#sid and FEATURE#f#USER#uid#yyyymmdd). Read
// BEFORE the metered call: `used` excludes the current request, so used >= limit
// means the quota is already spent. Resilient: any lookup error allows the call
// (a limit check must never break AI — same posture as lib/ai/budget.ts).

import { getRollup } from './gateway/ledger';
import { currentYyyymmdd } from './budget';
import type { Entitlement } from './entitlements';

export interface FeatureLimitCheck {
  allowed: boolean;
  reason?: 'per_lesson_limit' | 'daily_limit';
  used?: number;
  limit?: number;
}

export interface FeatureLimitContext {
  feature: string;
  sessionId?: string;
  userId?: string;
}

export async function checkFeatureLimits(ent: Entitlement, ctx: FeatureLimitContext): Promise<FeatureLimitCheck> {
  const perLesson = ent.limits?.perLesson;
  const daily = ent.limits?.daily;
  if (perLesson == null && daily == null) return { allowed: true };

  try {
    if (perLesson != null && ctx.sessionId) {
      const roll = await getRollup(`FEATURE#${ctx.feature}#LESSON#${ctx.sessionId}`);
      const used = Number(roll?.requests) || 0;
      if (used >= perLesson) return { allowed: false, reason: 'per_lesson_limit', used, limit: perLesson };
    }
    if (daily != null && ctx.userId) {
      const roll = await getRollup(`FEATURE#${ctx.feature}#USER#${ctx.userId}#${currentYyyymmdd()}`);
      const used = Number(roll?.requests) || 0;
      if (used >= daily) return { allowed: false, reason: 'daily_limit', used, limit: daily };
    }
    return { allowed: true };
  } catch (e) {
    console.warn('[limits] checkFeatureLimits failed, allowing', e);
    return { allowed: true };
  }
}

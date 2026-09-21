// lib/planAccess.ts
//
// Server-side plan entitlement — the authoritative check that a buyer's plan is
// high enough for a course's requiredPlan. Until now this comparison only ran
// client-side in components/EnrollButton.tsx (trivially bypassable, since
// /api/orders never re-checked it). This module is the server counterpart.
//
// Pure and dependency-free so it is offline-testable.

export const PLAN_LEVELS: Record<string, number> = {
  viewer: 0,
  basic: 1,
  pro: 2,
  elite: 3,
};

export type PlanId = 'viewer' | 'basic' | 'pro' | 'elite';

/**
 * True when `userPlan` meets or exceeds `requiredPlan`.
 * Unknown user plans are treated as the lowest tier (0); an unknown/blank
 * requiredPlan defaults to 'basic' (level 1), matching the client's default.
 */
export function hasPlanAccess(userPlan: string | undefined | null, requiredPlan: string | undefined | null): boolean {
  const userLevel = PLAN_LEVELS[(userPlan || 'viewer') as string] ?? 0;
  const requiredLevel = requiredPlan ? PLAN_LEVELS[requiredPlan] ?? 1 : 0;
  return userLevel >= requiredLevel;
}

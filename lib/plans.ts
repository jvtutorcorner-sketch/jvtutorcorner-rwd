// lib/plans.ts
//
// THE plan vocabulary. One table, one spelling, one validator.
//
// ── The problem this collapses ────────────────────────────────────────────────
// `profile.plan` was a free-text column. Different writers put different
// vocabularies into it and no reader agreed on the set:
//
//   app/api/auth/callback/google/route.ts   → 'basic'
//   app/api/auth/line-login/callback/...    → 'free'
//   app/admin/settings/page.tsx             → 'premium'
//   lib/types/b2b.ts (the declared type)    → 'basic' | 'pro' | 'elite' | 'viewer'
//   lib/auth/apiGuard.ts (E2E session)      → 'system'
//   lib/paymentSuccessHandler.ts            -> whatever `orderItem.planId` held,
//                                             unvalidated, straight from the
//                                             subscriptions catalogue
//
// So 'premium' was never in the declared type, 'free' and 'basic' both meant
// "no paid plan", and a purchased planId was never checked against the
// catalogue at all. Entitlement checks silently failed open or closed
// depending on which writer touched the row last.
//
// ── The rule now ──────────────────────────────────────────────────────────────
// The subscriptions table (jvtutorcorner-subscriptions, managed at
// /settings/pricing) is the single catalogue. A plan id is legal iff it is in
// that catalogue or in BUILTIN_PLAN_IDS below, and it is stored in SHORT form.
//
// Nothing may write `profile.plan` without going through assertPlanId() /
// normalizePlanId() first.

import { getAllSubscriptions } from '@/lib/subscriptionsService';

/**
 * Plan ids that are always legal regardless of what the catalogue holds.
 *
 * These are the spellings already present in live profile rows. They are kept
 * valid so this validator does not retroactively invalidate existing accounts;
 * a data migration can shrink this list later, but it must not shrink before
 * the rows do.
 */
export const BUILTIN_PLAN_IDS = [
  'free',    // no paid plan (canonical default)
  'basic',   // historic synonym for 'free' from the Google OAuth signup path
  'viewer',
  'pro',
  'elite',
  'premium', // written by the admin settings page
] as const;

export type BuiltinPlanId = (typeof BUILTIN_PLAN_IDS)[number];

/** The plan a profile has when it has no paid plan. */
export const DEFAULT_PLAN_ID = 'free';

/**
 * Session-only sentinel. lib/auth/apiGuard.ts mints `plan: 'system'` for the E2E
 * bypass session. It is a property of a Session, never of a stored profile, so it
 * is deliberately NOT a valid plan id — if it ever reaches a profile write, that
 * write is a bug and assertPlanId will say so.
 */
export const SESSION_ONLY_PLAN_IDS = ['system'] as const;

/** Catalogue ids are prefixed; stored plan ids are not. 'plan_viewer' -> 'viewer'. */
export function toPlanId(catalogueId: string): string {
  const raw = String(catalogueId ?? '').trim().toLowerCase();
  return raw.startsWith('plan_') ? raw.slice('plan_'.length) : raw;
}

// ── Catalogue cache ───────────────────────────────────────────────────────────
// getAllSubscriptions() is a table Scan. Plan validation sits on login and
// payment paths, so the id set is memoised briefly. A stale cache can only
// reject a plan created in the last minute, never accept a deleted one for long.

const CACHE_TTL_MS = 60 * 1000;
let cached: { ids: Set<string>; extensionIds: Set<string>; expiresAt: number } | null = null;

/** Test seam — force the next lookup to re-read the catalogue. */
export function clearPlanCatalogueCache(): void {
  cached = null;
}

async function loadCatalogue(): Promise<{ ids: Set<string>; extensionIds: Set<string> }> {
  if (cached && Date.now() < cached.expiresAt) return cached;

  const ids = new Set<string>(BUILTIN_PLAN_IDS);
  const extensionIds = new Set<string>();

  try {
    const subscriptions = await getAllSubscriptions();
    for (const sub of subscriptions) {
      if (!sub?.id) continue;
      if (sub.isActive === false) continue;
      if (sub.type === 'PLAN') {
        ids.add(toPlanId(sub.id));
      } else if (sub.type === 'EXTENSION') {
        // Add-ons are a separate axis from the subscription plan. They are
        // recorded on the profile as activeAppPlanIds, never as profile.plan —
        // writing one into profile.plan would silently replace the user's actual
        // plan with the id of an accessory.
        extensionIds.add(String(sub.id).trim().toLowerCase());
      }
    }
  } catch (err: any) {
    console.warn(
      '[plans] could not read the subscription catalogue, falling back to builtins:',
      err?.message || err
    );
  }

  cached = { ids, extensionIds, expiresAt: Date.now() + CACHE_TTL_MS };
  return cached;
}

/**
 * What kind of catalogue entry is this id?
 *
 * 'PLAN'      — belongs in profile.plan
 * 'EXTENSION' — an add-on; belongs in activeAppPlanIds, NOT profile.plan
 * 'UNKNOWN'   — not in the catalogue at all; a configuration fault
 */
export async function classifyCatalogueId(
  raw: string | null | undefined
): Promise<'PLAN' | 'EXTENSION' | 'UNKNOWN'> {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return 'UNKNOWN';

  const { ids, extensionIds } = await loadCatalogue();
  if (extensionIds.has(value)) return 'EXTENSION';
  if (ids.has(toPlanId(value))) return 'PLAN';
  return 'UNKNOWN';
}

/**
 * Every legal plan id: the builtins plus the active PLAN rows in the catalogue.
 *
 * If the catalogue cannot be read the builtins are returned on their own. That
 * degrades to "only legacy plans validate", which is the safe direction: a plan
 * purchase fails loudly instead of writing an unverifiable value.
 */
export async function getValidPlanIds(): Promise<Set<string>> {
  const { ids } = await loadCatalogue();
  return ids;
}

/** Is this a plan id the catalogue recognises? */
export async function isValidPlanId(raw: string | null | undefined): Promise<boolean> {
  const id = toPlanId(String(raw ?? ''));
  if (!id) return false;
  const ids = await getValidPlanIds();
  return ids.has(id);
}

/**
 * Normalise any plan-ish value to a stored plan id, or null if it is not in the
 * catalogue. Null/empty normalises to DEFAULT_PLAN_ID — "no plan" is a plan.
 */
export async function normalizePlanId(
  raw: string | null | undefined
): Promise<string | null> {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return DEFAULT_PLAN_ID;

  const id = toPlanId(trimmed);
  const ids = await getValidPlanIds();
  return ids.has(id) ? id : null;
}

/**
 * Normalise, or throw. Use this on every path that persists `profile.plan`.
 *
 * @throws when the value is not a catalogue plan id, naming what was rejected —
 *         the whole point is that an unknown plan fails at the write, not at
 *         some later entitlement check that cannot tell what went wrong.
 */
export async function assertPlanId(raw: string | null | undefined): Promise<string> {
  const normalized = await normalizePlanId(raw);
  if (normalized === null) {
    const known = Array.from(await getValidPlanIds()).sort().join(', ');
    throw new Error(
      `[plans] "${raw}" is not a known plan id. Known plans: ${known}. ` +
        `Add it at /settings/pricing (subscriptions table) before assigning it.`
    );
  }
  return normalized;
}

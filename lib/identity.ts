// lib/identity.ts
// Single source of truth for resolving/comparing the platform's canonical user identifier.
//
// This codebase has no enforced schema (DynamoDB is accessed ad-hoc, schemaless), so the
// same logical user has historically been reachable via profile.id, profile.roid_id, or a
// stored email string depending on which route/era wrote the record. The healthy paths
// (app/api/login/route.ts, app/api/admin/grant-points/route.ts, scripts/migrate-email-keys.ts)
// already agree on roid_id-first precedence — this module just centralizes that agreement so
// it isn't re-derived inline in N places with N chances to get the precedence backwards.

export interface ProfileLike {
  id?: string;
  roid_id?: string;
}

/** Resolve the canonical id for a profile: roid_id first, falling back to id. */
export function getCanonicalUserId(profile: ProfileLike | null | undefined): string | null {
  if (!profile) return null;
  return profile.roid_id || profile.id || null;
}

/**
 * Tolerant identity comparison for "is this the same user" checks.
 *
 * Exact match first. If both sides look email-shaped, compare case-insensitively —
 * this recovers the common case where one side is a canonical roid_id/id and the
 * other is a legacy/email-shaped value for the same underlying account, without
 * requiring a DB round-trip. Deliberately does NOT attempt a profile lookup to
 * bridge an id-shaped value against an email-shaped value on the other side —
 * that's a heavier operation that belongs to call sites already doing it (e.g.
 * app/api/orders/route.ts's existing id-then-email-scan fallback), not this helper.
 */
export function isSameUser(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const aLooksEmail = a.includes('@');
  const bLooksEmail = b.includes('@');
  if (aLooksEmail && bLooksEmail) return a.toLowerCase() === b.toLowerCase();
  return false;
}

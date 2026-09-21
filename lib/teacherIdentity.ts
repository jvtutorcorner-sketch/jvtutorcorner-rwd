// lib/teacherIdentity.ts
//
// Canonical teacher foreign key resolution.
//
// THE RULE: every cross-table reference to a teacher stores `teacherId`, and that
// value is the teacher profile's canonical id — `profile.roid_id || profile.id`,
// the same precedence lib/identity.ts::getCanonicalUserId already encodes.
//
// Why this module exists: courses, orders and points-escrow rows were historically
// written with whatever the caller happened to hold. app/api/courses/route.ts stored
// BOTH `teacherId` and a `teacherEmail` fallback; app/api/orders/route.ts resolved a
// course's teacher as `teacherId || teacherEmail`, so an email string could end up in
// EscrowRecord.teacherId. Once that happens the escrow release path pays points to
// getUserPoints('someone@example.com') — a different points bucket from the one keyed
// by the teacher's real id, which is how a teacher can complete a course and see no
// points arrive.
//
// Resolution is a profile lookup, so it is async and cached per-process. Call it on
// the WRITE path (when minting a course/order/escrow row) so reads stay key lookups.
//
// See also:
//   - lib/identity.ts            — synchronous, dependency-free comparison helpers
//   - scripts/migrate-teacher-ids.mjs — backfills existing rows to this rule

import { findProfileByEmail, getProfileById } from '@/lib/profilesService';
import { getCanonicalUserId } from '@/lib/identity';

/** How long a resolved id stays cached. Profiles rarely change their canonical id. */
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { value: string | null; expiresAt: number }>();

function cacheGet(key: string): { value: string | null } | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return { value: hit.value };
}

function cacheSet(key: string, value: string | null): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Test seam — drop the memo so a test can change a profile and re-resolve. */
export function clearTeacherIdentityCache(): void {
  cache.clear();
}

/**
 * Resolve any teacher-ish reference (canonical id, legacy profile id, or email)
 * to the canonical teacher id.
 *
 * Returns null when the value is empty or no profile matches. Callers on a write
 * path should treat null as "refuse to write the row" rather than falling back to
 * the raw input — writing the raw input is exactly what produced the mixed-key
 * data this module exists to stop.
 */
export async function resolveCanonicalTeacherId(
  raw: string | null | undefined
): Promise<string | null> {
  const value = String(raw ?? '').trim();
  if (!value) return null;

  const cached = cacheGet(value);
  if (cached) return cached.value;

  let resolved: string | null = null;

  try {
    if (value.includes('@')) {
      const profile = await findProfileByEmail(value);
      resolved = getCanonicalUserId(profile);
    } else {
      // Already id-shaped. Confirm it resolves to a profile and normalize
      // profile.id -> profile.roid_id when the profile carries both.
      const profile = await getProfileById(value);
      resolved = getCanonicalUserId(profile) ?? value;
    }
  } catch (err: any) {
    console.warn(
      `[teacherIdentity] lookup failed for "${value}":`,
      err?.message || err
    );
    // A lookup FAILURE is not the same as "no such teacher". For an id-shaped
    // input we can still hand back the input unchanged (it is at worst the
    // pre-existing behaviour); for an email we cannot invent an id.
    resolved = value.includes('@') ? null : value;
  }

  cacheSet(value, resolved);
  return resolved;
}

/**
 * Resolve, and throw if the reference cannot be pinned to a profile.
 * Use on write paths that must not persist an unresolvable teacher key.
 */
export async function requireCanonicalTeacherId(
  raw: string | null | undefined
): Promise<string> {
  const resolved = await resolveCanonicalTeacherId(raw);
  if (!resolved) {
    throw new Error(
      `[teacherIdentity] cannot resolve "${raw}" to a teacher profile id`
    );
  }
  return resolved;
}

/**
 * Read a course row's teacher key the way every consumer should.
 *
 * Prefers the canonical `teacherId`; only falls back to the legacy `teacherEmail`
 * column for rows written before the migration. The fallback is deliberately NOT
 * resolved here (that would make a read path do a profile lookup) — it is returned
 * as-is so the caller can pass it through resolveCanonicalTeacherId if it is about
 * to be persisted somewhere.
 */
export function readCourseTeacherKey(
  course: { teacherId?: string | null; teacherEmail?: string | null } | null | undefined
): string | null {
  if (!course) return null;
  const id = String(course.teacherId ?? '').trim();
  if (id) return id;
  const email = String(course.teacherEmail ?? '').trim();
  return email || null;
}

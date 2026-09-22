// lib/lessonAI/sessionId.ts
//
// Deterministic, URL-safe lesson session id. Both the teacher's and the
// student's browser derive the SAME id from (courseId, orderId, scheduled start
// minute) the moment they enter a classroom, so the events they each report land
// on one session even though no row exists yet — the id IS the identity, and the
// idempotent Put (attribute_not_exists) resolves the create race.
//
// It reuses buildSummaryId's "scheduled start minute" bucket (lib/classSummary/
// summaryLogic.ts) so the id is stable whether the class ends early or late, and
// so a session and its class-summary can cross-reference. Unlike buildSummaryId
// (which returns `courseId#orderId#bucket`) this is safe in a URL path: no '#'.
//
// Pure + synchronous + dependency-free (no node:crypto), so it runs identically
// in the browser, an API route and an offline verify script. It is NOT a
// security boundary: an API route re-derives the id from the authoritative order
// and rejects a mismatch, so the hash only needs to avoid accidental collisions.

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

/** UTC minute bucket, byte-for-byte identical to buildSummaryId's. */
export function startMinuteBucket(startMs: number): string {
  const d = new Date(startMs);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(
    d.getUTCMinutes()
  )}`;
}

/** cyrb53 — a fast, well-distributed 53-bit string hash (public domain). */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export const LESSON_SESSION_PREFIX = 'lsn_';

/**
 * Derive the deterministic, URL-safe session id for one occurrence of a lesson.
 * Same inputs → same id, in the browser and on the server.
 */
export function deriveLessonSessionId(courseId: string, orderId: string, scheduledStartMs: number): string {
  if (!courseId || !orderId || !Number.isFinite(scheduledStartMs)) {
    throw new Error('[lessonSessionId] courseId, orderId and a finite scheduledStartMs are required');
  }
  const canonical = `${courseId}|${orderId}|${startMinuteBucket(scheduledStartMs)}`;
  return LESSON_SESSION_PREFIX + cyrb53(canonical).toString(36);
}

/** A cheap shape check for a value arriving as a path param. */
export function isLessonSessionId(v: unknown): v is string {
  return typeof v === 'string' && /^lsn_[0-9a-z]+$/.test(v);
}

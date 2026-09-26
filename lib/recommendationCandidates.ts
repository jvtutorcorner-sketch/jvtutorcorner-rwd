// lib/recommendationCandidates.ts
//
// Turn DynamoDB course records (CourseRecord = loose shape) into the normalised
// CourseCandidate the recommendation engine ranks, plus a group-popularity prior.
// Pure — no I/O — so it is offline-testable and works for both the live courses
// table and the bundled fallback (listPublishedCourses returns either).
//
// Popularity: prefer the REAL enrolment count (seatsOccupied, added by
// decorateCoursesWithSeats) normalised to [0,1]; fall back to the old seatsLeft
// inversion only when no record carries an occupancy figure.

import { SUBJECT_TO_TAGS } from '@/lib/surveyTagMap';
import {
  generateRecommendations,
  type CourseCandidate,
  type PinnedItems,
  type RecommendationResult,
  type UserInteraction,
} from '@/lib/recommendationEngine';
import type { RecArm } from '@/lib/analytics/events';

export type CourseRecord = Record<string, any>;

export function toCourseCandidate(rec: CourseRecord): CourseCandidate {
  const category = rec.subject || rec.category || '其他';
  const baseTags = Array.isArray(rec.tags) ? rec.tags.filter((t: unknown): t is string => typeof t === 'string') : [];
  const subjectTags = SUBJECT_TO_TAGS[category] ?? SUBJECT_TO_TAGS[rec.subject] ?? [];
  const tags = Array.from(new Set([...baseTags, ...subjectTags]));

  return {
    id: String(rec.id),
    title: rec.title || '',
    category,
    teacherId: rec.teacherId,
    teacherName: rec.teacherName,
    tags,
    createdAt: rec.createdAt || rec.nextStartDate, // proxy for recency
    // Carried through for CourseCard rendering ([key: string]: unknown on the type).
    pointCost: rec.pointCost,
    pricePerSession: rec.pricePerSession,
    mode: rec.mode,
    level: rec.level,
    status: rec.status,
    description: rec.description,
    coverImage: rec.coverImage,
    seatsLeft: rec.seatsLeft,
    seatsOccupied: rec.seatsOccupied,
    nextStartDate: rec.nextStartDate,
  };
}

/**
 * Group-popularity prior per courseId, normalised to [0,1]. Pure.
 * Prefers real enrolment (seatsOccupied); falls back to seatsLeft inversion
 * (fewer seats left ⇒ more already enrolled ⇒ more popular) when no occupancy
 * signal exists. Courses with no signal get a neutral 0.5.
 */
export function computePopularity(records: CourseRecord[]): Map<string, number> {
  const scores = new Map<string, number>();
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;

  const occ = records.map((c) => num(c.seatsOccupied)).filter((n): n is number => n != null);
  if (occ.length > 0) {
    const max = Math.max(...occ, 1);
    for (const c of records) {
      const o = num(c.seatsOccupied);
      scores.set(String(c.id), o == null ? 0.5 : Math.min(1, Math.max(0, o / max)));
    }
    return scores;
  }

  // Fallback: seatsLeft inversion (min-max across the set).
  const seats = records.map((c) => num(c.seatsLeft)).filter((n): n is number => n != null);
  if (seats.length === 0) return scores; // no signal at all
  const min = Math.min(...seats);
  const max = Math.max(...seats);
  const span = max - min;
  for (const c of records) {
    const s = num(c.seatsLeft);
    if (s == null || span === 0) scores.set(String(c.id), 0.5);
    else scores.set(String(c.id), 1 - (s - min) / span);
  }
  return scores;
}

/**
 * Rank for one experiment arm. The holdout arm ignores the user's interactions
 * and gets exactly the cold-start popularity ranking, so comparing the arms
 * measures what personalisation adds. Guests are never in the holdout.
 */
export function rankForArm(
  arm: RecArm | 'guest',
  interactions: UserInteraction[],
  candidates: CourseCandidate[],
  pinned: PinnedItems = {}
): RecommendationResult & { personalized: boolean } {
  const used = arm === 'holdout' ? [] : interactions;
  const result = generateRecommendations(used, candidates, pinned);
  return { ...result, personalized: used.length > 0 };
}

/** How many ranked courses carry a real popularity signal (not null, not the neutral 0.5). */
export function countPopularitySignals(courses: CourseCandidate[]): number {
  return courses.filter((c) => typeof c.popularityScore === 'number' && c.popularityScore !== 0.5).length;
}

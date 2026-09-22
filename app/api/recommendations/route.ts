/**
 * GET /api/recommendations?userId=xxx
 * Returns personalised top-10 course recommendations.
 * Falls back gracefully for guests (reads seeds from the request body or skips).
 *
 * POST /api/recommendations
 * { userId?, guestSeeds? } – same result but allows passing localStorage seeds for guests.
 */
import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { COURSES } from '@/data/courses';
import type { Course } from '@/data/courses';
import { generateRecommendations, type UserInteraction, type CourseCandidate } from '@/lib/recommendationEngine';
import { SUBJECT_TO_TAGS } from '@/lib/surveyTagMap';

const INTERACTIONS_TABLE =
  process.env.DYNAMODB_TABLE_USER_INTERACTIONS ||
  process.env.USER_INTERACTIONS_TABLE ||
  'jvtutorcorner-user-interactions';

/** Convert a Course to a normalised CourseCandidate with enriched tags */
function toCourseCandidate(course: Course): CourseCandidate {
  const subjectTags = SUBJECT_TO_TAGS[course.subject] ?? [];
  const normalised = Array.from(new Set([...course.tags, ...subjectTags]));
  return {
    id: course.id,
    title: course.title,
    category: course.subject,
    teacherName: course.teacherName,
    tags: normalised,
    createdAt: course.nextStartDate, // proxy for recency; real apps use a dedicated field
    pointCost: course.pointCost,
    pricePerSession: course.pricePerSession,
    mode: course.mode,
    level: course.level,
    status: course.status,
  };
}

/**
 * PLACEHOLDER group-popularity proxy → normalised [0,1] per courseId.
 *
 * The course catalogue has no enrolment / completion / rating / view aggregates yet,
 * so we derive a rough *demand* signal from remaining seats: fewer seats left ⇒ more
 * already enrolled ⇒ more popular. This gives the recommendation engine a cold-start
 * floor so guests are ranked by crowd demand instead of new-item boost alone.
 *
 * Limitations: biased against intentionally small classes; ignores completion & rating;
 * `seatsLeft` is manually maintained. Courses with no `seatsLeft` get a neutral 0.5.
 * TODO: replace with a real popularity table (Bayesian-smoothed enrolments + completion
 * rate + rating), keyed by courseId, computed from the interactions / enrolment stores.
 */
function computePopularityProxy(courses: Course[]): Map<string, number> {
  const scores = new Map<string, number>();
  const seats = courses
    .map((c) => c.seatsLeft)
    .filter((s): s is number => typeof s === 'number' && Number.isFinite(s));

  if (seats.length === 0) return scores; // no signal → leave undefined (engine treats as 0)

  const min = Math.min(...seats);
  const max = Math.max(...seats);
  const span = max - min;

  for (const c of courses) {
    if (typeof c.seatsLeft !== 'number' || !Number.isFinite(c.seatsLeft) || span === 0) {
      scores.set(c.id, 0.5); // unknown / undifferentiated demand → neutral prior
    } else {
      // Invert: fewer seats left → higher popularity.
      scores.set(c.id, 1 - (c.seatsLeft - min) / span);
    }
  }
  return scores;
}

async function fetchInteractionsFromDynamo(userId: string): Promise<UserInteraction[]> {
  try {
    const res = await ddbDocClient.send(
      new QueryCommand({
        TableName: INTERACTIONS_TABLE,
        KeyConditionExpression: 'userId = :uid',
        FilterExpression: 'attribute_not_exists(expiresAt) OR expiresAt > :now',
        ExpressionAttributeValues: {
          ':uid': userId,
          ':now': new Date().toISOString(),
        },
      })
    );
    return (res.Items ?? []) as UserInteraction[];
  } catch (err) {
    console.warn('[recommendations] Dynamo query failed:', (err as Error).message);
    return [];
  }
}

function buildResponse(userId: string | undefined, interactions: UserInteraction[]) {
  const activeRaw = COURSES.filter((c) => c.status !== '下架');
  const popularityById = computePopularityProxy(activeRaw);
  const activeCourses = activeRaw.map((raw) => {
    const candidate = toCourseCandidate(raw);
    candidate.popularityScore = popularityById.get(raw.id);
    return candidate;
  });

  // Pinned: newest course = slot-4 "new feature" stand-in; last course = slot-10 editorial
  const byRecency = [...activeCourses].sort(
    (a, b) => new Date(b.createdAt ?? '').getTime() - new Date(a.createdAt ?? '').getTime()
  );
  const slot4 = byRecency[0] ?? null;
  const slot10 = activeCourses[activeCourses.length - 1] ?? null;

  const result = generateRecommendations(interactions, activeCourses, { slot4, slot10 });

  return NextResponse.json({
    ok: true,
    userId: userId ?? 'guest',
    recommendations: result.courses,
    meta: {
      mmrAlpha: result.mmrAlphaUsed,
      isNewUser: result.isNewUser,
      interactionCount: interactions.length,
      topTags: Object.entries(result.tagScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, score]) => ({ tag, score: Math.round(score * 100) / 100 })),
      // Group-popularity prior used as the cold-start floor (proxy for now – see
      // computePopularityProxy). Ordered to match `recommendations`; null = no signal.
      popularity: result.courses.map((c) => ({
        id: c.id,
        score:
          typeof c.popularityScore === 'number'
            ? Math.round(c.popularityScore * 100) / 100
            : null,
      })),
    },
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') ?? undefined;

  let interactions: UserInteraction[] = [];
  if (userId) {
    interactions = await fetchInteractionsFromDynamo(userId);
  }

  return buildResponse(userId, interactions);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, guestSeeds = [] } = body as {
      userId?: string;
      guestSeeds?: UserInteraction[];
    };

    let interactions: UserInteraction[] = [];

    if (userId) {
      const dbInteractions = await fetchInteractionsFromDynamo(userId);
      interactions = [...dbInteractions, ...guestSeeds];
    } else {
      interactions = guestSeeds;
    }

    return buildResponse(userId, interactions);
  } catch (err: unknown) {
    console.error('[recommendations] POST error:', err);
    return NextResponse.json(
      { message: (err as Error)?.message || 'Server error' },
      { status: 500 }
    );
  }
}

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
  const activeCourses = COURSES.filter((c) => c.status !== '下架').map(toCourseCandidate);

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

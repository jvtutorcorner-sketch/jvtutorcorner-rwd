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
import { generateRecommendations, type UserInteraction } from '@/lib/recommendationEngine';
import { listPublishedCourses } from '@/app/courses/_data';
import { toCourseCandidate, computePopularity } from '@/lib/recommendationCandidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERACTIONS_TABLE =
  process.env.DYNAMODB_TABLE_USER_INTERACTIONS ||
  process.env.USER_INTERACTIONS_TABLE ||
  'jvtutorcorner-user-interactions';

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

async function buildResponse(userId: string | undefined, interactions: UserInteraction[]) {
  // Candidate pool = live published courses (DynamoDB, test rows filtered, bundled
  // fallback when the DB is empty) — the SAME id space the homepage renders, so
  // recommendations dedupe correctly against the catalogue.
  const activeRaw = (await listPublishedCourses()).filter((c) => c.status !== '下架');
  const popularityById = computePopularity(activeRaw);
  const activeCourses = activeRaw.map((raw) => {
    const candidate = toCourseCandidate(raw);
    candidate.popularityScore = popularityById.get(String(raw.id));
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

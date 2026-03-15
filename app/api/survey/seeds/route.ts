/**
 * POST /api/survey/seeds
 * Saves onboarding survey answers as time-decaying interaction seeds.
 * Supports both authenticated users (DynamoDB) and guests (returns seeds for localStorage).
 */
import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { surveyAnswersToSeeds, hasNewFeatureAffinity, type SurveyAnswer } from '@/lib/surveyTagMap';

const INTERACTIONS_TABLE =
  process.env.DYNAMODB_TABLE_USER_INTERACTIONS ||
  process.env.USER_INTERACTIONS_TABLE ||
  'jvtutorcorner-user-interactions';

const SEED_TTL_DAYS = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, answers, source = 'onboarding_survey' } = body as {
      userId?: string;
      answers: SurveyAnswer;
      source?: string;
    };

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ message: 'answers required' }, { status: 400 });
    }

    const seeds = surveyAnswersToSeeds(answers);
    const newFeatureAffinity = hasNewFeatureAffinity(answers);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SEED_TTL_DAYS * 86_400_000).toISOString();

    const seedRecords = seeds.map((seed) => ({
      interactionId: `survey_${seed.tag}_${now.getTime()}`,
      tag: seed.tag,
      weight: seed.weight,
      source,
      createdAt: now.toISOString(),
      expiresAt,
      newFeatureAffinity,
    }));

    // Authenticated user → persist to DynamoDB
    if (userId) {
      const putRequests = seedRecords.map((record) => ({
        PutRequest: {
          Item: {
            userId,
            ...record,
          },
        },
      }));

      // BatchWrite in chunks of 25 (DynamoDB limit)
      for (let i = 0; i < putRequests.length; i += 25) {
        const chunk = putRequests.slice(i, i + 25);
        try {
          await ddbDocClient.send(
            new BatchWriteCommand({
              RequestItems: { [INTERACTIONS_TABLE]: chunk },
            })
          );
        } catch (err) {
          console.warn('[survey/seeds] DynamoDB write failed:', (err as Error).message);
          // Non-fatal – return seeds anyway so the client can cache locally
        }
      }

      return NextResponse.json({
        ok: true,
        seedCount: seedRecords.length,
        newFeatureAffinity,
        persisted: true,
      });
    }

    // Guest user → return seeds for localStorage caching (no DB write)
    return NextResponse.json({
      ok: true,
      seedCount: seedRecords.length,
      newFeatureAffinity,
      persisted: false,
      seeds: seedRecords, // client will store these in localStorage
    });
  } catch (err: unknown) {
    console.error('[survey/seeds] Error:', err);
    return NextResponse.json(
      { message: (err as Error)?.message || 'Server error' },
      { status: 500 }
    );
  }
}

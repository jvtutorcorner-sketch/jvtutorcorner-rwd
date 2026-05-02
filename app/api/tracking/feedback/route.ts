/**
 * POST /api/tracking/feedback
 * Records user feedback on recommendations
 * - Like (weight: 0.3) - mild positive signal
 * - Dislike (weight: -1.0) - negative signal to suppress similar recommendations
 */
import { NextRequest, NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const INTERACTIONS_TABLE =
  process.env.DYNAMODB_TABLE_USER_INTERACTIONS ||
  process.env.USER_INTERACTIONS_TABLE ||
  'jvtutorcorner-user-interactions';

const SEED_TTL_DAYS = 30;

// Weight mapping for feedback types
const FEEDBACK_WEIGHTS = {
  like: 0.3, // Mild positive signal
  dislike: -1.0, // Strong negative signal
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      courseId,
      courseName,
      tags = [],
      feedback = 'dislike', // 'like' or 'dislike'
      reason,
    } = body;

    if (!userId || !courseId) {
      return NextResponse.json(
        { error: 'userId and courseId are required' },
        { status: 400 }
      );
    }

    if (!['like', 'dislike'].includes(feedback)) {
      return NextResponse.json(
        { error: "feedback must be 'like' or 'dislike'" },
        { status: 400 }
      );
    }

    // Validate tags is an array
    const tagsArray = Array.isArray(tags) ? tags : [];
    if (tagsArray.length === 0) {
      return NextResponse.json(
        { ok: true, interactionsCreated: 0 }
      );
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + SEED_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const weight = FEEDBACK_WEIGHTS[feedback as keyof typeof FEEDBACK_WEIGHTS] || 0;

    // Create one interaction record per tag
    const putRequests = tagsArray.map((tag: string) => ({
      PutRequest: {
        Item: {
          userId,
          interactionId: `feedback_${courseId}_${Date.now()}`,
          tag,
          weight, // Positive for like, negative for dislike
          source: `feedback_${feedback}`,
          createdAt: now,
          expiresAt,
          metadata: {
            courseId,
            courseName,
            feedback,
            reason, // Optional reason for analytics
          },
        },
      },
    }));

    // Batch write to DynamoDB
    if (putRequests.length > 0) {
      // Split into chunks of 25 (DynamoDB BatchWrite limit)
      const chunks = [];
      for (let i = 0; i < putRequests.length; i += 25) {
        chunks.push(putRequests.slice(i, i + 25));
      }

      for (const chunk of chunks) {
        await ddbDocClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [INTERACTIONS_TABLE]: chunk,
            },
          })
        );
      }
    }

    return NextResponse.json({
      ok: true,
      courseId,
      feedback,
      weight,
      interactionsCreated: tagsArray.length,
      message: `Recorded ${tagsArray.length} ${feedback} feedback interaction(s) with weight ${weight}`,
    });
  } catch (error) {
    console.error('Error in POST /api/tracking/feedback:', error);
    return NextResponse.json(
      { error: 'Failed to track feedback' },
      { status: 500 }
    );
  }
}

// Optional: GET endpoint for monitoring
export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'POST /api/tracking/feedback to record like/dislike feedback',
    feedbackTypes: ['like', 'dislike'],
    weights: FEEDBACK_WEIGHTS,
  });
}

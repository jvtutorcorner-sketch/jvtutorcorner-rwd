/**
 * POST /api/tracking/course-click
 * Records when a user clicks on a course card
 * Supports both authenticated users and guests
 */
import { NextRequest, NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const INTERACTIONS_TABLE =
  process.env.DYNAMODB_TABLE_USER_INTERACTIONS ||
  process.env.USER_INTERACTIONS_TABLE ||
  'jvtutorcorner-user-interactions';

const SEED_TTL_DAYS = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, courseId, courseName, tags = [], source = 'homepage', timestamp } = body;

    if (!courseId) {
      return NextResponse.json(
        { error: 'courseId is required' },
        { status: 400 }
      );
    }

    // If no userId (guest), just acknowledge
    if (!userId) {
      return NextResponse.json(
        { ok: true, mode: 'guest', message: 'Click tracked (guest mode)' }
      );
    }

    // Validate tags is an array
    const tagsArray = Array.isArray(tags) ? tags : [];
    if (tagsArray.length === 0) {
      return NextResponse.json(
        { ok: true, mode: 'tracked', interactionsCreated: 0 }
      );
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + SEED_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    // Create one interaction record per tag
    const putRequests = tagsArray.map((tag: string) => ({
      PutRequest: {
        Item: {
          userId,
          interactionId: `click_${courseId}_${Date.now()}`,
          tag,
          weight: 0.5, // Click weight: lower than purchase (2.0) but higher than nothing
          source: `click_${source}`,
          createdAt: now,
          expiresAt,
          metadata: {
            courseId,
            courseName,
            userTimestamp: timestamp,
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
      mode: 'tracked',
      courseId,
      interactionsCreated: tagsArray.length,
      message: `Recorded ${tagsArray.length} click interaction(s)`,
    });
  } catch (error) {
    console.error('Error in POST /api/tracking/course-click:', error);
    return NextResponse.json(
      { error: 'Failed to track course click' },
      { status: 500 }
    );
  }
}

// Optional: GET endpoint for monitoring
export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'POST /api/tracking/course-click to record click events',
  });
}

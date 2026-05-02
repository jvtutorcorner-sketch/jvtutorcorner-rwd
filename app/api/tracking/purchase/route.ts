/**
 * POST /api/tracking/purchase
 * Records when a user purchases/enrolls in a course
 * Purchase events have the highest weight (2.0) to indicate strong interest
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
    const {
      userId,
      courseId,
      courseName,
      tags = [],
      price,
      currency,
      planType = 'points',
    } = body;

    if (!userId || !courseId) {
      return NextResponse.json(
        { error: 'userId and courseId are required' },
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

    // Create one interaction record per tag with high weight
    const putRequests = tagsArray.map((tag: string) => ({
      PutRequest: {
        Item: {
          userId,
          interactionId: `purchase_${courseId}_${Date.now()}`,
          tag,
          weight: 2.0, // Purchase weight: highest (indicates strong interest)
          source: `purchase_${planType}`,
          createdAt: now,
          expiresAt,
          metadata: {
            courseId,
            courseName,
            price,
            currency,
            planType,
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
      interactionsCreated: tagsArray.length,
      message: `Recorded ${tagsArray.length} purchase interaction(s) with weight 2.0`,
    });
  } catch (error) {
    console.error('Error in POST /api/tracking/purchase:', error);
    return NextResponse.json(
      { error: 'Failed to track purchase' },
      { status: 500 }
    );
  }
}

// Optional: GET endpoint for monitoring
export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'POST /api/tracking/purchase to record purchase/enrollment events',
  });
}

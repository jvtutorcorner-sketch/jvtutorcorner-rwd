/**
 * POST /api/tracking/scroll-depth
 * Records how deeply users engage with the recommendations page
 * Helps identify if users are seeing all recommendations or just scrolling through
 */
import { NextRequest, NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

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
      scrollDepth, // 0-1, percentage
      viewportHeight,
      contentHeight,
      timeSpent, // milliseconds
    } = body;

    if (scrollDepth === undefined || scrollDepth < 0 || scrollDepth > 1) {
      return NextResponse.json(
        { error: 'scrollDepth must be between 0 and 1' },
        { status: 400 }
      );
    }

    // Guest tracking: just acknowledge
    if (!userId) {
      return NextResponse.json({
        ok: true,
        mode: 'guest',
        message: 'Scroll depth tracked (guest mode)',
      });
    }

    // Only record high engagement (> 70% scroll)
    if (scrollDepth <= 0.7) {
      return NextResponse.json({
        ok: true,
        scrollDepth,
        recorded: false,
        message: 'Scroll depth below threshold (70%)',
      });
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + SEED_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    // Record a generic "high_engagement" signal
    await ddbDocClient.send(
      new PutCommand({
        TableName: INTERACTIONS_TABLE,
        Item: {
          userId,
          interactionId: `engagement_scroll_${Date.now()}`,
          tag: '__engagement_high',
          weight: 0.2, // Small boost to engagement score
          source: 'scroll_depth',
          createdAt: now,
          expiresAt,
          metadata: {
            scrollDepth,
            viewportHeight,
            contentHeight,
            timeSpent,
          },
        },
      })
    );

    return NextResponse.json({
      ok: true,
      scrollDepth,
      recorded: true,
      message: `High engagement detected (${(scrollDepth * 100).toFixed(1)}% scrolled)`,
    });
  } catch (error) {
    console.error('Error in POST /api/tracking/scroll-depth:', error);
    return NextResponse.json(
      { error: 'Failed to track scroll depth' },
      { status: 500 }
    );
  }
}

// Optional: GET endpoint for monitoring
export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'POST /api/tracking/scroll-depth to record user engagement depth',
    threshold: '70% (0.7)',
    engagementTag: '__engagement_high',
    engagementWeight: 0.2,
  });
}

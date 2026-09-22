/**
 * POST /api/tracking/scroll-depth
 * Records a single "high engagement" signal when a logged-in user scrolls past
 * 70% of the recommendations page. Requires a session; userId from the session.
 */
import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { buildInteractionItems, putInteractions } from '@/lib/interactionsStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePost(req: AuthedRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { scrollDepth, viewportHeight, contentHeight, timeSpent } = body ?? {};

    if (typeof scrollDepth !== 'number' || scrollDepth < 0 || scrollDepth > 1) {
      return NextResponse.json({ ok: false, error: 'scrollDepth must be between 0 and 1' }, { status: 400 });
    }

    // Only record high engagement (> 70% scroll).
    if (scrollDepth <= 0.7) {
      return NextResponse.json({ ok: true, scrollDepth, recorded: false });
    }

    const items = buildInteractionItems({
      userId: req.session.userId,
      kind: 'engagement',
      courseId: 'scroll',
      tags: ['__engagement_high'],
      weight: 0.2,
      source: 'scroll_depth',
      metadata: { scrollDepth, viewportHeight, contentHeight, timeSpent },
    });
    await putInteractions(items);

    return NextResponse.json({ ok: true, scrollDepth, recorded: true });
  } catch (error) {
    console.error('Error in POST /api/tracking/scroll-depth:', error);
    return NextResponse.json({ ok: false, error: 'Failed to track scroll depth' }, { status: 500 });
  }
}

export const POST = withAuth(handlePost);

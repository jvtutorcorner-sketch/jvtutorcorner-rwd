/**
 * POST /api/tracking/course-click
 * Records when a logged-in user clicks a course card. Requires a session; the
 * userId is taken from the session (never the body) so callers cannot poison
 * another user's recommendation profile.
 */
import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { buildInteractionItems, putInteractions } from '@/lib/interactionsStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePost(req: AuthedRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { courseId, courseName, tags = [], source = 'homepage', timestamp } = body ?? {};

    if (!courseId) {
      return NextResponse.json({ ok: false, error: 'courseId is required' }, { status: 400 });
    }

    const items = buildInteractionItems({
      userId: req.session.userId,
      kind: 'click',
      courseId,
      courseName,
      tags,
      weight: 0.5,
      source: `click_${source}`,
      metadata: { userTimestamp: timestamp },
    });
    const interactionsCreated = await putInteractions(items);

    return NextResponse.json({ ok: true, courseId, interactionsCreated });
  } catch (error) {
    console.error('Error in POST /api/tracking/course-click:', error);
    return NextResponse.json({ ok: false, error: 'Failed to track course click' }, { status: 500 });
  }
}

export const POST = withAuth(handlePost);

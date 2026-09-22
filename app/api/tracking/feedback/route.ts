/**
 * POST /api/tracking/feedback
 * Records like (0.3) / dislike (-1.0) feedback on a recommendation. Requires a
 * session; userId comes from the session, not the body.
 */
import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { buildInteractionItems, putInteractions } from '@/lib/interactionsStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FEEDBACK_WEIGHTS = {
  like: 0.3,
  dislike: -1.0,
} as const;

async function handlePost(req: AuthedRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { courseId, courseName, tags = [], feedback = 'dislike', reason } = body ?? {};

    if (!courseId) {
      return NextResponse.json({ ok: false, error: 'courseId is required' }, { status: 400 });
    }
    if (!['like', 'dislike'].includes(feedback)) {
      return NextResponse.json({ ok: false, error: "feedback must be 'like' or 'dislike'" }, { status: 400 });
    }

    const weight = FEEDBACK_WEIGHTS[feedback as keyof typeof FEEDBACK_WEIGHTS] ?? 0;
    const items = buildInteractionItems({
      userId: req.session.userId,
      kind: 'feedback',
      courseId,
      courseName,
      tags,
      weight,
      source: `feedback_${feedback}`,
      metadata: { feedback, reason },
    });
    const interactionsCreated = await putInteractions(items);

    return NextResponse.json({ ok: true, courseId, feedback, weight, interactionsCreated });
  } catch (error) {
    console.error('Error in POST /api/tracking/feedback:', error);
    return NextResponse.json({ ok: false, error: 'Failed to track feedback' }, { status: 500 });
  }
}

export const POST = withAuth(handlePost);

/**
 * POST /api/tracking/purchase
 * Records a course purchase/enrollment (weight 2.0). Requires a session; userId
 * comes from the session, not the body. NOTE: the enrollment path also writes
 * this signal server-side (lib/paymentSuccessHandler.ts) — this route stays for
 * manual/legacy callers.
 */
import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { buildInteractionItems, putInteractions } from '@/lib/interactionsStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePost(req: AuthedRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { courseId, courseName, tags = [], price, currency, planType = 'points' } = body ?? {};

    if (!courseId) {
      return NextResponse.json({ ok: false, error: 'courseId is required' }, { status: 400 });
    }

    const items = buildInteractionItems({
      userId: req.session.userId,
      kind: 'purchase',
      courseId,
      courseName,
      tags,
      weight: 2.0,
      source: `purchase_${planType}`,
      metadata: { price, currency, planType },
    });
    const interactionsCreated = await putInteractions(items);

    return NextResponse.json({ ok: true, courseId, interactionsCreated });
  } catch (error) {
    console.error('Error in POST /api/tracking/purchase:', error);
    return NextResponse.json({ ok: false, error: 'Failed to track purchase' }, { status: 500 });
  }
}

export const POST = withAuth(handlePost);

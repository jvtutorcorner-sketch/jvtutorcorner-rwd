/**
 * POST /api/tracking/rec-impression
 * Records that a logged-in user was shown the homepage recommendation cards —
 * the denominator of recommendation CTR. userId comes from the session and the
 * experiment arm is recomputed here (never trusted from the body).
 * Body: { courseIds: string[] }
 */
import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { recordEvent } from '@/lib/analytics/eventStore';
import { assignArm } from '@/lib/analytics/holdout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IDS = 10;

async function handlePost(req: AuthedRequest) {
  const body = await req.json().catch(() => ({}));
  const raw: unknown[] = Array.isArray(body?.courseIds) ? body.courseIds : [];
  const courseIds = raw
    .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128)
    .slice(0, MAX_IDS);
  if (courseIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'courseIds is required' }, { status: 400 });
  }

  const userId = req.session.userId;
  await recordEvent({ type: 'rec_impression', userId, courseIds, arm: assignArm(userId) });
  return NextResponse.json({ ok: true });
}

export const POST = withAuth(handlePost);

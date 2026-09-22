// PATCH /api/lessons/[sessionId]/segments/[seq]
//
// Teacher post-class edit of one segment: rename topic/objective or nudge the
// boundary times (merge/split are expressed as boundary edits + re-finalize).
// Host only. `seq` is the zero-padded SK from the timeline row.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveLessonContext } from '@/lib/lessonAI/lessonContext';
import { updateLessonSegment } from '@/lib/lessonAI/lessonStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePatch(
  req: AuthedRequest,
  ctx: { params: Promise<{ sessionId: string; seq: string }> }
) {
  const { sessionId, seq } = await ctx.params;
  const lc = await resolveLessonContext(req.session, sessionId);
  if (!lc.ok) return NextResponse.json({ ok: false, error: lc.error }, { status: lc.status });
  if (!lc.access.isHost) {
    return NextResponse.json({ ok: false, error: 'Only the teacher can edit segments' }, { status: 403 });
  }

  let body: { topic?: unknown; objective?: unknown; startSec?: unknown; endSec?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const patch: { topic?: string; objective?: string; startSec?: number; endSec?: number } = {};
  if (typeof body.topic === 'string') patch.topic = body.topic.slice(0, 200);
  if (typeof body.objective === 'string') patch.objective = body.objective.slice(0, 500);
  if (typeof body.startSec === 'number' && Number.isFinite(body.startSec)) patch.startSec = Math.max(0, Math.round(body.startSec));
  if (typeof body.endSec === 'number' && Number.isFinite(body.endSec)) patch.endSec = Math.max(0, Math.round(body.endSec));
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 });
  }

  try {
    const updated = await updateLessonSegment(sessionId, seq, patch, req.session.userId);
    if (!updated) return NextResponse.json({ ok: false, error: 'Segment not found' }, { status: 404 });
    return NextResponse.json({ ok: true, segment: updated });
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      return NextResponse.json({ ok: false, error: 'Segment not found' }, { status: 404 });
    }
    throw err;
  }
}

export const PATCH = withAuth(handlePatch);

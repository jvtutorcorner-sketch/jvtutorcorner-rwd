// POST /api/lessons/[sessionId]/finalize
//
// Run the Segmenter over the lesson's events and (re)write its segments. Host
// only. Idempotent (the Segmenter is deterministic; a teacher edit survives via
// putLessonSegments). Called on demand; the class-end path calls the same
// finalizeLessonSegments() helper directly.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveLessonContext } from '@/lib/lessonAI/lessonContext';
import { finalizeLessonSegments } from '@/lib/lessonAI/finalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePost(req: AuthedRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const lc = await resolveLessonContext(req.session, sessionId);
  if (!lc.ok) return NextResponse.json({ ok: false, error: lc.error }, { status: lc.status });
  if (!lc.access.isHost) {
    return NextResponse.json({ ok: false, error: 'Only the teacher can finalize a lesson' }, { status: 403 });
  }

  const result = await finalizeLessonSegments({
    sessionId,
    courseId: lc.courseSession.courseId,
    lessonStartIso: lc.courseSession.startedAt || lc.courseSession.startTime,
    lessonEndIso: lc.courseSession.endTime,
  });
  return NextResponse.json({ ok: true, ...result });
}

export const POST = withAuth(handlePost);

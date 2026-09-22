// GET /api/lessons/[sessionId]/timeline
//
// The lesson's Timeline: derived segments + a lesson header. Any authorised
// participant may read it (a student sees the lesson they attended). Phase 3a has
// no audio — the Timeline is markers + system events + time fallback.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveLessonContext } from '@/lib/lessonAI/lessonContext';
import { listLessonSegments } from '@/lib/lessonAI/lessonStore';
import { resolveFeature } from '@/lib/ai/entitlements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(req: AuthedRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const lc = await resolveLessonContext(req.session, sessionId);
  if (!lc.ok) return NextResponse.json({ ok: false, error: lc.error }, { status: lc.status });

  const ent = await resolveFeature('marker_timeline', {
    courseId: lc.courseSession.courseId,
    sessionId,
    teacherId: lc.courseSession.teacherId,
    orgId: lc.courseSession.orgId ?? undefined,
    planId: req.session.plan,
    userId: req.session.userId,
  });
  if (!ent.enabled) {
    return NextResponse.json({ ok: false, error: 'Timeline is disabled', reason: ent.reason }, { status: 403 });
  }

  const segments = await listLessonSegments(sessionId);
  return NextResponse.json({
    ok: true,
    sessionId,
    isHost: lc.access.isHost,
    lesson: {
      courseId: lc.courseSession.courseId,
      title: lc.courseSession.title,
      startTime: lc.courseSession.startedAt || lc.courseSession.startTime,
      endTime: lc.courseSession.completedAt || lc.courseSession.endTime,
      status: lc.courseSession.status,
    },
    segments,
  });
}

export const GET = withAuth(handleGet);

// POST /api/lessons/[sessionId]/markers
//
// Teacher teaching markers (Phase 3a). Zero AI cost. Only the course host may add
// them; marker_timeline can be globally killed via ai-feature-config.

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveLessonContext } from '@/lib/lessonAI/lessonContext';
import { appendLessonEvent } from '@/lib/lessonAI/lessonStore';
import { isMarkerType } from '@/lib/lessonAI/eventTypes';
import { resolveFeature } from '@/lib/ai/entitlements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePost(req: AuthedRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const lc = await resolveLessonContext(req.session, sessionId);
  if (!lc.ok) return NextResponse.json({ ok: false, error: lc.error }, { status: lc.status });
  if (!lc.access.isHost) {
    return NextResponse.json({ ok: false, error: 'Only the teacher can add markers' }, { status: 403 });
  }

  const ent = await resolveFeature('marker_timeline', {
    courseId: lc.courseSession.courseId,
    sessionId,
    teacherId: lc.courseSession.teacherId,
    orgId: lc.courseSession.orgId ?? undefined,
    planId: req.session.plan,
    userId: req.session.userId,
  });
  if (!ent.enabled) {
    return NextResponse.json({ ok: false, error: 'Markers are disabled', reason: ent.reason }, { status: 403 });
  }

  let body: { type?: unknown; note?: unknown; clientTs?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!isMarkerType(body.type)) {
    return NextResponse.json({ ok: false, error: 'Invalid marker type' }, { status: 400 });
  }
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : undefined;
  const clientTs =
    typeof body.clientTs === 'number' && Number.isFinite(body.clientTs) ? body.clientTs : Date.now();

  const startMs = Date.parse(lc.courseSession.startedAt || lc.courseSession.startTime) || clientTs;
  const offsetSec = Math.max(0, Math.round((clientTs - startMs) / 1000));

  const event = await appendLessonEvent(
    sessionId,
    {
      eventId: randomUUID(),
      source: 'marker',
      type: body.type,
      offsetSec,
      ts: clientTs,
      confidence: 1,
      actorRole: 'teacher',
      track: 'teacher',
      note,
    },
    { courseId: lc.courseSession.courseId, createdBy: req.session.userId }
  );

  return NextResponse.json({ ok: true, event });
}

export const POST = withAuth(handlePost);

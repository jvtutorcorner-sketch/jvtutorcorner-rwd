// POST /api/lessons/[sessionId]/copilot/suggest
//
// Teacher Copilot (Phase 3b, non-gated): one on-demand teaching suggestion built
// from the lesson's markers + system events (no transcript). Host only,
// entitlement-gated ('copilot', requiredPlan pro) and metered (task 'copilot').
// Body: { focus? }.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveLessonContext } from '@/lib/lessonAI/lessonContext';
import { listLessonEvents, listLessonSegments } from '@/lib/lessonAI/lessonStore';
import { runCopilot } from '@/lib/lessonAI/copilot';
import { resolveFeature } from '@/lib/ai/entitlements';
import { resolveProviderKey } from '@/lib/ai/gateway/keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePost(req: AuthedRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const lc = await resolveLessonContext(req.session, sessionId);
  if (!lc.ok) return NextResponse.json({ ok: false, error: lc.error }, { status: lc.status });
  if (!lc.access.isHost) {
    return NextResponse.json({ ok: false, error: 'Copilot is teacher-only' }, { status: 403 });
  }

  const ent = await resolveFeature('copilot', {
    courseId: lc.courseSession.courseId,
    sessionId,
    teacherId: lc.courseSession.teacherId,
    orgId: lc.courseSession.orgId ?? undefined,
    planId: req.session.plan,
    userId: req.session.userId,
  });
  if (!ent.enabled) {
    return NextResponse.json(
      { ok: false, error: 'Copilot is not available on your plan', reason: ent.reason, requiredPlan: ent.requiredPlan },
      { status: 403 }
    );
  }

  let body: { focus?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* body optional */
  }
  const focus = typeof body.focus === 'string' ? body.focus.slice(0, 300) : undefined;

  // Recent context: last ~30 events + current segments.
  const [events, segments] = await Promise.all([
    listLessonEvents(sessionId, { limit: 30 }),
    listLessonSegments(sessionId),
  ]);
  const recentEvents = events.slice(-30).map((e) => ({ offsetSec: e.offsetSec, source: e.source, type: e.type, note: e.note }));
  const segLite = segments.map((s) => ({ index: s.index, topic: s.topic, boundaryType: s.boundaryType }));

  const res = await runCopilot({
    events: recentEvents,
    segments: segLite,
    courseTitle: lc.courseSession.title,
    focus,
    ctx: {
      feature: 'copilot',
      resolveKey: resolveProviderKey,
      userId: req.session.userId,
      teacherId: lc.courseSession.teacherId,
      courseId: lc.courseSession.courseId,
      sessionId,
      orgId: lc.courseSession.orgId ?? undefined,
    },
  });

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: '暫時無法產生建議,請稍後再試' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, suggestion: res.result.text || '', model: res.model, requestId: res.requestId });
}

export const POST = withAuth(handlePost);

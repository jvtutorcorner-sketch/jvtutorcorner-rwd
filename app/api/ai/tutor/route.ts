// POST /api/ai/tutor
//
// Student Tutor (Phase 3a): one hint per call, server-controlled hint ladder,
// entitlement-gated ('tutor', requiredPlan basic) and metered through the gateway
// (task 'tutor'). Body: { sessionId, question, prevHintLevel? }.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveLessonContext } from '@/lib/lessonAI/lessonContext';
import { isLessonSessionId } from '@/lib/lessonAI/sessionId';
import { nextHintLevel, runTutor } from '@/lib/lessonAI/tutor';
import { resolveFeature } from '@/lib/ai/entitlements';
import { resolveProviderKey } from '@/lib/ai/gateway/keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_QUESTION = 1000;

async function handlePost(req: AuthedRequest) {
  let body: { sessionId?: unknown; question?: unknown; prevHintLevel?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  if (!isLessonSessionId(sessionId)) {
    return NextResponse.json({ ok: false, error: 'Valid sessionId is required' }, { status: 400 });
  }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) return NextResponse.json({ ok: false, error: 'question is required' }, { status: 400 });
  if (question.length > MAX_QUESTION) {
    return NextResponse.json({ ok: false, error: 'question too long' }, { status: 400 });
  }

  const lc = await resolveLessonContext(req.session, sessionId);
  if (!lc.ok) return NextResponse.json({ ok: false, error: lc.error }, { status: lc.status });

  const ent = await resolveFeature('tutor', {
    courseId: lc.courseSession.courseId,
    sessionId,
    teacherId: lc.courseSession.teacherId,
    orgId: lc.courseSession.orgId ?? undefined,
    planId: req.session.plan,
    userId: req.session.userId,
  });
  if (!ent.enabled) {
    return NextResponse.json(
      { ok: false, error: 'Tutor is not available on your plan', reason: ent.reason, requiredPlan: ent.requiredPlan },
      { status: 403 }
    );
  }

  const hintLevel = nextHintLevel(typeof body.prevHintLevel === 'number' ? body.prevHintLevel : 0);

  const res = await runTutor({
    question,
    hintLevel,
    courseTitle: lc.courseSession.title,
    ctx: {
      feature: 'tutor',
      resolveKey: resolveProviderKey,
      userId: req.session.userId,
      courseId: lc.courseSession.courseId,
      teacherId: lc.courseSession.teacherId,
      sessionId,
      orgId: lc.courseSession.orgId ?? undefined,
      meta: { hintLevel },
    },
  });

  if (!res.ok) {
    // On failure the gateway records no usage — the student is not charged.
    return NextResponse.json({ ok: false, error: '暫時無法回覆,請稍後再試', hintLevel }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    hintLevel,
    maxHintLevel: 4,
    answer: res.result.text || '',
    model: res.model,
    requestId: res.requestId,
  });
}

export const POST = withAuth(handlePost);

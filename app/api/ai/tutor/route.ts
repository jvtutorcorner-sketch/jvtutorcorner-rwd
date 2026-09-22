// POST /api/ai/tutor
//
// Student Tutor (Phase 3a): one hint per call, server-controlled hint ladder,
// entitlement-gated ('tutor', requiredPlan basic) and metered through the gateway
// (task 'tutor'). Body: { sessionId, question, prevHintLevel? }.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveLessonContext } from '@/lib/lessonAI/lessonContext';
import { isLessonSessionId } from '@/lib/lessonAI/sessionId';
import { nextHintLevel, runTutor, questionHash, resolvePrevHintLevel } from '@/lib/lessonAI/tutor';
import { listLessonEvents, appendLessonEvent } from '@/lib/lessonAI/lessonStore';
import { TUTOR_HINT_EVENT } from '@/lib/lessonAI/eventTypes';
import { resolveFeature, policyOverrideFromEntitlement } from '@/lib/ai/entitlements';
import { checkFeatureLimits } from '@/lib/ai/limits';
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

  // Usage limits (per-lesson / daily) from the entitlement, enforced via rollups.
  const limit = await checkFeatureLimits(ent, { feature: 'tutor', sessionId, userId: req.session.userId });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Tutor usage limit reached', reason: limit.reason, used: limit.used, limit: limit.limit },
      { status: 429 }
    );
  }

  // Server-authoritative hint ladder: derive the previous level from THIS
  // student's prior tutor_hint events for the same question (client input ignored).
  const qh = questionHash(question);
  const priorEvents = await listLessonEvents(sessionId, { latest: true, limit: 50 });
  const prev = resolvePrevHintLevel(priorEvents, req.session.userId, qh);
  const hintLevel = nextHintLevel(prev);

  const res = await runTutor({
    question,
    hintLevel,
    courseTitle: lc.courseSession.title,
    policy: policyOverrideFromEntitlement(ent),
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

  // Log the hint as an AI-source lesson event so the ladder is server-tracked and
  // the Timeline/Copilot can show tutor usage. No question text is stored.
  try {
    const startMs = Date.parse(lc.courseSession.startedAt || lc.courseSession.startTime || '') || Date.now();
    const offsetSec = Math.max(0, Math.round((Date.now() - startMs) / 1000));
    await appendLessonEvent(
      sessionId,
      {
        eventId: res.requestId,
        source: 'ai',
        type: TUTOR_HINT_EVENT,
        offsetSec,
        ts: Date.now(),
        confidence: 1,
        actorRole: 'student',
        track: 'student',
        payload: { hintLevel, qh },
      },
      { courseId: lc.courseSession.courseId, createdBy: req.session.userId }
    );
  } catch (e) {
    console.warn('[tutor] failed to log hint event (non-fatal)', e);
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

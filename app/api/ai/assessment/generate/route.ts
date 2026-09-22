// POST /api/ai/assessment/generate
//
// Teacher-only AI question generation (Phase 4). Returns DRAFT questions (with
// answers, for the teacher to review/edit) — nothing is persisted until the
// teacher confirms via POST /api/lessons/[sessionId]/assessments. Gated
// ('assessment', requiredPlan pro) + metered (task 'assessment_gen').
// Body: { sessionId, topic, count?, difficulty?, types? }.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveLessonContext } from '@/lib/lessonAI/lessonContext';
import { isLessonSessionId } from '@/lib/lessonAI/sessionId';
import { runGenerate, parseAssessment, type QuestionType } from '@/lib/lessonAI/assessment';
import { resolveFeature } from '@/lib/ai/entitlements';
import { resolveProviderKey } from '@/lib/ai/gateway/keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePost(req: AuthedRequest) {
  let body: { sessionId?: unknown; topic?: unknown; count?: unknown; difficulty?: unknown; types?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  if (!isLessonSessionId(sessionId)) {
    return NextResponse.json({ ok: false, error: 'Valid sessionId is required' }, { status: 400 });
  }
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (!topic) return NextResponse.json({ ok: false, error: 'topic is required' }, { status: 400 });

  const lc = await resolveLessonContext(req.session, sessionId);
  if (!lc.ok) return NextResponse.json({ ok: false, error: lc.error }, { status: lc.status });
  if (!lc.access.isHost) return NextResponse.json({ ok: false, error: 'Only the teacher can generate assessments' }, { status: 403 });

  const ent = await resolveFeature('assessment', {
    courseId: lc.courseSession.courseId,
    sessionId,
    teacherId: lc.courseSession.teacherId,
    orgId: lc.courseSession.orgId ?? undefined,
    planId: req.session.plan,
    userId: req.session.userId,
  });
  if (!ent.enabled) {
    return NextResponse.json(
      { ok: false, error: 'Assessment is not available on your plan', reason: ent.reason, requiredPlan: ent.requiredPlan },
      { status: 403 }
    );
  }

  const count = typeof body.count === 'number' ? body.count : Number(body.count) || 5;
  const difficulty = typeof body.difficulty === 'string' ? body.difficulty.slice(0, 20) : undefined;
  const types = Array.isArray(body.types)
    ? (body.types.filter((t) => t === 'mcq' || t === 'short') as QuestionType[])
    : undefined;

  const res = await runGenerate({
    topic: topic.slice(0, 200),
    count,
    difficulty,
    types,
    courseTitle: lc.courseSession.title,
    ctx: {
      feature: 'assessment',
      resolveKey: resolveProviderKey,
      userId: req.session.userId,
      teacherId: lc.courseSession.teacherId,
      courseId: lc.courseSession.courseId,
      sessionId,
      orgId: lc.courseSession.orgId ?? undefined,
      meta: { mode: 'generate' },
    },
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: '出題暫時失敗,請稍後再試' }, { status: 502 });

  const questions = parseAssessment(res.result.text || '');
  if (!questions) return NextResponse.json({ ok: false, error: '無法解析出題結果,請再試一次' }, { status: 502 });

  return NextResponse.json({ ok: true, questions, model: res.model, requestId: res.requestId });
}

export const POST = withAuth(handlePost);

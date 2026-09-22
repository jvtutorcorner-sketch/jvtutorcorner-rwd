// /api/lessons/[sessionId]/assessments
//   POST — teacher persists a confirmed assessment (dispatched). Host only,
//          entitlement-gated ('assessment').
//   GET  — host: all assessments (full). student: dispatched (redacted) + own
//          submission summary.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveLessonContext } from '@/lib/lessonAI/lessonContext';
import { normalizeQuestions, redactForStudent } from '@/lib/lessonAI/assessment';
import { createAssessment, listAssessmentsBySession, getSubmission } from '@/lib/lessonAI/assessmentStore';
import { resolveFeature } from '@/lib/ai/entitlements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePost(req: AuthedRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const lc = await resolveLessonContext(req.session, sessionId);
  if (!lc.ok) return NextResponse.json({ ok: false, error: lc.error }, { status: lc.status });
  if (!lc.access.isHost) return NextResponse.json({ ok: false, error: 'Only the teacher can create assessments' }, { status: 403 });

  const ent = await resolveFeature('assessment', {
    courseId: lc.courseSession.courseId,
    sessionId,
    teacherId: lc.courseSession.teacherId,
    orgId: lc.courseSession.orgId ?? undefined,
    planId: req.session.plan,
    userId: req.session.userId,
  });
  if (!ent.enabled) {
    return NextResponse.json({ ok: false, error: 'Assessment is not available on your plan', reason: ent.reason }, { status: 403 });
  }

  let body: { title?: unknown; questions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const questions = normalizeQuestions(Array.isArray(body.questions) ? body.questions : [], { preserveQid: true });
  if (questions.length === 0) {
    return NextResponse.json({ ok: false, error: 'At least one valid question is required' }, { status: 400 });
  }
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : '課堂測驗';

  const assessment = await createAssessment({
    sessionId,
    courseId: lc.courseSession.courseId,
    teacherId: lc.courseSession.teacherId,
    title,
    questions,
    status: 'dispatched',
  });
  return NextResponse.json({ ok: true, assessment });
}

async function handleGet(req: AuthedRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const lc = await resolveLessonContext(req.session, sessionId);
  if (!lc.ok) return NextResponse.json({ ok: false, error: lc.error }, { status: lc.status });

  const all = await listAssessmentsBySession(sessionId);
  if (lc.access.isHost) {
    return NextResponse.json({ ok: true, isHost: true, assessments: all });
  }

  // Student: only dispatched, redacted, with their own submission summary.
  const dispatched = all.filter((a) => a.status === 'dispatched');
  const subs = await Promise.all(dispatched.map((a) => getSubmission(a.assessmentId, req.session.userId)));
  const assessments = dispatched.map((a, i) => ({
    assessmentId: a.assessmentId,
    title: a.title,
    status: a.status,
    questions: redactForStudent(a.questions),
    submission: subs[i]
      ? { score: subs[i]!.score, maxScore: subs[i]!.maxScore, status: subs[i]!.status, grades: subs[i]!.grades }
      : null,
  }));
  return NextResponse.json({ ok: true, isHost: false, assessments });
}

export const POST = withAuth(handlePost);
export const GET = withAuth(handleGet);

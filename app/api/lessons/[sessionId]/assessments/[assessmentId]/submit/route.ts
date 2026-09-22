// POST /api/lessons/[sessionId]/assessments/[assessmentId]/submit
//
// Student submits answers. MCQ is graded locally (deterministic); short-answers
// are graded by the model (task 'grading'). Idempotent per student (a re-submit
// re-grades). NOT re-gated on the student's plan — the payer is the teacher/course
// (the assessment was already dispatched under their entitlement); grading cost is
// metered to the teacher/course. Body: { answers: { [qid]: string|number } }.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveLessonContext } from '@/lib/lessonAI/lessonContext';
import { getAssessment, putSubmission } from '@/lib/lessonAI/assessmentStore';
import {
  gradeMcq,
  runGradeShort,
  parseGrade,
  totalScore,
  type AnswerMap,
  type QuestionGrade,
} from '@/lib/lessonAI/assessment';
import { resolveProviderKey } from '@/lib/ai/gateway/keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePost(req: AuthedRequest, ctx: { params: Promise<{ sessionId: string; assessmentId: string }> }) {
  const { sessionId, assessmentId } = await ctx.params;
  const lc = await resolveLessonContext(req.session, sessionId);
  if (!lc.ok) return NextResponse.json({ ok: false, error: lc.error }, { status: lc.status });

  const a = await getAssessment(sessionId, assessmentId);
  if (!a) return NextResponse.json({ ok: false, error: 'Assessment not found' }, { status: 404 });
  if (a.status !== 'dispatched') {
    return NextResponse.json({ ok: false, error: 'Assessment is not open for submission' }, { status: 409 });
  }

  let body: { answers?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const answers = (body.answers && typeof body.answers === 'object' ? body.answers : {}) as AnswerMap;

  // MCQ locally; short-answers via the model (best-effort — MCQ still counts if
  // grading fails).
  const mcqGrades = gradeMcq(a.questions, answers);
  const shortQuestions = a.questions.filter((q) => q.type === 'short');
  let shortGrades: QuestionGrade[] = [];
  if (shortQuestions.length > 0) {
    const res = await runGradeShort({
      shortQuestions,
      answers,
      courseTitle: a.title,
      ctx: {
        feature: 'assessment',
        resolveKey: resolveProviderKey,
        userId: req.session.userId,
        teacherId: a.teacherId,
        courseId: a.courseId,
        sessionId,
        orgId: lc.courseSession.orgId ?? undefined,
        meta: { mode: 'grade' },
      },
    });
    shortGrades = res.ok
      ? parseGrade(res.result.text || '', shortQuestions)
      : shortQuestions.map((q) => ({ qid: q.qid, score: 0, max: q.points, feedback: '批改暫時無法完成,稍後會重新批改。' }));
  }

  // Reassemble in question order.
  const gradeByQid = new Map<string, QuestionGrade>([...mcqGrades, ...shortGrades].map((g) => [g.qid, g]));
  const grades: QuestionGrade[] = a.questions.map(
    (q) => gradeByQid.get(q.qid) || { qid: q.qid, score: 0, max: q.points }
  );
  const { score, max } = totalScore(grades);

  const submission = await putSubmission({
    assessmentId,
    studentId: req.session.userId,
    sessionId,
    courseId: a.courseId,
    answers,
    grades,
    score,
    maxScore: max,
    status: 'graded',
    gradedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, score, maxScore: max, grades, status: submission.status });
}

export const POST = withAuth(handlePost);

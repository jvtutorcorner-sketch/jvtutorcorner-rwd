// GET /api/lessons/[sessionId]/assessments/[assessmentId]
//
// host: the full assessment + all submissions. student: the redacted assessment
// (no answers/rubric) + their own submission.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveLessonContext } from '@/lib/lessonAI/lessonContext';
import { redactForStudent } from '@/lib/lessonAI/assessment';
import { getAssessment, getSubmission, listSubmissions } from '@/lib/lessonAI/assessmentStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(req: AuthedRequest, ctx: { params: Promise<{ sessionId: string; assessmentId: string }> }) {
  const { sessionId, assessmentId } = await ctx.params;
  const lc = await resolveLessonContext(req.session, sessionId);
  if (!lc.ok) return NextResponse.json({ ok: false, error: lc.error }, { status: lc.status });

  const a = await getAssessment(sessionId, assessmentId);
  if (!a) return NextResponse.json({ ok: false, error: 'Assessment not found' }, { status: 404 });

  if (lc.access.isHost) {
    const submissions = await listSubmissions(assessmentId);
    return NextResponse.json({ ok: true, isHost: true, assessment: a, submissions });
  }

  const submission = await getSubmission(assessmentId, req.session.userId);
  return NextResponse.json({
    ok: true,
    isHost: false,
    assessment: { assessmentId: a.assessmentId, title: a.title, status: a.status, questions: redactForStudent(a.questions) },
    submission,
  });
}

export const GET = withAuth(handleGet);

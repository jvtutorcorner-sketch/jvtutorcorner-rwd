// app/api/class-summaries/consent/route.ts
//
// POST /api/class-summaries/consent
// Body: { courseId, orderId, startTime, agreed, teacherId?, studentId? }
//
// Records this participant's recording consent for the class. Recording only ever starts
// when BOTH teacher and student have agreed (checked at presign time via canRecord). The
// participant's role is taken from their verified classroom access, not the client.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { verifyClassroomAccess } from '@/lib/auth/classroomAccess';
import { buildSummaryId, CONSENT_VERSION } from '@/lib/classSummary/summaryLogic';
import { ensureRecordingRow, addConsent, markSkipped } from '@/lib/classSummaryService';
import type { ConsentRecord } from '@/lib/classSummary/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePost(req: AuthedRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const courseId = typeof body?.courseId === 'string' ? body.courseId.trim() : '';
  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  const startMs = typeof body?.startTime === 'string' ? Date.parse(body.startTime) : Number(body?.startTime);
  const agreed = body?.agreed === true;
  if (!courseId || !orderId || !Number.isFinite(startMs)) {
    return NextResponse.json({ ok: false, error: 'courseId, orderId and startTime are required' }, { status: 400 });
  }

  const access = await verifyClassroomAccess(req.session, courseId);
  if (!access.granted) {
    return NextResponse.json({ ok: false, error: 'No access to this class' }, { status: 403 });
  }

  const role: ConsentRecord['role'] = access.isHost ? 'teacher' : 'student';
  const summaryId = buildSummaryId(courseId, orderId, startMs);
  const consent: ConsentRecord = { role, userId: req.session.userId, agreed, at: Date.now(), version: CONSENT_VERSION };

  try {
    await ensureRecordingRow({
      summaryId,
      courseId,
      orderId,
      teacherId: role === 'teacher' ? req.session.userId : typeof body?.teacherId === 'string' ? body.teacherId : '',
      studentId: role === 'student' ? req.session.userId : typeof body?.studentId === 'string' ? body.studentId : undefined,
      consent: [],
      recordingEnabled: true,
    });
    await addConsent(summaryId, consent);
    if (!agreed) await markSkipped(summaryId);
    return NextResponse.json({ ok: true, summaryId, role, agreed });
  } catch (err) {
    console.error('[class-summaries/consent] error', err);
    return NextResponse.json({ ok: false, error: 'Failed to record consent' }, { status: 500 });
  }
}

export const POST = withAuth(handlePost);

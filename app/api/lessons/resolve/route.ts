// POST /api/lessons/resolve
//
// Classroom entry point for the lesson (Phase 3a). Both the teacher and the
// student call this on join with { courseId, orderId? }. The server resolves the
// billing order (explicit orderId, else the one active order in the slot),
// derives the DETERMINISTIC lesson session id, idempotently claims the
// CourseSession row and marks it started, then returns the sessionId the client
// uses for every other /api/lessons/* call. The id is never trusted from the
// client — it is always derived here from the authoritative order.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { verifyClassroomAccess } from '@/lib/auth/classroomAccess';
import { parseOrderTime } from '@/lib/classroomCompletion';
import { buildSummaryId } from '@/lib/classSummary/summaryLogic';
import { deriveLessonSessionId } from '@/lib/lessonAI/sessionId';
import { getOrderById, findCurrentOrderForCourse, getCourseTeacherId } from '@/lib/lessonAI/orderResolve';
import { ensureClassroomSession, markSessionStarted } from '@/lib/courseSessionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePost(req: AuthedRequest) {
  let body: { courseId?: unknown; orderId?: unknown; roomId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const courseId = typeof body.courseId === 'string' ? body.courseId.trim() : '';
  const orderIdInput = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const roomId = typeof body.roomId === 'string' && body.roomId.trim() ? body.roomId.trim() : undefined;
  if (!courseId) return NextResponse.json({ ok: false, error: 'courseId is required' }, { status: 400 });

  const access = await verifyClassroomAccess(req.session, courseId);
  if (!access.granted) {
    return NextResponse.json({ ok: false, error: access.reason || 'No access to this course' }, { status: 403 });
  }

  const now = Date.now();
  const order = orderIdInput ? await getOrderById(orderIdInput) : await findCurrentOrderForCourse(courseId, now);
  if (!order) {
    return NextResponse.json(
      { ok: false, error: 'No unique active order in the current time slot; pass orderId' },
      { status: 404 }
    );
  }
  if (order.courseId !== courseId) {
    return NextResponse.json({ ok: false, error: 'Order does not belong to this course' }, { status: 400 });
  }

  const startMs = parseOrderTime(order.startTime ?? null);
  if (startMs === null) {
    return NextResponse.json({ ok: false, error: 'Order has no scheduled start time' }, { status: 409 });
  }
  const endMs = parseOrderTime(order.endTime ?? null);
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs ?? startMs).toISOString();

  const sessionId = deriveLessonSessionId(courseId, order.orderId, startMs);
  const teacherId = (await getCourseTeacherId(courseId)) || req.session.userId;

  try {
    await ensureClassroomSession({
      id: sessionId,
      courseId,
      teacherId,
      orderId: order.orderId,
      startTime: startIso,
      endTime: endIso,
      roomId,
      summaryId: buildSummaryId(courseId, order.orderId, startMs),
    });
    // Idempotent: conditional on SCHEDULED|LIVE, so a second caller is a no-op.
    await markSessionStarted(sessionId, roomId).catch(() => {});
  } catch (err) {
    console.error('[lessons/resolve] claim failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'Failed to open lesson session' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    sessionId,
    courseId,
    orderId: order.orderId,
    isHost: access.isHost,
    startTime: startIso,
    endTime: endIso,
  });
}

export const POST = withAuth(handlePost);

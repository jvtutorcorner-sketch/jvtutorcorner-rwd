import { NextResponse } from 'next/server';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ddbDocClient } from '@/lib/dynamo';
import { withAuth, AuthedRequest } from '@/lib/auth/apiGuard';
import { verifyOrderToken } from '@/lib/ticket/ticketToken';
import { getProfileById } from '@/lib/profilesService';
import { ATTENDANCE_TABLE } from '@/lib/attendance/types';
import { isSameUser } from '@/lib/identity';
import { listEnrollmentsByOrder } from '@/lib/enrollmentService';

const ORDERS_TABLE = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';
const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

const DUPLICATE_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 hours, matches the existing pre-class reminder window

async function handler(req: AuthedRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { token } = body || {};

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ ok: false, error: 'token is required' }, { status: 400 });
    }

    const orderId = verifyOrderToken(token);
    if (!orderId) {
      return NextResponse.json({ ok: false, error: '無效的票券' }, { status: 400 });
    }

    const orderRes = await ddbDocClient.send(new GetCommand({ TableName: ORDERS_TABLE, Key: { orderId } }));
    const order = orderRes.Item;
    if (!order) {
      return NextResponse.json({ ok: false, error: '查無此訂單' }, { status: 404 });
    }
    if (!['PAID', 'ACTIVE'].includes(order.status)) {
      return NextResponse.json({ ok: false, error: '此票券尚未生效' }, { status: 409 });
    }

    const courseRes = order.courseId
      ? await ddbDocClient.send(new GetCommand({ TableName: COURSES_TABLE, Key: { id: order.courseId } }))
      : null;
    const course = courseRes?.Item || null;

    if (req.session.role === 'teacher') {
      const ownsCourse = course && (isSameUser(course.teacherId, req.session.userId) || isSameUser(course.teacherEmail, req.session.email));
      if (!ownsCourse) {
        return NextResponse.json({ ok: false, error: '您無權掃描此課程的票券' }, { status: 403 });
      }
    }

    // Duplicate-scan check: latest scan for this order within the window is a no-op, not an error.
    const recentRes = await ddbDocClient.send(new QueryCommand({
      TableName: ATTENDANCE_TABLE,
      IndexName: 'OrderIdIndex',
      KeyConditionExpression: 'orderId = :orderId',
      ExpressionAttributeValues: { ':orderId': orderId },
      ScanIndexForward: false,
      Limit: 1,
    }));
    const lastScan = recentRes.Items?.[0];
    if (lastScan && Date.now() - new Date(lastScan.scannedAt).getTime() < DUPLICATE_WINDOW_MS) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        lastScannedAt: lastScan.scannedAt,
        student: { name: lastScan.studentName, email: lastScan.studentEmail },
        course: { title: course?.title || order.courseTitle },
      });
    }

    const studentProfile = order.userId ? await getProfileById(order.userId).catch(() => null) : null;
    const studentName = studentProfile
      ? (studentProfile.fullName || `${studentProfile.firstName || ''} ${studentProfile.lastName || ''}`.trim() || studentProfile.email)
      : (order.userId || '學生');
    const studentEmail = studentProfile?.email || undefined;

    // Attribute the check-in to a specific course session (梯次/場次) when the
    // enrollment names one. Without this, a course that meets more than once
    // produces check-in rows that cannot be attributed to a particular meeting —
    // the row knows WHO and WHICH COURSE, but not WHICH OCCURRENCE.
    // Enrollments predating the session entity carry no courseSessionId, so this
    // stays null for them and the row behaves exactly as before.
    let courseSessionId: string | null = null;
    try {
      const linked = await listEnrollmentsByOrder(orderId);
      courseSessionId = linked.find((e) => e.courseSessionId)?.courseSessionId || null;
    } catch (e) {
      console.warn('[attendance checkin] could not resolve course session for order', orderId, e);
    }

    const now = new Date().toISOString();
    const attendance = {
      id: randomUUID(),
      orderId,
      courseId: order.courseId,
      courseSessionId,
      studentId: order.userId,
      studentName,
      studentEmail,
      scannedAt: now,
      status: 'PRESENT' as const,
      scannedByUserId: req.session.userId,
      scannedByName: req.session.email,
      createdAt: now,
    };

    await ddbDocClient.send(new PutCommand({ TableName: ATTENDANCE_TABLE, Item: attendance }));

    return NextResponse.json({
      ok: true,
      duplicate: false,
      attendance,
      student: { name: studentName, email: studentEmail },
      course: { title: course?.title || order.courseTitle },
    });
  } catch (err: any) {
    console.error('[attendance/checkin] error:', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

export const POST = withAuth(handler, { roles: ['teacher', 'admin'] });

// app/api/enroll/seat/route.ts
//
// B2B seat enrollment: a member of an organisation books a class under the seat
// (license) their organisation assigned them, instead of paying for it.
//
// ── Why this is a separate route ──────────────────────────────────────────────
// POST /api/enroll only opens a PENDING_PAYMENT purchase row, and the order that
// settles it comes from POST /api/orders (points) or a payment webhook. A seat
// student has nothing to pay with — their profile carries plan=null while in an
// org — so the B2C flow either blocked them in the UI or would have required the
// client to claim a PAID status. Here the server itself is the authority: it
// checks the license and writes the enrollment and its zero-amount order together.
//
// ── Access semantics ──────────────────────────────────────────────────────────
// The B2B_SEAT enrollment row written here exists so the class appears in
// /student_courses and /teacher_courses (both read orders) and in org rosters
// (byOrgId). It does NOT grant course access by itself: lib/accessControl.ts
// skips sourceType 'B2B_SEAT' rows and re-checks the license every time, so
// revoking / expiring the seat removes access even though the row remains.
//
// GET  ?courseId=  → { ok, eligible, orgId?, licenseId? } for the enroll button.
// POST { courseId, startTime, endTime } → 201 { ok, order, enrollment }
//
// Time format: startTime / endTime are stored exactly as the B2C flow stores them
// — the datetime-local wall-clock string from EnrollButton (e.g. "2026-09-17T18:00",
// platform time zone Asia/Taipei) — so /student_courses and the classroom window
// treat seat rows and purchased rows identically. Server-side validation parses
// them with parseOrderTime (naive strings = +08:00); a full ISO string with an
// offset is also accepted and stored as sent.

import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import {
  GetCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  type QueryCommandOutput,
  type ScanCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { findValidSeatLicense } from '@/lib/accessControl';
import { toEpochSeconds } from '@/lib/licenseService';
import {
  ENROLLMENTS_TABLE,
  stripEmptyIndexKeys,
  type EnrollmentRecord,
} from '@/lib/enrollmentService';
import { COURSES } from '@/data/courses';
import { parseOrderTime } from '@/lib/classroomCompletion';

export const runtime = 'nodejs';

const ORDERS_TABLE = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';
const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

/** How far in the past a start time may be (clock skew / slow form submit). */
const START_PAST_TOLERANCE_MS = 5 * 60_000;
/** Allowed difference between (end - start) and the course's durationMinutes. */
const DURATION_TOLERANCE_MS = 60_000;
/** Upper bound for a course with no durationMinutes configured. */
const MAX_UNSPECIFIED_DURATION_MS = 8 * 60 * 60_000;

/** Course statuses that must not accept new enrollments. */
const NON_ENROLLABLE_COURSE_STATUSES = new Set(['下架', '待審核']);

/** The order fields this route reads back for the schedule-conflict check. */
type OrderRow = {
  orderId?: string;
  courseId?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
};

type DdbKey = Record<string, unknown> | undefined;

type CourseInfo = {
  id: string;
  title: string;
  status?: string;
  durationMinutes: number;
  totalSessions: number;
};

async function loadCourse(courseId: string): Promise<CourseInfo | null> {
  const res = await ddbDocClient.send(
    new GetCommand({ TableName: COURSES_TABLE, Key: { id: courseId } })
  );
  // Same fallback app/api/orders uses: bundled catalogue courses have no DB row.
  const item = (res.Item || COURSES.find((c) => c.id === courseId)) as
    | { title?: unknown; status?: unknown; durationMinutes?: unknown; totalSessions?: unknown }
    | undefined;
  if (!item) return null;
  return {
    id: courseId,
    title: String(item.title || ''),
    status: item.status ? String(item.status) : undefined,
    durationMinutes: Number(item.durationMinutes) || 0,
    totalSessions: Number(item.totalSessions) || 1,
  };
}

/** Every order of one user (UserIdIndex, with the same Scan fallback as GET /api/orders). */
async function listOrdersByUser(userId: string): Promise<OrderRow[]> {
  const items: OrderRow[] = [];
  try {
    let pageKey: DdbKey = undefined;
    do {
      const res: QueryCommandOutput = await ddbDocClient.send(new QueryCommand({
        TableName: ORDERS_TABLE,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId },
        ...(pageKey ? { ExclusiveStartKey: pageKey } : {}),
      }));
      items.push(...((res.Items || []) as OrderRow[]));
      pageKey = res.LastEvaluatedKey;
    } while (pageKey);
    return items;
  } catch (gsiErr) {
    console.warn('[enroll/seat] UserIdIndex unavailable, falling back to scan:', (gsiErr as Error)?.message);
  }

  items.length = 0;
  let scanKey: DdbKey = undefined;
  do {
    const res: ScanCommandOutput = await ddbDocClient.send(new ScanCommand({
      TableName: ORDERS_TABLE,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ...(scanKey ? { ExclusiveStartKey: scanKey } : {}),
    }));
    items.push(...((res.Items || []) as OrderRow[]));
    scanKey = res.LastEvaluatedKey;
  } while (scanKey);
  return items;
}

function findOverlappingOrder(orders: OrderRow[], startMs: number, endMs: number): OrderRow | null {
  for (const o of orders) {
    if (!o?.startTime) continue;
    const st = String(o.status || '').toUpperCase();
    if (st === 'CANCELLED' || st === 'FAILED' || st === 'REFUNDED') continue;
    const oStart = parseOrderTime(String(o.startTime));
    if (oStart === null) continue;
    let oEnd = o.endTime ? parseOrderTime(String(o.endTime)) : null;
    if (oEnd === null) {
      oEnd = oStart + (Number(o.durationMinutes) || 60) * 60_000;
    }
    if (startMs < oEnd && endMs > oStart) return o;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// GET — is the caller eligible to enroll in this course with a seat?
// ──────────────────────────────────────────────────────────────────────────────
export const GET = withAuth(async (request: AuthedRequest) => {
  try {
    const courseId = new URL(request.url).searchParams.get('courseId');
    if (!courseId) {
      return NextResponse.json({ ok: false, error: 'courseId is required' }, { status: 400 });
    }
    const seat = await findValidSeatLicense(request.session.userId, courseId);
    if (!seat) {
      return NextResponse.json({ ok: true, eligible: false });
    }
    return NextResponse.json({
      ok: true,
      eligible: true,
      orgId: seat.license.orgId,
      licenseId: seat.license.id,
    });
  } catch (err) {
    console.error('[enroll/seat] GET error:', (err as Error)?.message || err);
    return NextResponse.json({ ok: false, error: '伺服器錯誤。' }, { status: 500 });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST — create a seat enrollment + its zero-amount order, atomically
// ──────────────────────────────────────────────────────────────────────────────
export const POST = withAuth(async (request: AuthedRequest) => {
  try {
    let body: { courseId?: unknown; startTime?: unknown; endTime?: unknown } | null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    // Identity is the session's, never the body's.
    const userId = request.session.userId;
    const courseId = body?.courseId ? String(body.courseId) : '';
    const startTime = typeof body?.startTime === 'string' ? body.startTime.trim() : '';
    const endTime = typeof body?.endTime === 'string' ? body.endTime.trim() : '';
    const startMs = parseOrderTime(startTime);
    const endMs = parseOrderTime(endTime);

    if (!courseId) {
      return NextResponse.json({ ok: false, error: '缺少必要欄位（courseId）。' }, { status: 400 });
    }
    if (startMs === null || endMs === null) {
      return NextResponse.json(
        { ok: false, error: 'startTime / endTime 必須是有效的時間。' },
        { status: 400 },
      );
    }

    const course = await loadCourse(courseId);
    if (!course) {
      return NextResponse.json({ ok: false, error: '找不到課程。' }, { status: 404 });
    }
    if (course.status && NON_ENROLLABLE_COURSE_STATUSES.has(course.status)) {
      return NextResponse.json({ ok: false, error: '此課程目前未開放報名。' }, { status: 400 });
    }

    // ── Time validation ────────────────────────────────────────────────────
    const now = Date.now();
    if (startMs < now - START_PAST_TOLERANCE_MS) {
      return NextResponse.json({ ok: false, error: '開始時間不可早於現在。' }, { status: 400 });
    }
    const span = endMs - startMs;
    if (course.durationMinutes > 0) {
      if (Math.abs(span - course.durationMinutes * 60_000) > DURATION_TOLERANCE_MS) {
        return NextResponse.json(
          { ok: false, error: `結束時間必須為開始時間加上課程時長（${course.durationMinutes} 分鐘）。` },
          { status: 400 },
        );
      }
    } else if (span <= 0 || span > MAX_UNSPECIFIED_DURATION_MS) {
      return NextResponse.json({ ok: false, error: '結束時間必須晚於開始時間。' }, { status: 400 });
    }

    // ── Seat check (the same rule verifyCourseAccess applies) ──────────────
    const seat = await findValidSeatLicense(userId, courseId);
    if (!seat) {
      return NextResponse.json(
        { ok: false, error: '您沒有此課程可用的企業席次。' },
        { status: 403 },
      );
    }
    const { license } = seat;

    // A class booked past the seat's expiry could never be attended.
    if (license.expiresAt !== undefined && license.expiresAt !== null) {
      let expirySec: number | null = null;
      try { expirySec = toEpochSeconds(license.expiresAt as number | string); } catch { expirySec = null; }
      if (expirySec !== null && startMs >= expirySec * 1000) {
        return NextResponse.json(
          { ok: false, error: '所選時間已超過企業席次的有效期限。' },
          { status: 400 },
        );
      }
    }

    // ── Schedule conflict (any non-cancelled order of this user) ───────────
    const conflict = findOverlappingOrder(await listOrdersByUser(userId), startMs, endMs);
    if (conflict) {
      return NextResponse.json(
        {
          ok: false,
          error: conflict.courseId === courseId
            ? '您已報名此課程的這個時段。'
            : '所選時段與您已報名的其他課程衝突。',
          conflict: {
            orderId: conflict.orderId,
            courseId: conflict.courseId,
            startTime: conflict.startTime,
            endTime: conflict.endTime,
          },
        },
        { status: 409 },
      );
    }

    // ── Write enrollment + order in one transaction ────────────────────────
    // Ids are derived from (user, course, absolute start instant) so a
    // double-submitted form collides on attribute_not_exists instead of booking
    // the same slot twice — whichever string format the start arrived in.
    const digest = createHash('sha256')
      .update(`${userId}|${courseId}|${startMs}`)
      .digest('hex')
      .slice(0, 32);
    const enrollmentId = `enr_seat_${digest}`;
    const orderId = `seat_${digest}`;
    const createdAt = new Date().toISOString();
    const email = String(request.session.email || '').trim();

    const enrollment: EnrollmentRecord & { licenseId: string } = stripEmptyIndexKeys({
      id: enrollmentId,
      name: String(email || userId),
      email,
      userId,
      courseId,
      courseTitle: course.title,
      startTime,
      endTime,
      orderId,
      orgId: license.orgId,
      licenseId: license.id,
      status: 'ACTIVE' as const,
      sourceType: 'B2B_SEAT' as const,
      paymentProvider: 'b2b_seat',
      createdAt,
      updatedAt: createdAt,
    });

    const order = {
      orderId,
      orderNumber: `${userId}-${createdAt}`,
      userId,
      courseId,
      courseTitle: course.title,
      durationMinutes: course.durationMinutes,
      totalSessions: course.totalSessions,
      remainingSessions: course.totalSessions,
      remainingSeconds: course.durationMinutes * 60,
      enrollmentId,
      amount: 0,
      currency: 'TWD',
      paymentMethod: 'b2b_seat',
      pointsUsed: 0,
      status: 'PAID',
      startTime,
      endTime,
      orgId: license.orgId,
      licenseId: license.id,
      createdAt,
      updatedAt: createdAt,
    };

    try {
      await ddbDocClient.send(new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: ENROLLMENTS_TABLE,
              Item: enrollment,
              ConditionExpression: 'attribute_not_exists(id)',
            },
          },
          {
            Put: {
              TableName: ORDERS_TABLE,
              Item: order,
              ConditionExpression: 'attribute_not_exists(orderId)',
            },
          },
        ],
      }));
    } catch (txErr) {
      const tx = txErr as { name?: string; CancellationReasons?: Array<{ Code?: string }> };
      if (tx?.name === 'TransactionCanceledException') {
        const reasons = tx.CancellationReasons || [];
        if (reasons.some((r) => r?.Code === 'ConditionalCheckFailed')) {
          return NextResponse.json(
            { ok: false, error: '您已報名此課程的這個時段。' },
            { status: 409 },
          );
        }
      }
      throw txErr;
    }

    console.log(
      `[enroll/seat] created seat enrollment ${enrollmentId} order=${orderId} user=${userId} ` +
        `course=${courseId} org=${license.orgId} license=${license.id}`
    );

    // Trigger Workflow (non-blocking), same as POST /api/enroll
    import('@/lib/workflowEngine').then(({ triggerWorkflow }) => {
      triggerWorkflow('trigger_enrollment', enrollment);
    }).catch(err => console.error('[enroll/seat] Workflow trigger failed:', err));

    return NextResponse.json({ ok: true, order, enrollment }, { status: 201 });
  } catch (err) {
    console.error('[enroll/seat] POST error:', (err as Error)?.message || err, (err as Error)?.stack);
    return NextResponse.json({ ok: false, error: '伺服器錯誤。' }, { status: 500 });
  }
});

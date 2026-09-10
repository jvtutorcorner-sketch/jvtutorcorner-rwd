// app/api/enroll/route.ts
//
// Enrollment lifecycle.
//
// ── What changed and why ──────────────────────────────────────────────────────
// Every handler in this file was previously unauthenticated:
//
//   POST   read `userId` from an optional session but never required one, so an
//          anonymous caller could create enrollments with any name/email.
//   PATCH  accepted { id, status } from anyone. Setting status to 'ACTIVE' is
//          what grants course access, so this was a complete payment bypass —
//          and it also fired the 3-hour reminder side effect on demand.
//   GET    returned a Scan of the table (names, emails, user ids, course ids)
//          to any caller.
//   DELETE removed any enrollment by id.
//
// Enrollment rows also carried no `orderId` (so a granted seat could not be tied
// back to the payment that bought it) and never populated `orgId` (so a B2B seat
// was indistinguishable from a personal purchase).
//
// Now: a session is required to enroll; the identity on the row comes from the
// session, not the body; orgId is never taken from the body (and a purchase is
// not stamped with the buyer's organisation — see POST); orderId is recorded; and reads go through the byUserId / byCourseId / byOrgId
// GSIs (lib/enrollmentService.ts) instead of scanning.
//
// Status transitions that grant access ('PAID', 'ACTIVE') are restricted to the
// payment authority — an admin session or an HMAC-signed internal call. The
// enrollment's owner may only cancel their own row.

import { NextResponse } from 'next/server';
import { PutCommand, GetCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { generateHmacHeaders } from '@/lib/auth/hmac';
import { withAuth, withAnyAuth, withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import { getProfileById } from '@/lib/profilesService';
import {
  ENROLLMENTS_TABLE as TABLE_NAME,
  listEnrollmentsByUser,
  listEnrollmentsByCourse,
  listEnrollmentsByOrg,
  stripEmptyIndexKeys,
  type EnrollmentRecord,
  type EnrollmentStatus,
} from '@/lib/enrollmentService';

export const runtime = 'nodejs';

// Re-exported for the existing importers of these types.
export type { EnrollmentRecord, EnrollmentStatus };

/** Statuses only the payment authority may set. */
const PRIVILEGED_STATUSES: EnrollmentStatus[] = ['PAID', 'ACTIVE'];

/** Statuses the enrollment's own holder may set. */
const OWNER_SETTABLE_STATUSES: EnrollmentStatus[] = ['CANCELLED'];

const ALL_STATUSES: EnrollmentStatus[] = [
  'PENDING_PAYMENT',
  'PAID',
  'ACTIVE',
  'CANCELLED',
  'FAILED',
];

function generateId() {
  return `enr_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function isPrivileged(session: AuthedRequest['session']): boolean {
  return session.role === 'admin' || session.role === 'system';
}

function requireTable() {
  if (!TABLE_NAME) throw new Error('ENROLLMENTS_TABLE 未設定，無法存取報名資料庫。');
}

// ──────────────────────────────────────────────────────────────────────────────
// POST — create an enrollment
// ──────────────────────────────────────────────────────────────────────────────
export const POST = withAuth(async (request: AuthedRequest) => {
  try {
    const body = await request.json();
    const { name, courseId, courseTitle, startTime, endTime, orderId, courseSessionId } = body || {};

    if (!courseId || !courseTitle) {
      return NextResponse.json(
        { ok: false, error: '缺少必要欄位（courseId, courseTitle）。' },
        { status: 400 },
      );
    }

    // Identity comes from the session. An admin may enroll someone else by
    // passing userId; nobody else can.
    const requestedUserId = body?.userId;
    const userId = isPrivileged(request.session)
      ? String(requestedUserId || request.session.userId)
      : request.session.userId;

    if (!isPrivileged(request.session) && requestedUserId && requestedUserId !== userId) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: cannot enroll another user' },
        { status: 403 },
      );
    }

    // Email likewise: the session's email is authoritative for a self-enrollment.
    const email = isPrivileged(request.session)
      ? String(body?.email || request.session.email || '').trim()
      : String(request.session.email || '').trim();

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { ok: false, error: 'Email 格式不正確。' },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    // This handler only opens a PENDING_PAYMENT row for a purchase, which is a B2C
    // transaction whoever the buyer is. It is NOT stamped with the buyer's orgId:
    // EnrollmentRecord.orgId means "a seat consumed under this organisation's
    // contract", and tagging a member's personal purchase with it both mislabelled
    // it as B2B_SEAT and exposed it to their employer's org admins via ?orgId=.
    // Seat-based access is decided by licenses in lib/accessControl.ts.
    //
    // Optional GSI key attributes (orderId / orgId / courseSessionId) are omitted
    // rather than written as null — see stripEmptyIndexKeys.
    const item: EnrollmentRecord = stripEmptyIndexKeys({
      id: generateId(),
      name: String(name || request.session.email || '').trim(),
      email,
      userId,
      courseId: String(courseId),
      courseTitle: String(courseTitle),
      startTime: startTime ? String(startTime) : undefined,
      endTime: endTime ? String(endTime) : undefined,
      // Link back to the payment. Absent when the enrollment is opened before an
      // order exists; app/api/orders writes the order side of the pair.
      orderId: orderId ? String(orderId) : undefined,
      courseSessionId: courseSessionId ? String(courseSessionId) : undefined,
      status: 'PENDING_PAYMENT',
      sourceType: 'B2C',
      createdAt: now,
      updatedAt: now,
    });

    requireTable();
    await ddbDocClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    console.log(
      `[enroll API] created enrollment ${item.id} user=${userId} course=${courseId} order=${item.orderId ?? 'none'}`
    );

    // Trigger Workflow (non-blocking)
    import('@/lib/workflowEngine').then(({ triggerWorkflow }) => {
      triggerWorkflow('trigger_enrollment', item);
    }).catch(err => console.error('[enroll API] Workflow trigger failed:', err));

    return NextResponse.json({ ok: true, enrollment: item }, { status: 200 });
  } catch (err: any) {
    console.error('[enroll API] 處理報名請求時發生錯誤:', err?.message || err, err?.stack);
    return NextResponse.json({ ok: false, error: '伺服器錯誤。' }, { status: 500 });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PATCH — advance an enrollment's status
//
// withAnyAuth: a user session, or an HMAC-signed internal call from the order
// routes (app/api/orders/[orderId]/route.ts) which run server-to-server.
// ──────────────────────────────────────────────────────────────────────────────
export const PATCH = withAnyAuth('/api/enroll', async (request: AuthedRequest) => {
  try {
    const body = await request.json();
    const { id, status, paymentProvider, paymentSessionId } = body || {};

    if (!id || !status) {
      return NextResponse.json({ ok: false, error: '需要 id 與 status' }, { status: 400 });
    }

    if (!ALL_STATUSES.includes(status as EnrollmentStatus)) {
      return NextResponse.json(
        { ok: false, error: `status 必須是 ${ALL_STATUSES.join(' / ')} 之一` },
        { status: 400 },
      );
    }

    requireTable();

    const getRes = await ddbDocClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { id } })
    );

    const existing = getRes.Item as EnrollmentRecord | undefined;
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Enrollment not found' }, { status: 404 });
    }

    const privileged = isPrivileged(request.session);
    const isOwner =
      existing.userId === request.session.userId ||
      (!!existing.email &&
        !!request.session.email &&
        existing.email.toLowerCase() === request.session.email.toLowerCase());

    if (!privileged && !isOwner) {
      return NextResponse.json({ ok: false, error: 'Enrollment not found' }, { status: 404 });
    }

    // Granting access is the payment authority's call, not the buyer's. Without
    // this an authenticated student could PATCH their own PENDING_PAYMENT row
    // straight to ACTIVE and take the course without paying.
    if (!privileged && PRIVILEGED_STATUSES.includes(status as EnrollmentStatus)) {
      return NextResponse.json(
        { ok: false, error: `Forbidden: status "${status}" is set by the payment flow` },
        { status: 403 },
      );
    }

    if (!privileged && !OWNER_SETTABLE_STATUSES.includes(status as EnrollmentStatus)) {
      return NextResponse.json(
        { ok: false, error: `Forbidden: you may only set ${OWNER_SETTABLE_STATUSES.join(' / ')}` },
        { status: 403 },
      );
    }

    const updatedAt = new Date().toISOString();

    // stripEmptyIndexKeys: rows written before the null-key fix carry orgId/orderId
    // as NULL; re-putting them verbatim would be rejected once byOrgId/byOrderId exist.
    const item: EnrollmentRecord = stripEmptyIndexKeys({
      ...existing,
      id, // 確保 ID 不變
      status,
      paymentProvider: paymentProvider || existing.paymentProvider,
      paymentSessionId: paymentSessionId || existing.paymentSessionId,
      updatedAt,
    });

    await ddbDocClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

    // ── Create Reminder Logic ──────────────────────────────────────────
    // When enrollment becomes ACTIVE, create a 3-hour reminder (180 mins)
    if (status === 'ACTIVE' && item.startTime) {
      try {
        const protocol = request.headers.get('x-forwarded-proto') || 'http';
        const host = request.headers.get('host') || 'localhost:3000';
        const base = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;

        const reminderBody = JSON.stringify({
          userId: item.userId || item.email,
          eventId: `enroll_${item.id}`,
          courseId: item.courseId,
          eventStartTime: item.startTime,
          reminderMinutes: 180, // 3 hours before
        });
        // /api/calendar/reminders 需要 session 或 HMAC 驗證，這裡是 server-to-server
        // 呼叫，用 HMAC 簽名證明是內部服務（避免只靠 client 可偽造的 userId 建立提醒）。
        await fetch(`${base}/api/calendar/reminders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...generateHmacHeaders('POST', '/api/calendar/reminders', reminderBody),
          },
          body: reminderBody,
        });
        console.log(`[enroll API] Created 3h reminder for userId=${item.userId || item.email} on course ${item.courseId}`);
      } catch (remErr) {
        console.error('[enroll API] Failed to create 3h reminder:', remErr);
      }
    }
    // ───────────────────────────────────────────────────────────────────

    return NextResponse.json({ ok: true, enrollment: item }, { status: 200 });
  } catch (err: any) {
    console.error('[enroll API] PATCH 發生錯誤:', err?.message || err, err?.stack);
    return NextResponse.json({ ok: false, error: '伺服器錯誤。' }, { status: 500 });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET — list enrollments
//
// Scoped by identity, and served from a GSI Query rather than a Scan. A plain
// student gets their own rows; an org admin may ask for their organisation's;
// a site admin may ask for a course roster or the whole table.
// ──────────────────────────────────────────────────────────────────────────────
export const GET = withAuth(async (request: AuthedRequest) => {
  try {
    requireTable();

    const url = new URL(request.url);
    const courseId = url.searchParams.get('courseId');
    const orgIdParam = url.searchParams.get('orgId');
    const privileged = isPrivileged(request.session);

    let items: EnrollmentRecord[];
    let source: string;

    if (courseId) {
      // A course roster names other students, so it is for the site admin and the
      // course's own teacher. Teacher ownership is checked by the caller-facing
      // course routes; here we require admin.
      if (!privileged) {
        return NextResponse.json(
          { ok: false, error: 'Forbidden: course rosters are admin-only' },
          { status: 403 },
        );
      }
      items = await listEnrollmentsByCourse(courseId);
      source = 'byCourseId';
    } else if (orgIdParam) {
      const callerProfile = await getProfileById(request.session.userId);
      const callerOrgId = (callerProfile as any)?.orgId || null;
      const isOrgAdmin = Boolean((callerProfile as any)?.isOrgAdmin);

      if (!privileged && !(isOrgAdmin && callerOrgId === orgIdParam)) {
        return NextResponse.json(
          { ok: false, error: 'Forbidden: not an admin of that organisation' },
          { status: 403 },
        );
      }
      items = await listEnrollmentsByOrg(orgIdParam);
      source = 'byOrgId';
    } else if (privileged && url.searchParams.get('all') === 'true') {
      // The only remaining Scan, and it is explicitly opted into by an admin.
      const res = await ddbDocClient.send(
        new ScanCommand({ TableName: TABLE_NAME, Limit: 200 })
      );
      items = (res.Items || []) as EnrollmentRecord[];
      source = 'scan';
    } else {
      items = await listEnrollmentsByUser(request.session.userId);
      source = 'byUserId';
    }

    return NextResponse.json(
      { ok: true, total: items.length, data: items, source },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[enroll API] 讀取報名資料時發生錯誤:', err?.message || err, err?.stack);
    return NextResponse.json({ ok: false, error: '伺服器錯誤。' }, { status: 500 });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE — hard-remove an enrollment (admin only)
//
// Cancelling is a status change (PATCH -> 'CANCELLED') and keeps the audit trail;
// deletion destroys the record that ties a payment to what it bought, so it stays
// an administrative operation.
// ──────────────────────────────────────────────────────────────────────────────
export const DELETE = withAdmin(async (request: AuthedRequest) => {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ ok: false, error: '需要 id' }, { status: 400 });
    }

    requireTable();
    await ddbDocClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { id } }));

    return NextResponse.json({ ok: true, message: 'Deleted' });
  } catch (err: any) {
    console.error('[enroll API] DELETE 發生錯誤:', err?.message || err);
    return NextResponse.json({ ok: false, error: '伺服器錯誤。' }, { status: 500 });
  }
});

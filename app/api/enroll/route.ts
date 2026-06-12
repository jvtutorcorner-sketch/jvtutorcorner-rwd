// app/api/enroll/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PutCommand, ScanCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { getSession, extractTokenFromRequest } from '@/lib/auth/sessionManager';
import { ddbDocClient } from '@/lib/dynamo';

export const runtime = 'nodejs';

export type EnrollmentStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'ACTIVE'
  | 'CANCELLED'
  | 'FAILED';

export type EnrollmentRecord = {
  id: string;
  name: string;
  email: string;
  userId?: string;
  courseId: string;
  courseTitle: string;
  status: EnrollmentStatus;
  createdAt: string;
  updatedAt: string;
  paymentProvider?: string;
  paymentSessionId?: string;
  startTime?: string;
  endTime?: string;
  orgId?: string;
  sourceType?: 'B2C' | 'B2B_SEAT' | 'ADMIN_OVERRIDE';
};

const TABLE_NAME = process.env.ENROLLMENTS_TABLE || process.env.DYNAMODB_TABLE_ENROLLMENTS || 'jvtutorcorner-enrollments';

if (!TABLE_NAME) {
  console.error('[enroll API] ❌ ENROLLMENTS_TABLE 環境變數未設定！');
} else {
  console.log(`[enroll API] 使用 DynamoDB Table: ${TABLE_NAME}`);
}

function generateId() {
  return `enr_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function requireTable() {
  if (!TABLE_NAME) throw new Error('ENROLLMENTS_TABLE 未設定，無法存取報名資料庫。');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, courseId, courseTitle, startTime, endTime } = body || {};

    // Resolve userId from session (undefined for unauthenticated enrollments)
    const sessionToken = extractTokenFromRequest(request as any);
    const session = sessionToken ? await getSession(sessionToken) : null;
    const resolvedUserId = session?.userId;

    if (!name || !email || !courseId || !courseTitle) {
      return NextResponse.json(
        { ok: false, error: '缺少必要欄位（name, email, courseId, courseTitle）。' },
        { status: 400 },
      );
    }

    if (typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { ok: false, error: 'Email 格式不正確。' },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    const item: EnrollmentRecord = {
      id: generateId(),
      name: String(name).trim(),
      email: String(email).trim(),
      userId: resolvedUserId,
      courseId: String(courseId),
      courseTitle: String(courseTitle),
      startTime: startTime ? String(startTime) : undefined,
      endTime: endTime ? String(endTime) : undefined,
      status: 'PENDING_PAYMENT',
      sourceType: 'B2C', // Default to B2C purchase
      createdAt: now,
      updatedAt: now,
    };

    requireTable();
    await ddbDocClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    console.log('[enroll API] DynamoDB 已寫入報名資料:', item);

    // Trigger Workflow (non-blocking)
    import('@/lib/workflowEngine').then(({ triggerWorkflow }) => {
        triggerWorkflow('trigger_enrollment', item);
    }).catch(err => console.error('[enroll API] Workflow trigger failed:', err));

    return NextResponse.json(
      {
        ok: true,
        enrollment: item,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[enroll API] 處理報名請求時發生錯誤:', err?.message || err, err?.stack);
    return NextResponse.json(
      { ok: false, error: '伺服器錯誤。' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, paymentProvider, paymentSessionId } = body || {};

    if (!id || !status) {
      return NextResponse.json({ ok: false, error: '需要 id 與 status' }, { status: 400 });
    }

    requireTable();

    // 💡 重要：獲取現有資料以進行合併，避免覆寫掉其他欄位 (如 startTime)
    const getRes = await ddbDocClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { id } })
    );

    const existing = getRes.Item || {};
    const updatedAt = new Date().toISOString();

    const item: EnrollmentRecord = {
      ...existing as EnrollmentRecord,
      id, // 確保 ID 不變
      status,
      paymentProvider: paymentProvider || existing.paymentProvider,
      paymentSessionId: paymentSessionId || existing.paymentSessionId,
      updatedAt,
    };

    await ddbDocClient.send(
      new PutCommand({ TableName: TABLE_NAME, Item: item }),
    );

    // ── Create Reminder Logic ──────────────────────────────────────────
    // When enrollment becomes ACTIVE, create a 3-hour reminder (180 mins)
    if (status === 'ACTIVE' && item.startTime) {
      try {
        const protocol = request.headers.get('x-forwarded-proto') || 'http';
        const host = request.headers.get('host') || 'localhost:3000';
        const base = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;
        
        await fetch(`${base}/api/calendar/reminders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: item.userId || item.email,
            eventId: `enroll_${item.id}`,
            courseId: item.courseId,
            eventStartTime: item.startTime,
            reminderMinutes: 180, // 3 hours before
          }),
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
}

export async function GET() {
  try {
    requireTable();

    const res = await ddbDocClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        Limit: 50,
      }),
    );

    const items = (res.Items || []) as EnrollmentRecord[];

    return NextResponse.json(
      {
        ok: true,
        total: items.length,
        data: items,
        source: 'dynamodb',
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[enroll API] 讀取報名資料時發生錯誤:', err?.message || err, err?.stack);
    return NextResponse.json(
      { ok: false, error: '伺服器錯誤。' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
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
}

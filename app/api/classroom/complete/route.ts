import { NextResponse } from 'next/server';
import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { verifyClassroomAccess } from '@/lib/auth/classroomAccess';
import { getEscrowByOrder, releaseEscrow } from '@/lib/pointsEscrow';
import { writeAuditLog } from '@/lib/auditLogService';
import { decideCompletion, parseOrderTime, COMPLETION_EARLY_WINDOW_MS, type CompletionOrder } from '@/lib/classroomCompletion';

const ORDERS_TABLE = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';

/**
 * 老師沒有帶 orderId 進教室時（例如從 /teacher_courses 以外的入口），找出這堂課
 * 目前時段內的訂單。orders 沒有 courseId 索引，只能 Scan；MVP 規模可接受。
 */
async function findCurrentOrderForCourse(courseId: string, now: number): Promise<CompletionOrder | null> {
  const candidates: Array<Record<string, unknown>> = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddbDocClient.send(new ScanCommand({
      TableName: ORDERS_TABLE,
      FilterExpression: 'courseId = :c',
      ExpressionAttributeValues: { ':c': courseId },
      ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
    }));
    candidates.push(...(res.Items || []));
    exclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  const inWindow = candidates.filter((o) => {
    const status = String(o.status || '').toUpperCase();
    if (status !== 'PAID' && status !== 'ACTIVE') return false;
    const start = parseOrderTime(typeof o.startTime === 'string' ? o.startTime : null);
    const end = parseOrderTime(typeof o.endTime === 'string' ? o.endTime : null);
    if (start === null) return false;
    const endBound = end ?? start;
    // 開課前 10 分鐘到結束後 2 小時內都算這個時段（老師可能晚一點才按結束）。
    return now >= start - COMPLETION_EARLY_WINDOW_MS && now <= endBound + 2 * 60 * 60 * 1000;
  });
  if (inWindow.length !== 1) return null;
  return inWindow[0] as unknown as CompletionOrder;
}

/**
 * POST /api/classroom/complete
 *
 * 老師（或管理員）結束課程時呼叫：把這筆訂單的暫存點數撥給老師。
 * Body: { courseId: string, orderId?: string }
 *
 * 冪等：已 RELEASED 回 ok；releaseEscrow 本身以條件交易保證只撥一次。
 */
async function handlePost(req: AuthedRequest) {
  let body: { courseId?: unknown; orderId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const courseId = typeof body?.courseId === 'string' ? body.courseId.trim() : '';
  const orderIdInput = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  if (!courseId) {
    return NextResponse.json({ ok: false, error: 'courseId is required' }, { status: 400 });
  }

  const access = await verifyClassroomAccess(req.session, courseId);
  if (!access.granted || !access.isHost) {
    return NextResponse.json({ ok: false, error: 'Only the course teacher can complete the class' }, { status: 403 });
  }

  const now = Date.now();
  try {
    let order: CompletionOrder | null = null;
    if (orderIdInput) {
      const res = await ddbDocClient.send(new GetCommand({ TableName: ORDERS_TABLE, Key: { orderId: orderIdInput } }));
      order = (res.Item as CompletionOrder) || null;
    } else {
      order = await findCurrentOrderForCourse(courseId, now);
      if (!order) {
        return NextResponse.json({ ok: false, error: 'No unique active order in the current time slot; pass orderId' }, { status: 404 });
      }
    }

    const escrow = order ? await getEscrowByOrder(order.orderId) : null;
    const decision = decideCompletion({ courseId, order, escrow, now });

    if (decision.action === 'reject') {
      return NextResponse.json({ ok: false, error: decision.error }, { status: decision.status });
    }
    if (decision.action === 'noop') {
      return NextResponse.json({ ok: true, released: false, reason: decision.reason, orderId: order?.orderId });
    }

    const result = await releaseEscrow(decision.escrowId);
    if (!result.ok) {
      // 與管理員或 LiveKit webhook 同時結算時，另一方可能先撥款：重讀一次判斷是否已完成。
      const latest = await getEscrowByOrder(order!.orderId);
      if (latest?.status === 'RELEASED') {
        return NextResponse.json({ ok: true, released: false, reason: 'ALREADY_RELEASED', orderId: order!.orderId });
      }
      return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    }

    await writeAuditLog({
      actorId: req.session.userId,
      action: 'escrow.release_on_class_complete',
      targetType: 'escrow',
      targetId: decision.escrowId,
      metadata: { courseId, orderId: order!.orderId },
    });

    return NextResponse.json({
      ok: true,
      released: true,
      orderId: order!.orderId,
      escrowId: decision.escrowId,
      teacherNewBalance: result.teacherNewBalance,
    });
  } catch (err) {
    console.error('[classroom/complete] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'Failed to complete class' }, { status: 500 });
  }
}

export const POST = withAuth(handlePost);

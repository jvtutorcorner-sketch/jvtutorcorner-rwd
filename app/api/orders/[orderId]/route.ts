import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getProfileById, putProfile } from '@/lib/profilesService';
import { withAuth, withAnyAuth, AuthedRequest } from '@/lib/auth/apiGuard';
import { writeAuditLog } from '@/lib/auditLogService';
import { generateHmacHeaders } from '@/lib/auth/hmac';
import { canManageCourse } from '@/lib/auth/courseOwnership';
import { COURSES } from '@/data/courses';
import {
  decideOrderPatch,
  isB2bSeatOrder,
  type OrderRecord,
  OPEN_REFUND_STATUSES,
  REFUNDABLE_ORDER_STATUSES,
  UNPAID_ORDER_STATUSES,
} from '@/app/api/admin/refunds/refundPolicy';
import { approveRefund, revokeEnrollment } from '@/app/api/admin/refunds/refundService';

type OrderRouteContext = { params: Promise<{ orderId: string }> };

/** admin/system/teacher 可以看與改別人的訂單；一般使用者只能碰自己的。 */
function isStaffRole(role: string): boolean {
  return role === 'admin' || role === 'system' || role === 'teacher';
}

const ddbRegion = process.env.CI_AWS_REGION || process.env.AWS_REGION;
const ddbExplicitAccessKey = process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const ddbExplicitSecretKey = process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const ddbExplicitSessionToken = process.env.CI_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;
const ddbExplicitCreds = ddbExplicitAccessKey && ddbExplicitSecretKey ? {
  accessKeyId: ddbExplicitAccessKey as string,
  secretAccessKey: ddbExplicitSecretKey as string,
  ...(ddbExplicitSessionToken ? { sessionToken: ddbExplicitSessionToken as string } : {})
} : undefined;

const client = new DynamoDBClient({ region: ddbRegion, credentials: ddbExplicitCreds });
const docClient = DynamoDBDocumentClient.from(client);

async function handleGet(request: AuthedRequest, ctx?: OrderRouteContext) {
  try {
    const { orderId } = await ctx!.params;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId required' }, { status: 400 });
    }

    const TableName = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';

    const res = await docClient.send(
      new GetCommand({ TableName, Key: { orderId } }),
    );

    const item = res.Item || null;
    if (!item) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 這支端點會回傳買家姓名、Email 與完整付款紀錄。先前沒有任何驗證，
    // 只要猜到 orderId 就能讀出別人的訂單。
    const { role, userId: sessionUserId } = request.session;
    if (!isStaffRole(role) && item.userId !== sessionUserId) {
      return NextResponse.json({ ok: false, error: 'Forbidden: not the order owner' }, { status: 403 });
    }

    // Resolve Names
    const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';
    const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

    let userName = item.userId;
    let courseTitle = item.courseId;

    try {
      if (item.userId) {
        const uRes = await docClient.send(new GetCommand({ TableName: PROFILES_TABLE, Key: { id: item.userId } }));
        if (uRes.Item) {
          userName = uRes.Item.fullName || `${uRes.Item.firstName || ''} ${uRes.Item.lastName || ''}`.trim() || uRes.Item.email || item.userId;
        }
      }
      if (item.courseId) {
        const cRes = await docClient.send(new GetCommand({ TableName: COURSES_TABLE, Key: { id: item.courseId } }));
        if (cRes.Item) {
          courseTitle = cRes.Item.title || item.courseId;
        }
      }
    } catch (e) {
      console.warn('Name resolution failed for orderId:', orderId, e);
    }

    return NextResponse.json({ ok: true, order: { ...item, userName, courseTitle } }, { status: 200 });
  } catch (err) {
    console.error('orders/[orderId] GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export const GET = withAuth(handleGet);

/**
 * 退款申請/退課風險控管（Risk Control）：24 小時內第 2 次警告、第 3 次鎖定 24 小時。
 * 只套用在「使用者自己」送出的退款申請與取消；管理員核准退款不會累加使用者的計數。
 */
async function applyRefundRiskControl(
  userId: string | undefined
): Promise<{ blocked: NextResponse } | { blocked: null; warning: string | null }> {
  if (!userId) return { blocked: null, warning: null };
  const profile = await getProfileById(userId);
  if (!profile) return { blocked: null, warning: null };

  const currentTime = new Date();

  // 1. 檢查是否已被鎖定 (Check if locked)
  if (profile.refundLockoutUntil && new Date(profile.refundLockoutUntil) > currentTime) {
    return {
      blocked: NextResponse.json({
        ok: false,
        error: '偵測到異常行為：您的退款/退課功能已被暫時鎖定，請於 24 小時後再試。'
      }, { status: 403 }),
    };
  }

  // 2. 檢查 24 小時內的連續次數 (Check consecutive count within 24h)
  const lastRefundAt = profile.lastRefundAt ? new Date(profile.lastRefundAt) : null;
  const oneDayMs = 24 * 60 * 60 * 1000;
  const isWithin24h = lastRefundAt && (currentTime.getTime() - lastRefundAt.getTime() < oneDayMs);

  const counter = isWithin24h ? (profile.refundCounter || 0) + 1 : 1;

  // 3. 處理第 3 次：鎖定並攔截 (3rd time: Lock and intercept)
  if (counter >= 3) {
    const lockoutUntil = new Date(currentTime.getTime() + oneDayMs).toISOString();
    await putProfile({
      ...profile,
      refundCounter: counter,
      lastRefundAt: currentTime.toISOString(),
      refundLockoutUntil: lockoutUntil
    });
    return {
      blocked: NextResponse.json({
        ok: false,
        error: '系統防範異常：24小時內連續退課達3次，您的退款功能已鎖定 24 小時。'
      }, { status: 403 }),
    };
  }

  // 4. 記錄本次行為 (Record this action)
  await putProfile({
    ...profile,
    refundCounter: counter,
    lastRefundAt: currentTime.toISOString()
  });

  // 5. 處理第 2 次：加入警告 (2nd time: Add warning)
  return {
    blocked: null,
    warning: counter === 2 ? '因短時間取消課程連續2次，系統防範異常發生第3次將會鎖定您的退款功能24小時' : null,
  };
}

/** 呼叫者是不是這筆訂單所屬課程的老師（課程 DB 找不到時退回靜態 COURSES）。 */
async function isCourseTeacherOfOrder(session: AuthedRequest['session'], order: OrderRecord): Promise<boolean> {
  if (!order?.courseId) return false;
  let course: { teacherId?: string | null } | null = null;
  try {
    const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
    const res = await docClient.send(new GetCommand({ TableName: COURSES_TABLE, Key: { id: order.courseId } }));
    if (res.Item) course = { teacherId: res.Item.teacherId || res.Item.teacherEmail || null };
  } catch (e) {
    console.warn('[orders PATCH] course lookup failed:', e instanceof Error ? e.message : e);
  }
  if (!course) {
    const staticCourse = COURSES.find((c) => c.id === order.courseId) as { teacherId?: string; teacherEmail?: string } | undefined;
    if (staticCourse) course = { teacherId: staticCourse.teacherId || staticCourse.teacherEmail || null };
  }
  return canManageCourse(session, course);
}

function isConditionalFail(err: unknown): boolean {
  return (err as { name?: string })?.name === 'ConditionalCheckFailedException';
}

async function handlePatch(request: AuthedRequest, ctx?: OrderRouteContext) {
  try {
    const { orderId } = await ctx!.params;
    const body = await request.json().catch(() => null);

    if (!orderId) {
      return NextResponse.json({ error: 'orderId required' }, { status: 400 });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'JSON object body required' }, { status: 400 });
    }

    const TableName = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';

    // get existing
    const existingRes = await docClient.send(
      new GetCommand({ TableName, Key: { orderId } }),
    );

    if (!existingRes.Item) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const existingItem = existingRes.Item;

    // 授權：這支端點可以把訂單標記成 PAID、扣課堂數、觸發退點與退課。
    // 先前一般使用者可以直接把自己的訂單設成 REFUNDED（自助退點）、附加任意 payment 紀錄，
    // 老師則可以改任何人的訂單狀態。現在由 decideOrderPatch（純函式，見
    // app/api/admin/refunds/refundPolicy.ts）統一判斷：
    //   - admin/system（system = 金流 webhook 的 HMAC 內部呼叫）：可標記 PAID 等狀態；
    //     REFUNDED 一律走 approveRefund（資產反轉 + 冪等）
    //   - 訂單擁有者：只能申請退款（refundStatus=REQUESTED）、取消未付款訂單、同步剩餘秒數
    //   - 課程老師：只能更新 remainingSeconds / 扣堂數
    const { role, userId: sessionUserId } = request.session;
    const decision = decideOrderPatch({ role, sessionUserId, order: existingItem, body });
    if (!decision.ok) {
      return NextResponse.json({ ok: false, error: decision.error }, { status: decision.httpStatus });
    }

    const now = new Date().toISOString();

    // ── admin/system 退款：交給 refundService ──
    if (decision.mode === 'refund') {
      const result = await approveRefund({
        request,
        orderId,
        actorId: sessionUserId,
        note: typeof body.note === 'string' ? body.note : ((body.payment as { note?: unknown } | undefined)?.note as string | undefined) ?? null,
        manualGatewayRefundRef: typeof body.manualGatewayRefundRef === 'string' ? body.manualGatewayRefundRef : null,
        payment: body.payment,
      });
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error, outcome: 'outcome' in result ? result.outcome : undefined, order: result.order },
          { status: result.httpStatus }
        );
      }
      return NextResponse.json({ ok: true, outcome: result.outcome, order: result.order }, { status: 200 });
    }

    // ── 訂單擁有者：申請退款（不動 status、不動資產）或取消未付款訂單 ──
    if (decision.mode === 'request_refund' || decision.mode === 'cancel_unpaid') {
      const risk = await applyRefundRiskControl(existingItem.userId);
      if (risk.blocked) return risk.blocked;

      const isRequest = decision.mode === 'request_refund';
      const values: Record<string, unknown> = { ':now': now };
      const setParts = ['updatedAt = :now'];
      let condition: string;

      if (isRequest) {
        setParts.push('refundStatus = :requested', 'refundReason = :reason', 'refundRequestedAt = :now', 'refundRequestedBy = :uid');
        values[':requested'] = 'REQUESTED';
        values[':reason'] = decision.reason;
        values[':uid'] = sessionUserId;
        const paidKeys = REFUNDABLE_ORDER_STATUSES.map((s, i) => { values[`:paid${i}`] = s; return `:paid${i}`; });
        const openKeys = OPEN_REFUND_STATUSES.map((s, i) => { values[`:open${i}`] = s; return `:open${i}`; });
        condition = `#status IN (${paidKeys.join(', ')}) AND (attribute_not_exists(refundStatus) OR NOT refundStatus IN (${openKeys.join(', ')}))`;
      } else {
        setParts.push('#status = :cancelled', 'orderNumber = :orderNumber');
        values[':cancelled'] = 'CANCELLED';
        values[':orderNumber'] = `${existingItem.userId || 'unknown'}-${now}`;
        const unpaidKeys = UNPAID_ORDER_STATUSES.map((s, i) => { values[`:unpaid${i}`] = s; return `:unpaid${i}`; });
        condition = `#status IN (${unpaidKeys.join(', ')})`;
      }
      if (risk.warning) {
        setParts.push('riskWarning = :warning');
        values[':warning'] = risk.warning;
      }

      try {
        const res = await docClient.send(new UpdateCommand({
          TableName,
          Key: { orderId },
          UpdateExpression: `SET ${setParts.join(', ')}`,
          ConditionExpression: condition,
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: values,
          ReturnValues: 'ALL_NEW',
        }));
        await writeAuditLog({
          actorId: sessionUserId,
          action: isRequest ? 'order.refund.request' : 'order.cancel',
          targetType: 'order',
          targetId: orderId,
          metadata: isRequest ? { reason: decision.reason } : { previousStatus: existingItem.status },
        });
        return NextResponse.json({ ok: true, order: res.Attributes }, { status: 200 });
      } catch (err) {
        if (isConditionalFail(err)) {
          return NextResponse.json({ ok: false, error: '訂單狀態已變更，請重新整理後再試' }, { status: 409 });
        }
        throw err;
      }
    }

    // ── 課程時間進度：擁有者同步剩餘秒數；課程老師可同步秒數並扣堂數 ──
    if (decision.mode === 'timer') {
      if (decision.requiresCourseTeacher && !(await isCourseTeacherOfOrder(request.session, existingItem))) {
        return NextResponse.json(
          { ok: false, error: 'Forbidden: not the order owner or the course teacher' },
          { status: 403 }
        );
      }
      const setParts = ['updatedAt = :now'];
      const values: Record<string, unknown> = { ':now': now };
      if (decision.deduct) {
        const rSessions = typeof existingItem.remainingSessions === 'number' ? existingItem.remainingSessions : existingItem.totalSessions || 0;
        setParts.push('remainingSessions = :rs');
        values[':rs'] = Math.max(0, rSessions - 1);
      }
      if (typeof decision.remainingSeconds === 'number') {
        setParts.push('remainingSeconds = :secs');
        values[':secs'] = decision.remainingSeconds;
      }
      const res = await docClient.send(new UpdateCommand({
        TableName,
        Key: { orderId },
        UpdateExpression: `SET ${setParts.join(', ')}`,
        ConditionExpression: 'attribute_exists(orderId)',
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }));
      return NextResponse.json({ ok: true, order: res.Attributes }, { status: 200 });
    }

    // ── admin/system：沿用整筆更新 ──
    const { action, status, payments, payment, remainingSeconds } = body as OrderRecord;

    // merge payments for Dynamo: append incoming payments/payment
    const existingPayments = Array.isArray(existingItem.payments) ? existingItem.payments.slice() : [];
    if (Array.isArray(payments)) existingPayments.push(...payments);
    if (payment) existingPayments.push(payment);

    const updated: OrderRecord = { ...existingItem, updatedAt: now, payments: existingPayments };
    if (status) {
      updated.status = status;
      updated.orderNumber = `${existingItem.userId || 'unknown'}-${now}`;
    }

    if (action === 'deduct') {
      const rSessions = typeof existingItem.remainingSessions === 'number' ? existingItem.remainingSessions : existingItem.totalSessions || 0;

      updated.remainingSessions = Math.max(0, rSessions - 1);
    }

    if (typeof remainingSeconds === 'number') {
      updated.remainingSeconds = Math.max(0, remainingSeconds);
    }

    // 條件寫入：退款流程（refundService）可能同時把訂單改成 REFUNDED，整筆覆寫不能把它蓋回去。
    try {
      await docClient.send(new PutCommand({
        TableName,
        Item: updated,
        ConditionExpression: 'attribute_not_exists(#status) OR #status <> :refunded',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':refunded': 'REFUNDED' },
      }));
    } catch (err) {
      if (isConditionalFail(err)) {
        return NextResponse.json({ ok: false, error: 'Order is already REFUNDED; it can no longer change' }, { status: 409 });
      }
      throw err;
    }


    // 如果訂單關聯 enrollmentId，且狀態為 PAID，則嘗試更新 enrollment（先 PAID 再 ACTIVE）
    if (updated.enrollmentId && status === 'PAID') {
      const protocol = request.headers.get('x-forwarded-proto') || 'http';
      const host = request.headers.get('host') || 'localhost:3000';
      const base = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;
      try {
        // 只標記為 PAID。實際的課程激活 (ACTIVE) 和 點數加總 改由 paymentSuccessHandler 統一處理 以確保冪等性
        // /api/enroll 的 PATCH 現在只允許付款權威（admin session 或 HMAC）把狀態
        // 改成 PAID/ACTIVE，所以這個 server-to-server 呼叫必須帶 HMAC 簽章。
        const paidBody = JSON.stringify({ id: updated.enrollmentId, status: 'PAID' });
        await fetch(`${base}/api/enroll`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...generateHmacHeaders('PATCH', '/api/enroll', paidBody),
          },
          body: paidBody,
        });
      } catch (err) {
        console.error('[PAID] Failed to update enrollment:', err);
      }
    }

    // B2B 席次訂單沒有款項或點數可退：管理員取消時只取消報名（由 /api/enroll 處理席次）。
    if (status === 'CANCELLED' && isB2bSeatOrder(existingItem) && existingItem.status !== 'CANCELLED' && updated.enrollmentId) {
      await revokeEnrollment(request, updated.enrollmentId, orderId);
    }

    // 退款（REFUNDED）的資產反轉與撤銷報名已移到 app/api/admin/refunds/refundService.ts 的 approveRefund。

    return NextResponse.json({ ok: true, order: updated }, { status: 200 });
  } catch (err) {
    console.error('orders/[orderId] PATCH error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// withAnyAuth：使用者用 session 改自己的訂單；金流 webhook 用 HMAC 簽名以 system 身分回寫。
export const PATCH = withAnyAuth('/api/orders/[orderId]', handlePatch);

async function handleDelete(request: AuthedRequest, ctx?: OrderRouteContext) {
  try {
    const { orderId } = await ctx!.params;
    if (!orderId) {
      return NextResponse.json({ error: 'orderId required' }, { status: 400 });
    }
    const TableName = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';

    // Only the order's own owner, or an admin/teacher, may delete it — previously this
    // endpoint had no auth check at all and anyone could delete any order by guessing an id.
    const existing = await docClient.send(new GetCommand({ TableName, Key: { orderId } }));
    if (!existing.Item) {
      return NextResponse.json({ ok: true, message: 'Order deleted' });
    }
    const { role, userId: sessionUserId } = request.session;
    const isPrivileged = role === 'admin' || role === 'teacher' || role === 'system';
    if (!isPrivileged && existing.Item.userId !== sessionUserId) {
      return NextResponse.json({ ok: false, error: 'Forbidden: not the order owner' }, { status: 403 });
    }

    await docClient.send(new DeleteCommand({ TableName, Key: { orderId } }));

    await writeAuditLog({
      actorId: sessionUserId,
      action: 'order.delete',
      targetType: 'order',
      targetId: orderId,
    });

    return NextResponse.json({ ok: true, message: 'Order deleted' });
  } catch (err) {
    console.error('orders/[orderId] DELETE error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export const DELETE = withAuth(handleDelete);

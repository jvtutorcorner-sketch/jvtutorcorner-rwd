import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { getUserPoints, setUserPoints } from '@/lib/pointsStorage';
import { refundEscrow } from '@/lib/pointsEscrow';
import { getProfileById, putProfile } from '@/lib/profilesService';
import { withAuth, withAnyAuth, AuthedRequest } from '@/lib/auth/apiGuard';
import { writeAuditLog } from '@/lib/auditLogService';
import { generateHmacHeaders } from '@/lib/auth/hmac';

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

async function handlePatch(request: AuthedRequest, ctx?: OrderRouteContext) {
  try {
    const { orderId } = await ctx!.params;
    const body = await request.json();
    const { action, status, payments, payment, remainingSeconds } = body || {};

    if (!orderId) {
      return NextResponse.json({ error: 'orderId required' }, { status: 400 });
    }

    if (!status && action !== 'deduct' && typeof remainingSeconds !== 'number') {
      return NextResponse.json({ error: 'status, action, or remainingSeconds required' }, { status: 400 });
    }

    const TableName = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';

    // get existing
    const existingRes = await docClient.send(
      new GetCommand({ TableName, Key: { orderId } }),
    );

    if (!existingRes.Item) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 授權：這支端點可以把訂單標記成 PAID、扣課堂數、觸發退點與退課，
    // 先前完全沒有驗證。規則如下：
    //   - 一般使用者只能動自己的訂單
    //   - 只有 admin/system（system = 金流 webhook 的 HMAC 內部呼叫）能標記 PAID，
    //     否則任何登入者都能把自己的訂單改成已付款，等於免費購買
    const { role, userId: sessionUserId } = request.session;
    const isStaff = isStaffRole(role);
    if (!isStaff && existingRes.Item.userId !== sessionUserId) {
      return NextResponse.json({ ok: false, error: 'Forbidden: not the order owner' }, { status: 403 });
    }
    if (status === 'PAID' && role !== 'admin' && role !== 'system') {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: only the payment gateway or an admin can mark an order paid' },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();

    // merge payments for Dynamo: append incoming payments/payment
    const existingItem = existingRes.Item;
    const existingPayments = Array.isArray(existingItem.payments) ? existingItem.payments.slice() : [];
    if (Array.isArray(payments)) existingPayments.push(...payments);
    if (payment) existingPayments.push(payment);

    const updated = { ...existingItem, updatedAt: now, payments: existingPayments } as any;
    if (status) {
      updated.status = status;
      updated.orderNumber = `${existingItem.userId || 'unknown'}-${now}`;

      // --- 退款/退課風險控管 (Risk Control) ---
      if (status === 'REFUNDED' || status === 'CANCELLED') {
        const userId = existingItem.userId;
        if (userId) {
          const profile = await getProfileById(userId);
          if (profile) {
            const currentTime = new Date();
            
            // 1. 檢查是否已被鎖定 (Check if locked)
            if (profile.refundLockoutUntil && new Date(profile.refundLockoutUntil) > currentTime) {
              return NextResponse.json({ 
                ok: false, 
                error: '偵測到異常行為：您的退款/退課功能已被暫時鎖定，請於 24 小時後再試。' 
              }, { status: 403 });
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
              return NextResponse.json({ 
                ok: false, 
                error: '系統防範異常：24小時內連續退課達3次，您的退款功能已鎖定 24 小時。' 
              }, { status: 403 });
            }

            // 4. 記錄本次行為 (Record this action)
            await putProfile({
              ...profile,
              refundCounter: counter,
              lastRefundAt: currentTime.toISOString()
            });

            // 5. 處理第 2 次：加入警告 (2nd time: Add warning)
            if (counter === 2) {
              updated.riskWarning = "因短時間取消課程連續2次，系統防範異常發生第3次將會鎖定您的退款功能24小時";
            }
          }
        }
      }
    }

    if (action === 'deduct') {
      const rSessions = typeof existingItem.remainingSessions === 'number' ? existingItem.remainingSessions : existingItem.totalSessions || 0;

      updated.remainingSessions = Math.max(0, rSessions - 1);
    }

    if (typeof remainingSeconds === 'number') {
      updated.remainingSeconds = Math.max(0, remainingSeconds);
    }

    await docClient.send(new PutCommand({ TableName, Item: updated }));


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

    // 處理退款邏輯 (REFUNDED)
    if (status === 'REFUNDED') {
      const protocol = request.headers.get('x-forwarded-proto') || 'http';
      const host = request.headers.get('host') || 'localhost:3000';
      const base = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;
      
      // 1. 如果是點數支付，退還點數
      if (updated.paymentMethod === 'points' && updated.pointsUsed > 0 && updated.userId) {
        try {
          if (updated.pointsEscrowId) {
            // Points were placed in escrow at order creation (see app/api/orders/route.ts) —
            // refund through the same escrow record so its status moves HOLDING -> REFUNDED.
            // Refunding via setUserPoints directly would leave the escrow stuck in HOLDING,
            // letting a later admin /api/points-escrow refund double-credit the student.
            console.log(`[Refund] Refunding escrow ${updated.pointsEscrowId} for order ${orderId}`);
            const result = await refundEscrow(updated.pointsEscrowId);
            if (!result.ok) {
              console.error(`[Refund] refundEscrow failed for ${updated.pointsEscrowId}:`, result.error);
            }
          } else {
            // Legacy order with no escrow record — fall back to direct point credit.
            console.log(`[Refund] Refunding ${updated.pointsUsed} points to ${updated.userId} for order ${orderId}`);
            const currentPoints = await getUserPoints(updated.userId);
            await setUserPoints(updated.userId, currentPoints + updated.pointsUsed);
          }
        } catch (err) {
          console.error('[Refund] Failed to refund points:', err);
        }
      }

      // 2. 如果有關聯 enrollment，撤銷課程權限
      if (updated.enrollmentId) {
        try {
          console.log(`[Refund] Revoking enrollment ${updated.enrollmentId} due to refund`);
          const cancelBody = JSON.stringify({ id: updated.enrollmentId, status: 'CANCELLED' });
          await fetch(`${base}/api/enroll`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...generateHmacHeaders('PATCH', '/api/enroll', cancelBody),
            },
            body: cancelBody,
          });
        } catch (err) {
          console.error('[Refund] Failed to revoke enrollment:', err);
        }
      }
    }

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

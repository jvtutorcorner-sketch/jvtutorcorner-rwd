import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { getUserPoints, setUserPoints } from '@/lib/pointsStorage';
import { getProfileById, putProfile } from '@/lib/profilesService';

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

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params as { orderId: string };

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

export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params as { orderId: string };
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
        await fetch(`${base}/api/enroll`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: updated.enrollmentId, status: 'PAID' }),
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
          console.log(`[Refund] Refunding ${updated.pointsUsed} points to ${updated.userId} for order ${orderId}`);
          const currentPoints = await getUserPoints(updated.userId);
          await setUserPoints(updated.userId, currentPoints + updated.pointsUsed);
        } catch (err) {
          console.error('[Refund] Failed to refund points:', err);
        }
      }

      // 2. 如果有關聯 enrollment，撤銷課程權限
      if (updated.enrollmentId) {
        try {
          console.log(`[Refund] Revoking enrollment ${updated.enrollmentId} due to refund`);
          await fetch(`${base}/api/enroll`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: updated.enrollmentId, status: 'CANCELLED' }),
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

export async function DELETE(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params as { orderId: string };
    if (!orderId) {
      return NextResponse.json({ error: 'orderId required' }, { status: 400 });
    }
    const TableName = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';
    await docClient.send(new DeleteCommand({ TableName, Key: { orderId } }));
    return NextResponse.json({ ok: true, message: 'Order deleted' });
  } catch (err) {
    console.error('orders/[orderId] DELETE error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

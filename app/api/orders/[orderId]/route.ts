import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

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
      const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      try {
        // set PAID
        await fetch(`${base}/api/enroll`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: updated.enrollmentId, status: 'PAID' }),
        });

        // activate course access
        await fetch(`${base}/api/enroll`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: updated.enrollmentId, status: 'ACTIVE' }),
        });
      } catch (err) {
        console.error('Failed to update enrollment status after order paid:', err);
      }
    }

    return NextResponse.json({ ok: true, order: updated }, { status: 200 });
  } catch (err) {
    console.error('orders/[orderId] PATCH error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

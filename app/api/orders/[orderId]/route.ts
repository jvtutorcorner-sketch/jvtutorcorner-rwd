import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import fs from 'fs';
import path from 'path';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// dev local data
const DATA_DIR = path.resolve(process.cwd(), '.local_data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
let LOCAL_ORDERS: any[] = [];
function loadLocalOrders() {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      LOCAL_ORDERS = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8') || '[]');
    }
  } catch (e) {
    console.warn('[orders/[orderId]] loadLocalOrders error', (e as any)?.message || e);
    LOCAL_ORDERS = [];
  }
}
function saveLocalOrders() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(LOCAL_ORDERS, null, 2), 'utf8');
  } catch (e) {
    console.warn('[orders/[orderId]] saveLocalOrders error', (e as any)?.message || e);
  }
}
loadLocalOrders();

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params as { orderId: string };

    if (!orderId) {
      return NextResponse.json({ error: 'orderId required' }, { status: 400 });
    }

    const TableName = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';

    // If local dev fallback and not using Dynamo, check local file
    const useDynamo = process.env.NODE_ENV === 'production' && typeof process.env.DYNAMODB_TABLE_ORDERS === 'string' && process.env.DYNAMODB_TABLE_ORDERS.length > 0;
    if (!useDynamo) {
      const found = LOCAL_ORDERS.find((o) => o.orderId === orderId) || null;
      if (!found) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      return NextResponse.json({ ok: true, order: found }, { status: 200 });
    }

    const res = await docClient.send(
      new GetCommand({ TableName, Key: { orderId } }),
    );

    const item = res.Item || null;
    if (!item) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, order: item }, { status: 200 });
  } catch (err) {
    console.error('orders/[orderId] GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params as { orderId: string };
    const body = await request.json();
    const { status } = body || {};

    if (!orderId || !status) {
      return NextResponse.json({ error: 'orderId and status required' }, { status: 400 });
    }

    const TableName = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';

    const useDynamo = process.env.NODE_ENV === 'production' && typeof process.env.DYNAMODB_TABLE_ORDERS === 'string' && process.env.DYNAMODB_TABLE_ORDERS.length > 0;

    let updated: any = null;

    if (!useDynamo) {
      const idx = LOCAL_ORDERS.findIndex((o) => o.orderId === orderId);
      if (idx === -1) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      const now = new Date().toISOString();
      // update status, updatedAt and derived orderNumber (userId + updatedAt)
      LOCAL_ORDERS[idx] = { ...LOCAL_ORDERS[idx], status, updatedAt: now, orderNumber: `${LOCAL_ORDERS[idx].userId || 'unknown'}-${now}` };
      updated = LOCAL_ORDERS[idx];
      saveLocalOrders();
    } else {
      // get existing
      const existing = await docClient.send(
        new GetCommand({ TableName, Key: { orderId } }),
      );

      if (!existing.Item) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      const now = new Date().toISOString();
      updated = { ...existing.Item, status, updatedAt: now, orderNumber: `${existing.Item.userId || 'unknown'}-${now}` } as any;

      await docClient.send(new PutCommand({ TableName, Item: updated }));
    }

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

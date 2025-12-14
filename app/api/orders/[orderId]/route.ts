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
    const { status, payments, payment } = body || {};

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
      // merge payments: append any incoming payments/payment to existing payments array
      const existing = LOCAL_ORDERS[idx] || {};
      const existingPayments = Array.isArray(existing.payments) ? existing.payments.slice() : [];
      if (Array.isArray(payments)) existingPayments.push(...payments);
      if (payment) existingPayments.push(payment);

      LOCAL_ORDERS[idx] = { ...existing, status, updatedAt: now, orderNumber: `${existing.userId || 'unknown'}-${now}`, payments: existingPayments };
      updated = LOCAL_ORDERS[idx];
      saveLocalOrders();
    } else {
      // get existing
      const existingRes = await docClient.send(
        new GetCommand({ TableName, Key: { orderId } }),
      );

      if (!existingRes.Item) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      const now = new Date().toISOString();

      // merge payments for Dynamo: append incoming payments/payment
      const existingPayments = Array.isArray(existingRes.Item.payments) ? existingRes.Item.payments.slice() : [];
      if (Array.isArray(payments)) existingPayments.push(...payments);
      if (payment) existingPayments.push(payment);

      updated = { ...existingRes.Item, status, updatedAt: now, orderNumber: `${existingRes.Item.userId || 'unknown'}-${now}`, payments: existingPayments } as any;

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

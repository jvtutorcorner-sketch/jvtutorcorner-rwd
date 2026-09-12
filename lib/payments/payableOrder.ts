// lib/payments/payableOrder.ts
// 建立結帳單之前，先把「要付多少錢、這張單是誰的」從資料庫問出來。
//
// 各家結帳端點（stripe / paypal / linepay / ecpay）先前都直接採信 request body 裡的
// `amount` 與 `userId`：登入者可以先開一張 5000 元的訂單，再送出 amount=1 的結帳請求，
// 付 1 元之後金流回調仍會把該訂單標記為 PAID。金額必須以伺服器端紀錄為準。

import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

const ORDERS_TABLE = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';
const UPGRADES_TABLE = process.env.DYNAMODB_TABLE_PLAN_UPGRADES || 'jvtutorcorner-plan-upgrades';

export type PayableOrder = {
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  itemName: string;
  status?: string;
  source: 'order' | 'plan-upgrade';
};

/**
 * 依 orderId 找出待付款紀錄。訂單與方案升級單分屬兩張表，金流回調也是先查
 * plan-upgrades 再查 orders，這裡沿用同樣的順序。
 */
export async function findPayableOrder(orderId: string): Promise<PayableOrder | null> {
  try {
    const upgradeRes = await ddbDocClient.send(
      new GetCommand({ TableName: UPGRADES_TABLE, Key: { upgradeId: orderId } })
    );
    if (upgradeRes.Item) {
      const item = upgradeRes.Item;
      return {
        orderId,
        userId: item.userId,
        amount: Number(item.amount) || 0,
        currency: item.currency || 'TWD',
        itemName: item.planLabel || item.planId || 'JV Tutor Corner Purchase',
        status: item.status,
        source: 'plan-upgrade',
      };
    }
  } catch (err) {
    console.warn('[payableOrder] plan-upgrades lookup failed:', err);
  }

  try {
    const orderRes = await ddbDocClient.send(
      new GetCommand({ TableName: ORDERS_TABLE, Key: { orderId } })
    );
    if (orderRes.Item) {
      const item = orderRes.Item;
      return {
        orderId,
        userId: item.userId,
        amount: Number(item.amount) || 0,
        currency: item.currency || 'TWD',
        itemName: item.courseTitle || item.itemName || 'JV Tutor Corner Purchase',
        status: item.status,
        source: 'order',
      };
    }
  } catch (err) {
    console.warn('[payableOrder] orders lookup failed:', err);
  }

  return null;
}

export type PayableOrderResult =
  | { ok: true; order: PayableOrder }
  | { ok: false; status: number; error: string };

/**
 * 取出待付款紀錄並確認它屬於這位登入者。
 * admin/system 可以代為結帳（後台補單），其他角色一律只能付自己的單。
 */
export async function resolvePayableOrderForSession(
  orderId: string,
  session: { userId: string; role: string }
): Promise<PayableOrderResult> {
  if (!orderId) {
    return { ok: false, status: 400, error: 'Missing orderId' };
  }

  const order = await findPayableOrder(orderId);
  if (!order) {
    return { ok: false, status: 404, error: 'Order not found' };
  }

  const isPrivileged = session.role === 'admin' || session.role === 'system';
  if (!isPrivileged && order.userId !== session.userId) {
    // 不透露這張單是否存在
    return { ok: false, status: 404, error: 'Order not found' };
  }

  if (order.status && order.status !== 'PENDING' && order.status !== 'UNPAID') {
    return { ok: false, status: 409, error: `Order is not payable (status: ${order.status})` };
  }

  if (!(order.amount > 0)) {
    return { ok: false, status: 400, error: 'Order has no payable amount' };
  }

  return { ok: true, order };
}

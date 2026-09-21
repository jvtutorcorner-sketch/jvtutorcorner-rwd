// app/api/admin/refunds/refundService.ts
// 管理員執行退款（核准 / 駁回 / 回填金流退款編號）的 DynamoDB 實作。
//
// 使用者端只能「申請」退款（PATCH /api/orders/[orderId] action=request_refund）；
// 真正會動到資產的步驟只在這裡、而且只有 admin/system 能觸發。
//
// 金流端（Stripe / PayPal / LINE Pay / ECPay）不呼叫任何退款 API：
// 管理員到金流商後台手動退款，再把退款編號回填到 order.gatewayRefund.reference。
//
// 冪等與併發：
//   1. 先用條件更新把 refundStatus 搶成 PROCESSING（同時確認 status 仍是 PAID/COMPLETED），
//      兩個管理員同時按核准只會有一個成功。
//   2. 資產反轉完成後立刻寫 refundAssetsReversedAt；中途失敗重試時會跳過已完成的資產步驟。
//   3. 最後以 `refundStatus = PROCESSING AND status <> REFUNDED` 條件把訂單改成 REFUNDED。

import { GetCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { refundEscrow, getEscrow, getEscrowByOrder } from '@/lib/pointsEscrow';
import { addUserPoints, POINTS_TABLE, useDynamoForPoints, LOCAL_POINTS } from '@/lib/pointsStorage';
import { writeAuditLog } from '@/lib/auditLogService';
import { generateHmacHeaders } from '@/lib/auth/hmac';
import {
  B2B_SEAT_REFUND_ERROR,
  REFUNDABLE_ORDER_STATUSES,
  REJECTABLE_REFUND_STATUSES,
  buildGatewayRefund,
  isB2bSeatOrder,
  isRefundableStatus,
  needsManualGatewayRefund,
  planAssetReversal,
  type OrderRecord,
} from './refundPolicy';

const ORDERS_TABLE = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';

/** PROCESSING 超過這個時間視為上一次處理中斷，允許重新搶佔。 */
const PROCESSING_STALE_MS = 5 * 60 * 1000;

export type RefundServiceResult =
  | { ok: true; outcome: 'APPROVED' | 'ALREADY_REFUNDED' | 'REJECTED' | 'GATEWAY_REF_UPDATED'; order: OrderRecord | null | undefined }
  | { ok: false; outcome: 'MANUAL_REVIEW'; httpStatus: 409; error: string; order: OrderRecord | null | undefined }
  | { ok: false; httpStatus: 400 | 404 | 409 | 500; error: string; order?: OrderRecord | null };

function isConditionalFail(err: unknown): boolean {
  return (err as { name?: string })?.name === 'ConditionalCheckFailedException';
}

async function getOrder(orderId: string): Promise<OrderRecord | null> {
  const res = await ddbDocClient.send(new GetCommand({ TableName: ORDERS_TABLE, Key: { orderId } }));
  return res.Item || null;
}

/**
 * 原子地扣回點數：餘額不足時不做任何變更並回傳 insufficient。
 * （lib/pointsStorage 的 deductUserPoints 是 read-then-write，這裡需要條件更新。）
 */
async function takeBackPoints(
  userId: string,
  points: number
): Promise<{ ok: true } | { ok: false; insufficient: true }> {
  if (useDynamoForPoints) {
    try {
      await ddbDocClient.send(
        new UpdateCommand({
          TableName: POINTS_TABLE,
          Key: { userId },
          UpdateExpression: 'SET #bal = #bal - :pts, updatedAt = :u',
          ConditionExpression: 'attribute_exists(#bal) AND #bal >= :pts',
          ExpressionAttributeNames: { '#bal': 'balance' },
          ExpressionAttributeValues: { ':pts': points, ':u': new Date().toISOString() },
        })
      );
      return { ok: true };
    } catch (err) {
      if (isConditionalFail(err)) return { ok: false, insufficient: true };
      throw err;
    }
  }
  const current = LOCAL_POINTS[userId] ?? 0;
  if (current < points) return { ok: false, insufficient: true };
  LOCAL_POINTS[userId] = current - points;
  return { ok: true };
}

/** 退回 escrow；若 escrow 早已 REFUNDED（例如先前退課時已退）視為完成，不重複加點。 */
async function settleEscrowForRefund(escrowId: string): Promise<{ done: true } | { done: false; reason: string }> {
  const result = await refundEscrow(escrowId);
  if (result.ok) return { done: true };
  const latest = await getEscrow(escrowId);
  if (latest?.status === 'REFUNDED') return { done: true };
  return {
    done: false,
    reason: `點數暫存 ${escrowId} 無法退回（${latest?.status ?? '找不到紀錄'}：${result.error}），可能已撥給老師，需人工處理`,
  };
}

async function reverseAssets(order: OrderRecord): Promise<{ done: true; kind: string } | { done: false; reason: string }> {
  const plan = planAssetReversal(order);
  switch (plan.kind) {
    case 'escrow_refund': {
      const r = await settleEscrowForRefund(plan.escrowId);
      return r.done ? { done: true, kind: plan.kind } : r;
    }
    case 'points_credit_legacy': {
      const escrow = await getEscrowByOrder(order.orderId);
      if (escrow) {
        const r = await settleEscrowForRefund(escrow.escrowId);
        return r.done ? { done: true, kind: 'escrow_refund' } : r;
      }
      await addUserPoints(order.userId, plan.points);
      return { done: true, kind: plan.kind };
    }
    case 'points_takeback': {
      if (!order.userId) return { done: false, reason: '訂單沒有 userId，無法扣回點數' };
      const r = await takeBackPoints(order.userId, plan.points);
      if (r.ok) return { done: true, kind: plan.kind };
      return {
        done: false,
        reason: `學員點數餘額不足以扣回購買的 ${plan.points} 點（可能已使用），已轉人工審查，未變更任何資產`,
      };
    }
    case 'manual':
      return { done: false, reason: plan.reason };
    case 'none':
    default:
      return { done: true, kind: 'none' };
  }
}

async function markManualReview(orderId: string, reason: string, actorId: string): Promise<OrderRecord | null> {
  const now = new Date().toISOString();
  try {
    const res = await ddbDocClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { orderId },
        UpdateExpression:
          'SET refundStatus = :mr, refundManualReviewReason = :reason, refundManualReviewAt = :now, updatedAt = :now REMOVE refundProcessingAt, refundProcessingBy',
        ConditionExpression: 'refundStatus = :processing',
        ExpressionAttributeValues: { ':mr': 'MANUAL_REVIEW', ':reason': reason, ':now': now, ':processing': 'PROCESSING' },
        ReturnValues: 'ALL_NEW',
      })
    );
    await writeAuditLog({
      actorId,
      action: 'order.refund.manual_review',
      targetType: 'order',
      targetId: orderId,
      metadata: { reason },
    });
    return res.Attributes ?? null;
  } catch (err) {
    if (isConditionalFail(err)) return getOrder(orderId);
    throw err;
  }
}

function resolveBaseUrl(request: Request): string {
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('host') || 'localhost:3000';
  return process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;
}

export async function revokeEnrollment(request: Request, enrollmentId: string, orderId: string): Promise<void> {
  try {
    console.log(`[Refund] Revoking enrollment ${enrollmentId} due to refund of order ${orderId}`);
    const cancelBody = JSON.stringify({ id: enrollmentId, status: 'CANCELLED' });
    await fetch(`${resolveBaseUrl(request)}/api/enroll`, {
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

/**
 * 核准退款：反轉資產 → 訂單改 REFUNDED、refundStatus=APPROVED → 撤銷報名。
 * 資產無法自動反轉（點數不足、escrow 已撥款、方案訂單）時改成 MANUAL_REVIEW，不動任何資產。
 */
export async function approveRefund(params: {
  request: Request;
  orderId: string;
  actorId: string;
  note?: string | null;
  manualGatewayRefundRef?: string | null;
  /** 管理員確認資產已人工處理（例如方案已手動降級），略過自動資產反轉。 */
  assetsHandledManually?: boolean;
  /** 相容舊的管理介面：PATCH status=REFUNDED 時附帶的 payment 紀錄。 */
  payment?: unknown;
}): Promise<RefundServiceResult> {
  const { request, orderId, actorId } = params;
  const order = await getOrder(orderId);
  if (!order) return { ok: false, httpStatus: 404, error: 'Order not found' };

  if (order.status === 'REFUNDED') {
    return { ok: true, outcome: 'ALREADY_REFUNDED', order };
  }
  if (isB2bSeatOrder(order)) {
    return { ok: false, httpStatus: 409, error: B2B_SEAT_REFUND_ERROR, order };
  }
  if (!isRefundableStatus(order.status)) {
    return {
      ok: false,
      httpStatus: 409,
      error: `只有已付款的訂單可以退款（目前狀態：${order.status || 'UNKNOWN'}）`,
      order,
    };
  }

  // 1. 搶佔處理權
  const claimAt = new Date();
  const staleBefore = new Date(claimAt.getTime() - PROCESSING_STALE_MS).toISOString();
  try {
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { orderId },
        UpdateExpression: 'SET refundStatus = :processing, refundProcessingAt = :now, refundProcessingBy = :actor, updatedAt = :now',
        ConditionExpression:
          '#status IN (:s0, :s1) AND (attribute_not_exists(refundStatus) OR refundStatus <> :processing OR refundProcessingAt < :stale)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':processing': 'PROCESSING',
          ':now': claimAt.toISOString(),
          ':actor': actorId,
          ':s0': REFUNDABLE_ORDER_STATUSES[0],
          ':s1': REFUNDABLE_ORDER_STATUSES[1],
          ':stale': staleBefore,
        },
      })
    );
  } catch (err) {
    if (isConditionalFail(err)) {
      return { ok: false, httpStatus: 409, error: '此訂單正在由其他人處理退款，或狀態已變更，請重新整理後再試', order: await getOrder(orderId) };
    }
    throw err;
  }

  // 2. 資產反轉（已完成過就跳過）
  if (!order.refundAssetsReversedAt) {
    let reversal: { done: true; kind: string } | { done: false; reason: string };
    if (params.assetsHandledManually) {
      reversal = { done: true, kind: 'handled_manually' };
    } else {
      try {
        reversal = await reverseAssets(order);
      } catch (err) {
        console.error(`[Refund] Asset reversal failed for order ${orderId}:`, err);
        reversal = { done: false, reason: `資產反轉時發生錯誤：${err instanceof Error ? err.message : String(err)}` };
      }
    }

    if (!reversal.done) {
      const updated = await markManualReview(orderId, reversal.reason, actorId);
      return { ok: false, outcome: 'MANUAL_REVIEW', httpStatus: 409, error: reversal.reason, order: updated };
    }

    await ddbDocClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { orderId },
        UpdateExpression: 'SET refundAssetsReversedAt = :now, refundAssetsReversal = :kind',
        ConditionExpression: 'refundStatus = :processing',
        ExpressionAttributeValues: { ':now': new Date().toISOString(), ':kind': reversal.kind, ':processing': 'PROCESSING' },
      })
    );
  }

  // 3. 訂單改 REFUNDED
  const now = new Date().toISOString();
  const setParts = [
    '#status = :refunded',
    'refundStatus = :approved',
    'refundedAt = :now',
    'refundedBy = :actor',
    'updatedAt = :now',
  ];
  const values: Record<string, unknown> = {
    ':refunded': 'REFUNDED',
    ':approved': 'APPROVED',
    ':now': now,
    ':actor': actorId,
    ':processing': 'PROCESSING',
  };
  if (params.note) {
    setParts.push('refundNote = :note');
    values[':note'] = params.note;
  }
  if (needsManualGatewayRefund(order)) {
    setParts.push('gatewayRefund = :gw');
    values[':gw'] = buildGatewayRefund(order, params.manualGatewayRefundRef, actorId, now);
  }
  if (params.payment && typeof params.payment === 'object') {
    setParts.push('payments = list_append(if_not_exists(payments, :emptyList), :payment)');
    values[':emptyList'] = [];
    values[':payment'] = [params.payment];
  }

  let finalOrder: OrderRecord | undefined;
  try {
    const res = await ddbDocClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { orderId },
        UpdateExpression: `SET ${setParts.join(', ')} REMOVE refundProcessingAt, refundProcessingBy, refundManualReviewReason`,
        ConditionExpression: 'refundStatus = :processing AND #status <> :refunded',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      })
    );
    finalOrder = res.Attributes;
  } catch (err) {
    if (isConditionalFail(err)) {
      const latest = await getOrder(orderId);
      if (latest?.status === 'REFUNDED') return { ok: true, outcome: 'ALREADY_REFUNDED', order: latest };
      return { ok: false, httpStatus: 409, error: '退款狀態已被其他操作變更，請重新整理後再試', order: latest };
    }
    throw err;
  }

  // 4. 撤銷課程權限
  if (finalOrder?.enrollmentId) {
    await revokeEnrollment(request, finalOrder.enrollmentId, orderId);
  }

  await writeAuditLog({
    actorId,
    action: 'order.refund.approve',
    targetType: 'order',
    targetId: orderId,
    metadata: {
      userId: finalOrder?.userId,
      paymentMethod: finalOrder?.paymentMethod ?? null,
      amount: finalOrder?.amount ?? null,
      assetsReversal: finalOrder?.refundAssetsReversal ?? null,
      gatewayRefund: finalOrder?.gatewayRefund ?? null,
      note: params.note ?? null,
    },
  });

  return { ok: true, outcome: 'APPROVED', order: finalOrder };
}

export async function rejectRefund(params: { orderId: string; actorId: string; note?: string | null }): Promise<RefundServiceResult> {
  const { orderId, actorId } = params;
  const now = new Date().toISOString();
  try {
    const res = await ddbDocClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { orderId },
        UpdateExpression:
          'SET refundStatus = :rejected, refundRejectedAt = :now, refundRejectedBy = :actor, refundNote = :note, updatedAt = :now',
        ConditionExpression: 'attribute_exists(orderId) AND refundStatus IN (:r0, :r1)',
        ExpressionAttributeValues: {
          ':rejected': 'REJECTED',
          ':now': now,
          ':actor': actorId,
          ':note': params.note ?? null,
          ':r0': REJECTABLE_REFUND_STATUSES[0],
          ':r1': REJECTABLE_REFUND_STATUSES[1],
        },
        ReturnValues: 'ALL_NEW',
      })
    );
    await writeAuditLog({
      actorId,
      action: 'order.refund.reject',
      targetType: 'order',
      targetId: orderId,
      metadata: { note: params.note ?? null },
    });
    return { ok: true, outcome: 'REJECTED', order: res.Attributes };
  } catch (err) {
    if (isConditionalFail(err)) {
      const latest = await getOrder(orderId);
      if (!latest) return { ok: false, httpStatus: 404, error: 'Order not found' };
      return {
        ok: false,
        httpStatus: 409,
        error: `只有待審核或人工審查中的申請可以駁回（目前：${latest.refundStatus || '無申請'}）`,
        order: latest,
      };
    }
    throw err;
  }
}

/** 已退款訂單回填（或更正）金流後台的退款編號。 */
export async function setGatewayRefundReference(params: {
  orderId: string;
  actorId: string;
  reference: string;
  note?: string | null;
}): Promise<RefundServiceResult> {
  const { orderId, actorId, reference } = params;
  const order = await getOrder(orderId);
  if (!order) return { ok: false, httpStatus: 404, error: 'Order not found' };
  if (order.status !== 'REFUNDED') {
    return { ok: false, httpStatus: 409, error: '訂單尚未核准退款，請先核准再回填金流退款編號', order };
  }
  if (!needsManualGatewayRefund(order)) {
    return { ok: false, httpStatus: 400, error: '點數付款訂單沒有金流退款', order };
  }
  const now = new Date().toISOString();
  const gw = buildGatewayRefund(order, reference, actorId, now);
  const res = await ddbDocClient.send(
    new UpdateCommand({
      TableName: ORDERS_TABLE,
      Key: { orderId },
      UpdateExpression: 'SET gatewayRefund = :gw, updatedAt = :now',
      ConditionExpression: '#status = :refunded',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':gw': gw, ':now': now, ':refunded': 'REFUNDED' },
      ReturnValues: 'ALL_NEW',
    })
  );
  await writeAuditLog({
    actorId,
    action: 'order.refund.gateway_reference',
    targetType: 'order',
    targetId: orderId,
    metadata: { reference: gw.reference, previous: order.gatewayRefund?.reference ?? null, note: params.note ?? null },
  });
  return { ok: true, outcome: 'GATEWAY_REF_UPDATED', order: res.Attributes };
}

/** 列出有退款申請或已退款的訂單（整表 scan + filter；訂單量大時需要改 GSI）。 */
export async function listRefundOrders(opts: { maxPages?: number } = {}): Promise<{ items: OrderRecord[]; truncated: boolean }> {
  const maxPages = opts.maxPages ?? 20;
  const items: OrderRecord[] = [];
  let startKey: Record<string, unknown> | undefined;
  let pages = 0;
  do {
    const res = await ddbDocClient.send(
      new ScanCommand({
        TableName: ORDERS_TABLE,
        FilterExpression: 'attribute_exists(refundStatus) OR #status = :refunded',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':refunded': 'REFUNDED' },
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      })
    );
    items.push(...(res.Items || []));
    startKey = res.LastEvaluatedKey;
    pages++;
  } while (startKey && pages < maxPages);

  const sortKey = (o: OrderRecord) => String(o.refundRequestedAt || o.refundedAt || o.updatedAt || o.createdAt || '');
  items.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  return { items, truncated: !!startKey };
}

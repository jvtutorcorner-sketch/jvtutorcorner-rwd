import { NextResponse } from 'next/server';
import { withAdmin, AuthedRequest } from '@/lib/auth/apiGuard';
import { parseAdminRefundAction } from './refundPolicy';
import { approveRefund, rejectRefund, setGatewayRefundReference, listRefundOrders } from './refundService';

/**
 * GET /api/admin/refunds
 * 列出所有有退款申請（refundStatus）或已退款（status=REFUNDED）的訂單。
 * 可選 ?refundStatus=REQUESTED|MANUAL_REVIEW|APPROVED|REJECTED|PROCESSING 過濾。
 */
async function handleGet(request: AuthedRequest) {
  try {
    const filter = new URL(request.url).searchParams.get('refundStatus');
    const { items, truncated } = await listRefundOrders();
    const data = filter ? items.filter((o) => o.refundStatus === filter) : items;
    return NextResponse.json({ ok: true, total: data.length, truncated, data });
  } catch (err) {
    console.error('[admin/refunds] GET error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'Failed to list refunds' }, { status: 500 });
  }
}

/**
 * POST /api/admin/refunds
 * body: { orderId, action: 'approve' | 'reject' | 'gateway_ref', note?, manualGatewayRefundRef?, assetsHandledManually? }
 *
 * approve 只反轉平台內的資產（點數 escrow、購買的點數、報名權限）並記錄金流退款狀態；
 * 金流實際退款必須由管理員到各金流商後台手動處理，再回填退款編號。
 */
async function handlePost(request: AuthedRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseAdminRefundAction(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const actorId = request.session.userId;
  try {
    let result;
    if (parsed.action === 'approve') {
      result = await approveRefund({
        request,
        orderId: parsed.orderId,
        actorId,
        note: parsed.note,
        manualGatewayRefundRef: parsed.manualGatewayRefundRef,
        assetsHandledManually: parsed.assetsHandledManually,
      });
    } else if (parsed.action === 'reject') {
      result = await rejectRefund({ orderId: parsed.orderId, actorId, note: parsed.note });
    } else {
      result = await setGatewayRefundReference({
        orderId: parsed.orderId,
        actorId,
        reference: parsed.manualGatewayRefundRef,
        note: parsed.note,
      });
    }

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, outcome: 'outcome' in result ? result.outcome : undefined, order: result.order },
        { status: result.httpStatus }
      );
    }
    return NextResponse.json({ ok: true, outcome: result.outcome, order: result.order });
  } catch (err) {
    console.error('[admin/refunds] POST error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'Refund operation failed' }, { status: 500 });
  }
}

export const GET = withAdmin(handleGet);
export const POST = withAdmin(handlePost);

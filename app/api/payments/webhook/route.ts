import { NextResponse } from 'next/server';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import { internalFetch } from '@/lib/auth/internalFetch';

/**
 * 模擬付款用的內部捷徑：把訂單直接改成指定狀態。
 *
 * 這不是真的金流 webhook —— 真正的閘道回調各自有簽章驗證
 * （stripe/webhook 的 constructEvent、ecpay/return 的 verifyCheckMacValue、
 * paypal/capture-order 的 capture 結果）。這支只是給後台測試流程用的。
 *
 * 先前這支完全沒有驗證，而且直接代打未受保護的 `PATCH /api/orders/[orderId]`，
 * 任何人送出 `{orderId, status:'PAID'}` 就能把自己的訂單標記為已付款。
 * 現在限定 admin，且以 HMAC 簽名轉呼叫訂單 API。
 */
const handleSimulatedPayment = async (request: AuthedRequest) => {
  try {
    const body = await request.json();
    const { orderId, status } = body || {};

    if (!orderId || !status) {
      return NextResponse.json({ ok: false, error: 'orderId and status required' }, { status: 400 });
    }

    const res = await internalFetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
      originRequest: request,
    });

    const data = await res.json().catch(() => ({}));

    return NextResponse.json({ ok: res.ok, proxied: data }, { status: res.ok ? 200 : res.status });
  } catch (err) {
    console.error('[payments webhook] error:', err);
    return NextResponse.json({ ok: false, error: 'server error' }, { status: 500 });
  }
};

export const POST = withAdmin(handleSimulatedPayment);

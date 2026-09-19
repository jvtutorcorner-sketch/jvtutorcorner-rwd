"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';

// 退款管理（管理員）
//
// 流程：使用者在 /refunds 送出退款申請（refundStatus=REQUESTED）→ 管理員在這裡核准或駁回。
// 核准會反轉平台內資產（點數 escrow 退回、購買的點數扣回、撤銷報名）並把訂單改成 REFUNDED；
// 金流端（Stripe / PayPal / LINE Pay / ECPay）不會自動退款，必須到金流商後台手動處理後回填退款編號。

type GatewayRefund = {
  mode: 'manual';
  status: 'PENDING_MANUAL' | 'DONE';
  reference: string | null;
  paymentMethod: string | null;
  gatewayTransactionId: string | null;
  updatedAt: string;
  updatedBy: string;
};

type RefundOrder = {
  orderId: string;
  userId?: string;
  courseId?: string;
  courseTitle?: string;
  itemType?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string | null;
  pointsUsed?: number;
  points?: number;
  status?: string;
  refundStatus?: string;
  refundReason?: string;
  refundRequestedAt?: string;
  refundNote?: string;
  refundManualReviewReason?: string;
  refundedAt?: string;
  refundedBy?: string;
  refundRejectedAt?: string;
  gatewayRefund?: GatewayRefund;
  createdAt?: string;
};

type RowInput = { note: string; gatewayRef: string; assetsHandledManually: boolean };

type ActionLog = { id: string; timestamp: string; orderId: string; action: string; ok: boolean; message: string };

const REFUND_STATUS_LABEL: Record<string, string> = {
  REQUESTED: '待審核',
  PROCESSING: '處理中',
  MANUAL_REVIEW: '人工審查',
  APPROVED: '已核准',
  REJECTED: '已駁回',
};

const REFUND_STATUS_BADGE: Record<string, string> = {
  REQUESTED: 'bg-yellow-100 text-yellow-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  MANUAL_REVIEW: 'bg-orange-100 text-orange-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-gray-200 text-gray-700',
};

const EMPTY_INPUT: RowInput = { note: '', gatewayRef: '', assetsHandledManually: false };

function fmt(ts?: string) {
  if (!ts) return '-';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

function paymentLabel(o: RefundOrder) {
  if (o.paymentMethod === 'points') return `點數 ${o.pointsUsed ?? 0} 點`;
  return `${o.paymentMethod || '未知金流'} ${o.amount ?? 0} ${o.currency || ''}`.trim();
}

export default function RefundManagementPage() {
  const [orders, setOrders] = useState<RefundOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [filter, setFilter] = useState<string>('OPEN');
  const [inputs, setInputs] = useState<Record<string, RowInput>>({});
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [logs, setLogs] = useState<ActionLog[]>([]);

  // 單一訂單直接退款（沒有使用者申請時，例如客服電話退款）
  const [directOrderId, setDirectOrderId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/refunds', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `載入失敗 (${res.status})`);
      setOrders(Array.isArray(data.data) ? data.data : []);
      setTruncated(!!data.truncated);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleOrders = useMemo(() => {
    if (filter === 'ALL') return orders;
    if (filter === 'OPEN') {
      return orders.filter((o) => ['REQUESTED', 'MANUAL_REVIEW', 'PROCESSING'].includes(o.refundStatus || ''));
    }
    if (filter === 'PENDING_GATEWAY') {
      return orders.filter((o) => o.status === 'REFUNDED' && o.gatewayRefund?.status === 'PENDING_MANUAL');
    }
    return orders.filter((o) => o.refundStatus === filter);
  }, [orders, filter]);

  const getInput = (orderId: string): RowInput => inputs[orderId] || EMPTY_INPUT;
  const setInput = (orderId: string, patch: Partial<RowInput>) =>
    setInputs((prev) => ({ ...prev, [orderId]: { ...(prev[orderId] || EMPTY_INPUT), ...patch } }));

  const runAction = async (orderId: string, action: 'approve' | 'reject' | 'gateway_ref') => {
    const input = getInput(orderId);
    const labels = { approve: '核准退款', reject: '駁回申請', gateway_ref: '回填金流退款編號' };
    if (action === 'gateway_ref' && !input.gatewayRef.trim()) {
      alert('請輸入金流退款編號');
      return;
    }
    const confirmText =
      action === 'approve'
        ? `確定要核准訂單 ${orderId} 的退款嗎？\n\n系統會反轉點數/撤銷報名並把訂單標記為 REFUNDED。\n金流實際退款不會自動執行，請至金流商後台手動處理。`
        : `確定要${labels[action]}（訂單 ${orderId}）嗎？`;
    if (!confirm(confirmText)) return;

    setBusyOrderId(orderId);
    setResultMessage(null);
    try {
      const res = await fetch('/api/admin/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          action,
          note: input.note || undefined,
          manualGatewayRefundRef: input.gatewayRef || undefined,
          assetsHandledManually: action === 'approve' ? input.assetsHandledManually : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const ok = res.ok && !!data?.ok;
      let text: string;
      if (ok) {
        const outcome = data.outcome === 'ALREADY_REFUNDED' ? '（此訂單先前已退款）' : '';
        text = `${labels[action]}成功${outcome}：${orderId}`;
        if (action === 'approve' && data.order?.gatewayRefund?.status === 'PENDING_MANUAL') {
          text += '\n⚠️ 金流退款尚未完成：請至金流商後台退款後回填退款編號。';
        }
      } else if (data?.outcome === 'MANUAL_REVIEW') {
        text = `已轉人工審查（未變更任何資產）：${data.error}`;
      } else {
        text = `${labels[action]}失敗：${data?.error || `HTTP ${res.status}`}`;
      }
      setResultMessage({ ok, text });
      setLogs((prev) => [
        { id: `log-${Date.now()}`, timestamp: new Date().toLocaleString(), orderId, action: labels[action], ok, message: text },
        ...prev,
      ]);
      if (data?.order?.orderId) {
        setOrders((prev) => {
          const exists = prev.some((o) => o.orderId === data.order.orderId);
          return exists ? prev.map((o) => (o.orderId === data.order.orderId ? data.order : o)) : [data.order, ...prev];
        });
      }
      if (ok) setInputs((prev) => ({ ...prev, [orderId]: EMPTY_INPUT }));
    } catch (err) {
      setResultMessage({ ok: false, text: `${labels[action]}失敗：${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleDirectApprove = async () => {
    const id = directOrderId.trim();
    if (!id) {
      alert('請輸入訂單 ID');
      return;
    }
    await runAction(id, 'approve');
  };

  const renderActionInputs = (o: RefundOrder) => {
    const input = getInput(o.orderId);
    const busy = busyOrderId === o.orderId;
    const isRefunded = o.status === 'REFUNDED';
    const canApprove = !isRefunded && o.paymentMethod !== 'b2b_seat' && ['PAID', 'COMPLETED'].includes((o.status || '').toUpperCase());
    const canReject = ['REQUESTED', 'MANUAL_REVIEW'].includes(o.refundStatus || '');
    const needsGateway = o.paymentMethod !== 'points' && o.paymentMethod !== 'b2b_seat';
    const canBackfill = isRefunded && needsGateway;

    if (!canApprove && !canReject && !canBackfill) return <span className="text-gray-400 text-xs">無可用操作</span>;

    return (
      <div className="space-y-2 min-w-[260px]">
        <input
          className="w-full border rounded px-2 py-1 text-sm"
          placeholder="審核備註 (選填)"
          value={input.note}
          onChange={(e) => setInput(o.orderId, { note: e.target.value })}
        />
        {needsGateway && (canApprove || canBackfill) && (
          <input
            className="w-full border rounded px-2 py-1 text-sm"
            placeholder="金流後台退款編號 (完成後回填)"
            value={input.gatewayRef}
            onChange={(e) => setInput(o.orderId, { gatewayRef: e.target.value })}
          />
        )}
        {canApprove && o.refundStatus === 'MANUAL_REVIEW' && (
          <label className="flex items-center gap-2 text-xs text-orange-800">
            <input
              type="checkbox"
              checked={input.assetsHandledManually}
              onChange={(e) => setInput(o.orderId, { assetsHandledManually: e.target.checked })}
            />
            資產已人工處理（略過自動點數/方案反轉）
          </label>
        )}
        <div className="flex gap-2">
          {canApprove && (
            <button
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm disabled:bg-gray-400"
              disabled={busy}
              onClick={() => runAction(o.orderId, 'approve')}
            >
              {busy ? '處理中...' : '核准退款'}
            </button>
          )}
          {canReject && (
            <button
              className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm disabled:bg-gray-400"
              disabled={busy}
              onClick={() => runAction(o.orderId, 'reject')}
            >
              駁回
            </button>
          )}
          {canBackfill && (
            <button
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm disabled:bg-gray-400"
              disabled={busy}
              onClick={() => runAction(o.orderId, 'gateway_ref')}
            >
              回填退款編號
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-6 py-8 max-w-[1600px]">
      <h1 className="text-3xl font-bold mb-6">退款管理 (Refund Management)</h1>

      <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-lg p-4 mb-6 text-sm leading-relaxed">
        <p className="font-bold mb-1">⚠️ 金流實際退款請至各金流商後台手動處理，並回填退款編號。</p>
        <p>
          核准退款只會處理平台內的資產：點數報名退回點數暫存、購買的點數套餐從學員餘額扣回、撤銷課程報名，並把訂單標記為 REFUNDED。
          系統不會呼叫 Stripe / PayPal / LINE Pay / ECPay 的退款 API。若學員點數不足以扣回，或方案訂單無法自動降級，申請會轉為「人工審查」且不變更任何資產。
        </p>
      </div>

      {resultMessage && (
        <div
          className={`whitespace-pre-line rounded-lg p-4 mb-6 text-sm border ${
            resultMessage.ok ? 'bg-green-50 border-green-300 text-green-900' : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          {resultMessage.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-4">
          {/* 區塊 1: 退款申請列表 */}
          <section className="bg-white p-6 rounded-lg shadow mb-8">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4 border-b pb-2">
              <h2 className="text-xl font-semibold">1. 退款申請 (Requests)</h2>
              <div className="flex items-center gap-2">
                <select className="border rounded px-3 py-1 bg-white text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="OPEN">待處理（待審核 / 人工審查）</option>
                  <option value="PENDING_GATEWAY">已退款・待回填金流編號</option>
                  <option value="APPROVED">已核准</option>
                  <option value="REJECTED">已駁回</option>
                  <option value="ALL">全部</option>
                </select>
                <button
                  className="bg-gray-100 hover:bg-gray-200 border px-3 py-1 rounded text-sm"
                  onClick={load}
                  disabled={loading}
                >
                  {loading ? '載入中...' : '重新整理'}
                </button>
              </div>
            </div>

            {loadError && <div className="text-red-600 text-sm mb-4">載入失敗：{loadError}</div>}
            {truncated && (
              <div className="text-orange-600 text-xs mb-4">資料量過大，僅顯示部分結果。</div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <th className="px-3 py-2">訂單 / 使用者</th>
                    <th className="px-3 py-2">付款</th>
                    <th className="px-3 py-2">狀態</th>
                    <th className="px-3 py-2">申請原因</th>
                    <th className="px-3 py-2">金流退款</th>
                    <th className="px-3 py-2">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {visibleOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-gray-400">
                        {loading ? '載入中...' : '尚無資料'}
                      </td>
                    </tr>
                  ) : (
                    visibleOrders.map((o) => (
                      <tr key={o.orderId} className="align-top">
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs break-all">{o.orderId}</div>
                          <div className="text-gray-500 text-xs">使用者：{o.userId || '-'}</div>
                          <div className="text-gray-500 text-xs">{o.courseTitle || o.courseId || o.itemType || ''}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div>{paymentLabel(o)}</div>
                          {o.itemType === 'POINTS' && o.points ? (
                            <div className="text-gray-500 text-xs">購買點數 {o.points} 點</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 space-y-1">
                          <div className="text-xs">訂單：{o.status || '-'}</div>
                          {o.refundStatus && (
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${REFUND_STATUS_BADGE[o.refundStatus] || 'bg-gray-100'}`}>
                              {REFUND_STATUS_LABEL[o.refundStatus] || o.refundStatus}
                            </span>
                          )}
                          <div className="text-gray-400 text-xs">申請：{fmt(o.refundRequestedAt)}</div>
                          {o.refundedAt && <div className="text-gray-400 text-xs">退款：{fmt(o.refundedAt)}</div>}
                        </td>
                        <td className="px-3 py-2 max-w-[260px]">
                          <div className="whitespace-pre-wrap break-words">{o.refundReason || '-'}</div>
                          {o.refundManualReviewReason && (
                            <div className="text-orange-700 text-xs mt-1">人工審查原因：{o.refundManualReviewReason}</div>
                          )}
                          {o.refundNote && <div className="text-gray-500 text-xs mt-1">備註：{o.refundNote}</div>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {o.paymentMethod === 'points' ? (
                            <span className="text-gray-400">不適用（點數）</span>
                          ) : o.gatewayRefund ? (
                            <div className="space-y-1">
                              <div className={o.gatewayRefund.status === 'DONE' ? 'text-green-700' : 'text-orange-700'}>
                                {o.gatewayRefund.status === 'DONE' ? '已回填' : '待手動退款'}
                              </div>
                              {o.gatewayRefund.reference && <div>編號：{o.gatewayRefund.reference}</div>}
                              {o.gatewayRefund.gatewayTransactionId && (
                                <div className="text-gray-500 break-all">交易：{o.gatewayRefund.gatewayTransactionId}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">尚未核准</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{renderActionInputs(o)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* 區塊 2: 單一訂單直接退款 */}
          <section className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">2. 單一訂單直接退款（無使用者申請）</h2>
            <p className="text-gray-500 mb-4 text-sm">
              適用於客服受理等情境。只接受已付款（PAID / COMPLETED）的訂單；金流退款同樣需要到金流商後台手動處理。
            </p>
            <div className="space-y-3 max-w-2xl">
              <input
                className="w-full border rounded px-3 py-2 bg-white"
                placeholder="輸入完整訂單 ID"
                value={directOrderId}
                onChange={(e) => setDirectOrderId(e.target.value)}
              />
              {directOrderId.trim() && (
                <>
                  <input
                    className="w-full border rounded px-3 py-2"
                    placeholder="審核備註 (選填)"
                    value={getInput(directOrderId.trim()).note}
                    onChange={(e) => setInput(directOrderId.trim(), { note: e.target.value })}
                  />
                  <input
                    className="w-full border rounded px-3 py-2"
                    placeholder="金流後台退款編號 (若已退款可直接填入)"
                    value={getInput(directOrderId.trim()).gatewayRef}
                    onChange={(e) => setInput(directOrderId.trim(), { gatewayRef: e.target.value })}
                  />
                </>
              )}
              <button
                className={`w-full py-3 rounded text-white font-bold text-lg ${
                  busyOrderId ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
                onClick={handleDirectApprove}
                disabled={!!busyOrderId}
              >
                {busyOrderId ? '處理中...' : '核准退款'}
              </button>
            </div>
          </section>
        </div>

        {/* 右側：本次操作紀錄（完整稽核紀錄寫在 audit log） */}
        <div className="lg:col-span-1">
          <section className="bg-white p-6 rounded-lg shadow h-full flex flex-col">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">操作紀錄 (History)</h2>
            <p className="text-gray-400 text-xs mb-3">僅顯示本次頁面操作；完整紀錄請見稽核日誌。</p>
            <div className="flex-1 overflow-y-auto space-y-4 max-h-[800px] pr-2">
              {logs.length === 0 ? (
                <div className="text-center py-10 text-gray-400">尚無紀錄</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="border rounded-lg p-3 text-sm bg-gray-50 transition hover:shadow-md">
                    <div className="flex justify-between items-start mb-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${
                          log.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {log.action}
                      </span>
                      <span className="text-gray-400 text-xs">{log.timestamp}</span>
                    </div>
                    <p className="font-mono text-xs break-all">{log.orderId}</p>
                    <p className="text-xs whitespace-pre-line mt-1">{log.message}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

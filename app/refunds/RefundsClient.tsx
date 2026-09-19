"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// 使用者的退款申請頁。
// 這裡只能「申請」退款（refundStatus=REQUESTED），訂單狀態與點數都不會變動；
// 管理員在 /admin/refunds 核准後才會退回點數 / 撤銷報名，金流款項由管理員至金流商後台手動退款。

type Order = {
  orderId: string;
  courseId?: string;
  courseTitle?: string;
  itemType?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string | null;
  pointsUsed?: number;
  status?: string;
  refundStatus?: string;
  refundReason?: string;
  refundRequestedAt?: string;
  refundNote?: string;
  refundedAt?: string;
  riskWarning?: string;
  createdAt?: string;
};

const REFUNDABLE = ['PAID', 'COMPLETED'];
const OPEN_REFUND = ['REQUESTED', 'PROCESSING', 'MANUAL_REVIEW', 'APPROVED'];

const REFUND_STATUS_LABEL: Record<string, string> = {
  REQUESTED: '審核中',
  PROCESSING: '處理中',
  MANUAL_REVIEW: '人工審查中',
  APPROVED: '已核准退款',
  REJECTED: '申請未通過',
};

const REFUND_STATUS_BADGE: Record<string, string> = {
  REQUESTED: 'bg-yellow-100 text-yellow-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  MANUAL_REVIEW: 'bg-orange-100 text-orange-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-gray-200 text-gray-700',
};

function fmt(ts?: string) {
  if (!ts) return '-';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

function paymentLabel(o: Order) {
  if (o.paymentMethod === 'points') return `點數 ${o.pointsUsed ?? 0} 點`;
  return `${o.amount ?? 0} ${o.currency || 'TWD'}（${o.paymentMethod || '線上付款'}）`;
}

export default function RefundsClient({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // 一般使用者的 userId 會被 API 強制換成 session 本人，這裡帶上只是讓管理員也看到自己的訂單。
      const res = await fetch(`/api/orders?userId=${encodeURIComponent(userId)}&limit=100`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `載入失敗 (${res.status})`);
      const list: Order[] = Array.isArray(data.data) ? data.data : [];
      list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      setOrders(list);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const { requestable, history } = useMemo(() => {
    const requestable = orders.filter(
      (o) =>
        REFUNDABLE.includes((o.status || '').toUpperCase()) &&
        !OPEN_REFUND.includes(o.refundStatus || '') &&
        // B2B 席次報名沒有付款或點數，不能退款
        o.paymentMethod !== 'b2b_seat'
    );
    const history = orders.filter((o) => !!o.refundStatus || o.status === 'REFUNDED');
    return { requestable, history };
  }, [orders]);

  const submitRequest = async (order: Order) => {
    const reason = (reasons[order.orderId] || '').trim();
    if (!reason) {
      alert('請填寫退款原因');
      return;
    }
    if (!confirm(`確定要對訂單 ${order.courseTitle || order.orderId} 申請退款嗎？\n送出後將由管理員審核。`)) return;

    setSubmittingId(order.orderId);
    setResultMessage(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(order.orderId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_refund', reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `送出失敗 (${res.status})`);
      let text = '退款申請已送出，管理員審核後會更新狀態。';
      if (data.order?.riskWarning) text += `\n⚠️ ${data.order.riskWarning}`;
      setResultMessage({ ok: true, text });
      setReasons((prev) => ({ ...prev, [order.orderId]: '' }));
      if (data.order?.orderId) {
        setOrders((prev) => prev.map((o) => (o.orderId === data.order.orderId ? { ...o, ...data.order } : o)));
      } else {
        load();
      }
    } catch (err) {
      setResultMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8 max-w-[1200px]">
      <h1 className="text-3xl font-bold mb-6">退款申請 (Refund Requests)</h1>

      <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-4 mb-6 text-sm leading-relaxed">
        <p>送出申請後訂單與點數不會立即變動，需由管理員審核。</p>
        <p>核准後：點數付款會退回點數；線上付款的款項由客服至金流商後台辦理退款，入帳時間依各金流商而定。</p>
        <p>24 小時內多次申請退款或取消，系統會暫時鎖定退款功能 24 小時。</p>
        {isAdmin && (
          <p className="mt-2">
            管理員請至 <Link href="/admin/refunds" className="underline font-medium">退款管理</Link> 審核申請。
          </p>
        )}
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

      {loadError && <div className="text-red-600 text-sm mb-4">載入失敗：{loadError}</div>}

      <section className="bg-white p-6 rounded-lg shadow mb-8">
        <div className="flex items-center justify-between mb-4 border-b pb-2">
          <h2 className="text-xl font-semibold">1. 可申請退款的訂單</h2>
          <button className="bg-gray-100 hover:bg-gray-200 border px-3 py-1 rounded text-sm" onClick={load} disabled={loading}>
            {loading ? '載入中...' : '重新整理'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <th className="px-3 py-2">課程 / 訂單</th>
                <th className="px-3 py-2">付款</th>
                <th className="px-3 py-2">建立時間</th>
                <th className="px-3 py-2">退款原因</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {requestable.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-gray-400">
                    {loading ? '載入中...' : '目前沒有可申請退款的訂單'}
                  </td>
                </tr>
              ) : (
                requestable.map((o) => (
                  <tr key={o.orderId} className="align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{o.courseTitle || o.courseId || o.itemType || '訂單'}</div>
                      <div className="font-mono text-xs text-gray-500 break-all">{o.orderId}</div>
                      {o.refundStatus === 'REJECTED' && (
                        <div className="text-xs text-gray-600 mt-1">
                          先前申請未通過{o.refundNote ? `：${o.refundNote}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">{paymentLabel(o)}</td>
                    <td className="px-3 py-2 text-gray-500">{fmt(o.createdAt)}</td>
                    <td className="px-3 py-2">
                      <textarea
                        className="w-full min-w-[220px] border rounded px-2 py-1"
                        rows={2}
                        maxLength={500}
                        placeholder="請說明退款原因"
                        value={reasons[o.orderId] || ''}
                        onChange={(e) => setReasons((prev) => ({ ...prev, [o.orderId]: e.target.value }))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm disabled:bg-gray-400"
                        disabled={submittingId === o.orderId}
                        onClick={() => submitRequest(o)}
                      >
                        {submittingId === o.orderId ? '送出中...' : '申請退款'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2">2. 申請紀錄 (History)</h2>
        <div className="space-y-4">
          {history.length === 0 ? (
            <div className="text-center py-10 text-gray-400">尚無紀錄</div>
          ) : (
            history.map((o) => {
              const status = o.refundStatus || (o.status === 'REFUNDED' ? 'APPROVED' : '');
              return (
                <div key={o.orderId} className="border rounded-lg p-4 text-sm bg-gray-50">
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${REFUND_STATUS_BADGE[status] || 'bg-gray-100'}`}>
                      {REFUND_STATUS_LABEL[status] || status || '-'}
                    </span>
                    <span className="text-gray-400 text-xs">申請時間：{fmt(o.refundRequestedAt)}</span>
                  </div>
                  <div className="space-y-1">
                    <p><strong>課程：</strong> {o.courseTitle || o.courseId || '-'}</p>
                    <p><strong>訂單：</strong> <code className="bg-gray-200 px-1 rounded text-xs">{o.orderId}</code></p>
                    <p><strong>付款：</strong> {paymentLabel(o)}</p>
                    {o.refundReason && <p><strong>原因：</strong> {o.refundReason}</p>}
                    {o.refundNote && <p><strong>管理員備註：</strong> {o.refundNote}</p>}
                    {o.refundedAt && <p><strong>退款時間：</strong> {fmt(o.refundedAt)}</p>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

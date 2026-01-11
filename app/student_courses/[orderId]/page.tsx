"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type Order = {
  orderId?: string;
  orderNumber?: string;
  userId?: string;
  courseId?: string;
  enrollmentId?: string;
  amount?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
};

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.orderId as string | undefined;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    fetch(`/api/orders/${encodeURIComponent(orderId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.ok) {
          setOrder(data.order || data.data || data);
        } else if (data && data.order) {
          setOrder(data.order);
        } else {
          setOrder(null);
        }
      })
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (!orderId) {
    return (
      <div className="page">
        <p>找不到訂單 ID。</p>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="section">
        <button className="card-button" onClick={() => router.back()} style={{ marginBottom: 12 }}>
          返回
        </button>

        {loading ? (
          <p>讀取中…</p>
        ) : error ? (
          <p style={{ color: 'red' }}>讀取失敗：{error}</p>
        ) : !order ? (
          <p>找不到訂單資料。</p>
        ) : (
          <div className="card">
            <h2>訂單細節</h2>
            <div style={{ marginTop: 8 }}>
              {/* Workflow visualization */}
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ margin: '8px 0' }}>訂單流程</h3>
                {
                  (() => {
                    const mainSteps = ['Created', 'Pending', 'Paid', 'Completed'];
                    const status = (order.status || 'PENDING').toUpperCase();
                    const terminal = ['REFUNDED', 'FAILED'];

                    // determine indices
                    let currentIndex = 0; // index in mainSteps
                    if (status === 'PENDING') currentIndex = 1;
                    else if (status === 'PAID') currentIndex = 2;
                    else if (status === 'COMPLETED') currentIndex = 3;

                    const isCancelled = status === 'CANCELLED';
                    const isRefunded = status === 'REFUNDED';

                    // detect whether a cancel event exists in payments
                    const cancelUsed = (() => {
                      if (isCancelled) return true;
                      if (order.payments && Array.isArray(order.payments)) {
                        return order.payments.some((p: any) => {
                          const a = (p.action || '').toString().toLowerCase();
                          const s = (p.status || '').toString().toLowerCase();
                          return a.includes('cancel') || s.includes('cancel');
                        });
                      }
                      return false;
                    })();

                    // choose which cancel node to mark when cancelUsed: after currentIndex (or last possible)
                    const cancelPosition = Math.min(Math.max(currentIndex, 0), mainSteps.length - 1);

                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {mainSteps.map((s, i) => {
                          const done = i < currentIndex || (!isCancelled && i <= currentIndex && status === 'COMPLETED');
                          const active = i === currentIndex && !isCancelled && !isRefunded;

                          return (
                            <span key={`step-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                background: done || active ? '#0366d6' : '#fff',
                                color: done || active ? '#fff' : '#333',
                                border: '2px solid #0366d6',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                              }}>{done ? '✓' : (active ? (i + 1) : (i + 1))}</div>
                              <div style={{ minWidth: 80 }}>{s}</div>

                              {/* Render cancel node between steps */}
                              {i < mainSteps.length - 1 && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 40, height: 2, background: i < currentIndex - 1 ? '#0366d6' : '#ddd' }} />
                                  <div style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 9,
                                    background: (cancelUsed && i === cancelPosition) ? '#d84c3d' : '#fff',
                                    color: (cancelUsed && i === cancelPosition) ? '#fff' : '#d84c3d',
                                    border: '2px solid #d84c3d',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 12,
                                  }}>{(cancelUsed && i === cancelPosition) ? '✕' : '✕'}</div>
                                  <div style={{ width: 40, height: 2, background: '#ddd' }} />
                                </span>
                              )}
                            </span>
                          );
                        })}

                        {/* After Completed, show Refund node */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 40, height: 2, background: currentIndex >= 3 ? '#0366d6' : '#ddd' }} />
                          <div style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            background: isRefunded ? '#d84c3d' : '#fff',
                            color: isRefunded ? '#fff' : '#d84c3d',
                            border: '2px solid #d84c3d',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                          }}>{isRefunded ? 'R' : 'R'}</div>
                          <div style={{ minWidth: 80, color: '#d84c3d' }}>Refund</div>
                        </div>

                        {terminal.includes(status) && (
                          <div style={{ marginLeft: 8, padding: '6px 10px', background: '#fee', border: '1px solid #f99', borderRadius: 6 }}>
                            <strong>{status}</strong>
                            <div style={{ fontSize: 12 }}>此訂單處於終止狀態，最終動作：{status === 'REFUNDED' ? '已退款' : '失敗'}</div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                }
                <div style={{ marginTop: 8, fontSize: 13 }}><strong>最後動作：</strong> {order.status || '-'} • {order.updatedAt ? new Date(order.updatedAt).toLocaleString() : (order.createdAt ? new Date(order.createdAt).toLocaleString() : '-')}</div>
              </div>
              <div><strong>訂單編號：</strong> {order.orderNumber || order.orderId}</div>
              <div><strong>Order ID：</strong> {order.orderId}</div>
              <div><strong>使用者：</strong> {order.userId || '-'}</div>
              <div><strong>Enrollment ID：</strong> {order.enrollmentId || '-'}</div>
              <div><strong>課程 ID：</strong> {order.courseId || '-'}</div>
              <div><strong>金額：</strong> {order.amount != null ? `${order.amount} ${order.currency || 'TWD'}` : '-'}</div>
              <div><strong>狀態：</strong> {order.status || '-'}</div>
              <div><strong>建立時間：</strong> {order.createdAt ? new Date(order.createdAt).toLocaleString() : '-'}</div>
              <div><strong>更新時間：</strong> {order.updatedAt ? new Date(order.updatedAt).toLocaleString() : '-'}</div>

              {/* Payment history table */}
              <div style={{ marginTop: 12 }}>
                <h3>付款紀錄</h3>
                {
                  (() => {
                    type PayRow = { time?: string; action?: string; amount?: number; currency?: string; status?: string; note?: string };
                    let rows: PayRow[] = [];
                    if (order.payments && Array.isArray(order.payments) && order.payments.length > 0) {
                      rows = order.payments.map((p: any) => ({
                        time: p.time || p.createdAt || p.timestamp || p.date,
                        action: p.action || p.type || p.event || 'payment',
                        amount: p.amount != null ? p.amount : order.amount,
                        currency: p.currency || order.currency,
                        status: p.status || p.result || '',
                        note: p.note || p.memo || '',
                      }));
                    } else {
                      // build minimal history from createdAt and updatedAt/status
                      rows.push({ time: order.createdAt, action: 'Order Created', amount: order.amount, currency: order.currency, status: 'CREATED' });
                      if (order.updatedAt && order.updatedAt !== order.createdAt) {
                        rows.push({ time: order.updatedAt, action: `Status: ${order.status || ''}`, amount: order.amount, currency: order.currency, status: order.status });
                      }
                    }

                    if (!rows || rows.length === 0) return <div>沒有付款紀錄。</div>;

                    return (
                      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd', marginTop: 8 }}>
                        <thead>
                          <tr>
                            <th style={{ border: '1px solid #ddd', padding: '6px' }}>時間</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px' }}>事件</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px' }}>金額</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px' }}>幣別</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px' }}>狀態</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px' }}>備註</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={i}>
                              <td style={{ border: '1px solid #ddd', padding: '6px' }}>{r.time ? new Date(r.time).toLocaleString() : '-'}</td>
                              <td style={{ border: '1px solid #ddd', padding: '6px' }}>{r.action || '-'}</td>
                              <td style={{ border: '1px solid #ddd', padding: '6px' }}>{r.amount != null ? `${r.amount}` : '-'}</td>
                              <td style={{ border: '1px solid #ddd', padding: '6px' }}>{r.currency || '-'}</td>
                              <td style={{ border: '1px solid #ddd', padding: '6px' }}>{r.status || '-'}</td>
                              <td style={{ border: '1px solid #ddd', padding: '6px' }}>{r.note || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()
                }
              </div>
            </div>

            {order.metadata && (
              <div style={{ marginTop: 12 }}>
                <h3>其他資料</h3>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(order.metadata, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

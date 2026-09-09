"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@/components/IntlProvider';
import { useDateFormat } from '@/lib/hooks/useDateFormat';

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
  const t = useT();
  const dateFmt = useDateFormat();
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
        <p>{t('order_detail_no_id')}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="section">
        <button className="card-button" onClick={() => router.back()} style={{ marginBottom: 12 }}>
          {t('back')}
        </button>

        {loading ? (
          <p>{t('loading')}</p>
        ) : error ? (
          <p style={{ color: 'red' }}>{t('order_detail_load_failed')}{error}</p>
        ) : !order ? (
          <p>{t('order_detail_not_found')}</p>
        ) : (
          <div className="card">
            <h2>{t('order_detail_title')}</h2>
            <div style={{ marginTop: 8 }}>
              {/* Workflow visualization */}
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ margin: '8px 0' }}>{t('order_detail_flow')}</h3>
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
                            <div style={{ fontSize: 12 }}>{t('order_detail_terminal_note', { action: status === 'REFUNDED' ? t('order_detail_terminal_refunded') : t('order_detail_terminal_failed') })}</div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                }
                <div style={{ marginTop: 8, fontSize: 13 }}><strong>{t('order_detail_last_action')}</strong> {order.status || '-'} • {order.updatedAt ? dateFmt.formatDateTime(order.updatedAt) : (order.createdAt ? dateFmt.formatDateTime(order.createdAt) : '-')}</div>
              </div>
              <div><strong>{t('student_courses_order_number')}{t('label_colon')}</strong> {order.orderNumber || order.orderId}</div>
              <div><strong>Order ID{t('label_colon')}</strong> {order.orderId}</div>
              <div><strong>{t('user')}{t('label_colon')}</strong> {order.userId || '-'}</div>
              <div><strong>{t('enrollment_id')}{t('label_colon')}</strong> {order.enrollmentId || '-'}</div>
              <div><strong>{t('course_id')}{t('label_colon')}</strong> {order.courseId || '-'}</div>
              <div><strong>{t('student_courses_amount')}{t('label_colon')}</strong> {order.amount != null ? `${order.amount} ${order.currency || 'TWD'}` : '-'}</div>
              <div><strong>{t('student_courses_status')}{t('label_colon')}</strong> {order.status || '-'}</div>
              <div><strong>{t('student_courses_created_at')}{t('label_colon')}</strong> {order.createdAt ? dateFmt.formatDateTime(order.createdAt) : '-'}</div>
              <div><strong>{t('update_time')}{t('label_colon')}</strong> {order.updatedAt ? dateFmt.formatDateTime(order.updatedAt) : '-'}</div>

              {/* Payment history table */}
              <div style={{ marginTop: 12 }}>
                <h3>{t('order_detail_payments')}</h3>
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

                    if (!rows || rows.length === 0) return <div>{t('order_detail_no_payments')}</div>;

                    return (
                      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd', marginTop: 8 }}>
                        <thead>
                          <tr>
                            <th style={{ border: '1px solid #ddd', padding: '6px' }}>{t('time')}</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px' }}>{t('event')}</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px' }}>{t('student_courses_amount')}</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px' }}>{t('currency_label')}</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px' }}>{t('student_courses_status')}</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px' }}>{t('notes')}</th>
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
                <h3>{t('order_detail_other_data')}</h3>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(order.metadata, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

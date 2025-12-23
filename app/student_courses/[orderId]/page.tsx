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
              <div><strong>訂單編號：</strong> {order.orderNumber || order.orderId}</div>
              <div><strong>Order ID：</strong> {order.orderId}</div>
              <div><strong>使用者：</strong> {order.userId || '-'}</div>
              <div><strong>Enrollment ID：</strong> {order.enrollmentId || '-'}</div>
              <div><strong>課程 ID：</strong> {order.courseId || '-'}</div>
              <div><strong>金額：</strong> {order.amount != null ? `${order.amount} ${order.currency || 'TWD'}` : '-'}</div>
              <div><strong>狀態：</strong> {order.status || '-'}</div>
              <div><strong>建立時間：</strong> {order.createdAt ? new Date(order.createdAt).toLocaleString() : '-'}</div>
              <div><strong>更新時間：</strong> {order.updatedAt ? new Date(order.updatedAt).toLocaleString() : '-'}</div>
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

"use client";

import { useEffect, useState } from 'react';
import { getStoredUser, type StoredUser } from '@/lib/mockAuth';
import EnrollmentManager from '@/components/EnrollmentManager';
import SimulationButtons from '@/components/SimulationButtons';
import Link from 'next/link';

type Order = {
  orderId: string;
  orderNumber?: string;
  userId?: string;
  courseId?: string;
  amount?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<StoredUser | null>(() => getStoredUser());

  // listen for auth changes to update user state
  useEffect(() => {
    function onAuth() {
      setUser(getStoredUser());
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('tutor:auth-changed', onAuth);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('tutor:auth-changed', onAuth);
      }
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    // Fetch server-side filtered orders: admin gets all, others get their own orders
    const current = getStoredUser();
    const isAdmin = current?.role === 'admin';
    const baseUrl = '/api/orders?limit=50';
    const url = isAdmin ? baseUrl : `${baseUrl}&userId=${encodeURIComponent(current?.email || '')}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        let list: Order[] = [];
        if (data && data.ok) list = data.data || data || [];
        else if (data && data.data) list = data.data || [];
        // server should already filter when not admin; still normalize just in case
        try {
          if (current?.role === 'admin') {
            setOrders(list);
          } else if (current?.email) {
            const email = current.email.toLowerCase();
            setOrders(list.filter(o => (o.userId || '').toLowerCase() === email));
          } else {
            setOrders([]);
          }
        } catch (e) {
          setOrders([]);
        }
      })
      .catch((err) => setError(String(err?.message || err)))
      .finally(() => setLoading(false));
  }, [user?.email]);

  // Always render the same header structure to avoid hydration mismatches
  return (
    <div className="page">
      <section className="section">
        {!user ? (
          <>
            <p>請先登入以檢視你的訂單紀錄。</p>
            <p>
              <Link href="/login">前往登入</Link>
            </p>
          </>
        ) : loading ? (
          <p>讀取中…</p>
        ) : error ? (
          <p>讀取失敗：{error}</p>
        ) : !orders || orders.length === 0 ? (
          <p>目前沒有訂單紀錄。</p>
        ) : (
          <>
            <section style={{ marginBottom: 16 }}>
              <h2>報名與訂單操作（示範）</h2>
              <p>下面提供示範按鈕與報名管理器，用於建立測試報名與訂單（僅在開發模式）。</p>
              <SimulationButtons />
            </section>

            <section style={{ marginBottom: 16 }}>
              <EnrollmentManager />
            </section>

            <table className="orders-table" style={{ borderCollapse: 'collapse', border: '2px solid #ccc', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>使用者</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>訂單編號</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>課程 / ID</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>金額</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>狀態</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>建立時間</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.orderId}>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.userId || user?.email || '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>
                      <Link href={`/orders/${o.orderId}`}>{o.orderId}</Link>
                    </td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.courseId ?? '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.amount ? `${o.amount} ${o.currency ?? 'TWD'}` : '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.status ?? '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.createdAt ? new Date(o.createdAt).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}

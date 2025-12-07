"use client";

import { useEffect, useState } from 'react';
import { getStoredUser, type StoredUser } from '@/lib/mockAuth';
import Link from 'next/link';

type Order = {
  orderId: string;
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
    fetch('/api/orders?limit=50')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.ok) {
          setOrders(data.data || data);
        } else if (data && data.data) {
          setOrders(data.data || []);
        } else {
          setOrders([]);
        }
      })
      .catch((err) => setError(String(err?.message || err)))
      .finally(() => setLoading(false));
  }, [user?.email]);

  // Always render the same header structure to avoid hydration mismatches
  return (
    <div className="page">
      <header className="page-header">
        <h1>訂單紀錄</h1>
        <p>
          {user
            ? '以下顯示你的近期訂單（開發模式可能來自本機 `.local_data/orders.json`）。'
            : ''}
        </p>
      </header>

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
          <table className="orders-table">
            <thead>
              <tr>
                <th>訂單編號</th>
                <th>課程 / ID</th>
                <th>金額</th>
                <th>狀態</th>
                <th>建立時間</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.orderId}>
                  <td>{o.orderId}</td>
                  <td>{o.courseId ?? '-'}</td>
                  <td>{o.amount ? `${o.amount} ${o.currency ?? 'TWD'}` : '-'}</td>
                  <td>{o.status ?? '-'}</td>
                  <td>{o.createdAt ? new Date(o.createdAt).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

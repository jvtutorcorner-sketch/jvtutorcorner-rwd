"use client";

import { useEffect, useState } from "react";
import Link from 'next/link';

type Order = {
  orderId?: string;
  orderNumber?: string;
  id?: string;
  userId?: string;
  enrollmentId?: string;
  courseId?: string;
  amount?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

export default function OrdersManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<number>(20);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterEnrollmentId, setFilterEnrollmentId] = useState<string>('');
  const [filterUserId, setFilterUserId] = useState<string>('');
  const [filterCourseId, setFilterCourseId] = useState<string>('');
  const [filterOrderId, setFilterOrderId] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  async function load(key: string | null = null) {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      q.set('limit', String(limit));
      if (key) q.set('lastKey', key);
      // add filters
      if (filterStatus) q.set('status', filterStatus);
      if (filterEnrollmentId) q.set('enrollmentId', filterEnrollmentId);
      if (filterUserId) q.set('userId', filterUserId);
      if (filterCourseId) q.set('courseId', filterCourseId);
      if (filterOrderId) q.set('orderId', filterOrderId);
      if (filterStartDate) q.set('startDate', filterStartDate + 'T00:00:00.000Z');
      if (filterEndDate) q.set('endDate', filterEndDate + 'T23:59:59.999Z');
      const res = await fetch(`/api/orders?${q.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load orders');
      setOrders(data.data || []);
      setLastKey(data.lastKey || null);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // initial load
    load();
    // clear history
    setHistory([]);
  }, [limit]);

  function handleSearch() {
    // reset pagination and history
    setHistory([]);
    load(null);
  }

  function toIsoDateString(localDate: string) {
    // input from <input type=date> is YYYY-MM-DD, convert to ISO date-time start/end
    if (!localDate) return '';
    // start: YYYY-MM-DDT00:00:00.000Z  ; end: YYYY-MM-DDT23:59:59.999Z
    return localDate;
  }

  function exportCSV() {
    if (!orders || orders.length === 0) {
      alert('沒有可匯出的訂單');
      return;
    }

    const headers = ['orderNumber','orderId', 'enrollmentId', 'courseId', 'amount', 'currency', 'status', 'createdAt', 'updatedAt'];
    const rows = orders.map((o) => [
      o.orderNumber || o.orderId || o.id || '',
      o.orderId || o.id || '',
      o.enrollmentId || '',
      o.courseId || '',
      o.amount != null ? String(o.amount) : '',
      o.currency || '',
      o.status || '',
      o.createdAt || '',
      o.updatedAt || '',
    ]);

    const csvContent = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_export_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleNext() {
    if (!lastKey) return;
    // push current lastKey to history to allow going back
    setHistory((h) => [...h, lastKey]);
    load(lastKey);
  }

  function handlePrev() {
    // pop last history entry and load with the previous key
    setHistory((h) => {
      if (h.length === 0) return h;
      const newH = [...h];
      newH.pop();
      const prevKey = newH.length > 0 ? newH[newH.length - 1] : null;
      load(prevKey);
      return newH;
    });
  }

  async function patchOrder(orderId: string, status: string) {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update order');
      alert('Order updated');
      load();
    } catch (err: any) {
      alert('Update order error: ' + (err?.message || err));
    }
  }

  function confirmAndPatch(orderId: string | undefined, label: string, status: string) {
    if (!orderId) return;
    const ok = typeof window !== 'undefined' ? window.confirm(`確定要 ${label} 嗎？這個操作不可逆。`) : true;
    if (!ok) return;
    patchOrder(orderId, status);
  }

  return (
    <div>
      <h3>訂單管理</h3>
      <div style={{ marginBottom: 8 }}>
        <label>每頁顯示: </label>
        <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value, 10))}>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ marginRight: 8 }}>Status:</label>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ marginRight: 12 }}>
          <option value="">All</option>
          <option value="PENDING">PENDING</option>
          <option value="PAID">PAID</option>
          <option value="CANCELLED">CANCELLED</option>
          <option value="REFUNDED">REFUNDED</option>
          <option value="FAILED">FAILED</option>
        </select>

        <label style={{ marginRight: 8 }}>EnrollmentId:</label>
        <input value={filterEnrollmentId} onChange={(e) => setFilterEnrollmentId(e.target.value)} placeholder="enrollmentId" style={{ marginRight: 12 }} />

        <label style={{ marginRight: 8 }}>OrderId:</label>
        <input value={filterOrderId} onChange={(e) => setFilterOrderId(e.target.value)} placeholder="orderId" style={{ marginRight: 12 }} />

        <div style={{ display: 'inline-block', marginLeft: 8 }}>
          <label style={{ marginRight: 6 }}>From:</label>
          <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} style={{ marginRight: 8 }} />
          <label style={{ marginRight: 6 }}>To:</label>
          <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} style={{ marginRight: 8 }} />
        </div>

        <button onClick={handleSearch} style={{ marginLeft: 8 }}>搜尋</button>
        <button onClick={() => exportCSV()} style={{ marginLeft: 8 }}>導出 CSV</button>
      </div>

      {loading && <p>載入中…</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <table className="orders-table" style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ddd', padding: '8px 6px', textAlign: 'left' }}>OrderId</th>
                <th style={{ border: '1px solid #ddd', padding: '8px 6px', textAlign: 'left' }}>EnrollmentId</th>
                <th style={{ border: '1px solid #ddd', padding: '8px 6px', textAlign: 'left' }}>CourseId</th>
                <th style={{ border: '1px solid #ddd', padding: '8px 6px', textAlign: 'left' }}>Amount</th>
                <th style={{ border: '1px solid #ddd', padding: '8px 6px', textAlign: 'left' }}>Currency</th>
                <th style={{ border: '1px solid #ddd', padding: '8px 6px', textAlign: 'left' }}>Status</th>
                <th style={{ border: '1px solid #ddd', padding: '8px 6px', textAlign: 'left' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, idx) => (
                  <tr key={o.orderId || o.id || idx}>
                  <td style={{ padding: '8px 6px', border: '1px solid #ddd' }}>
                    <Link href={`/admin/orders/${o.orderId}`}>{o.orderNumber || o.orderId || o.id}</Link>
                  </td>
                  <td style={{ padding: '8px 6px', border: '1px solid #ddd' }}>{o.enrollmentId}</td>
                  <td style={{ padding: '8px 6px', border: '1px solid #ddd' }}>{o.courseId}</td>
                  <td style={{ padding: '8px 6px', border: '1px solid #ddd' }}>{o.amount}</td>
                  <td style={{ padding: '8px 6px', border: '1px solid #ddd' }}>{o.currency}</td>
                  <td style={{ padding: '8px 6px', border: '1px solid #ddd' }}>{o.status}</td>
                  <td style={{ padding: '8px 6px', border: '1px solid #ddd' }}>
                    <button onClick={() => confirmAndPatch(o.orderId, '標示為已付款', 'PAID')} style={{ marginRight: 8 }}>Set PAID</button>
                    <button onClick={() => confirmAndPatch(o.orderId, '取消訂單', 'CANCELLED')} style={{ marginRight: 8 }}>Cancel</button>
                    <button onClick={() => confirmAndPatch(o.orderId, '退款', 'REFUNDED')}>Refund</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

      <div style={{ marginTop: 12 }}>
        <button onClick={handlePrev} disabled={history.length === 0} style={{ marginRight: 8 }}>Previous</button>
        <button onClick={handleNext} disabled={!lastKey}>Next</button>
      </div>
    </div>
  );
}

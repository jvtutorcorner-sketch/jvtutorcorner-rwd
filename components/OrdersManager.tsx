"use client";

import { useEffect, useState } from "react";
import Link from 'next/link';
import { COURSES } from '../data/courses';
import { useT } from './IntlProvider';

type Order = {
  orderId?: string;
  orderNumber?: string;
  id?: string;
  userId?: string;
  userName?: string;
  enrollmentId?: string;
  courseId?: string;
  courseTitle?: string;
  amount?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

export default function OrdersManager() {
  const t = useT();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<number>(20);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('');

  const [filterUserId, setFilterUserId] = useState<string>('');
  const [filterCourseId, setFilterCourseId] = useState<string>('');
  const [filterOrderId, setFilterOrderId] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  async function load(key: string | null = null) {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      q.set('limit', String(limit));
      if (key) q.set('lastKey', key);
      // add filters
      if (filterStatus) q.set('status', filterStatus);

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

  // build course id -> title map (local fallback if API doesn't resolve)
  const courseTitleMap = new Map<string, string>(COURSES.map((c) => [c.id, c.title]));

  useEffect(() => {
    // initial load
    load();
    // clear history
    setHistory([]);
  }, [limit]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: any) => {
      const updated = e?.detail;
      if (updated && updated.orderId) {
        setOrders((prev) => prev.map((o) => (o.orderId === updated.orderId ? updated : o)));
      }
    };
    const reloadHandler = () => load();
    window.addEventListener('tutor:order-updated', handler as EventListener);
    window.addEventListener('tutor:orders-changed', reloadHandler as EventListener);
    return () => {
      window.removeEventListener('tutor:order-updated', handler as EventListener);
      window.removeEventListener('tutor:orders-changed', reloadHandler as EventListener);
    };
  }, []);

  function handleSearch() {
    // reset pagination and history
    setHistory([]);
    load(null);
  }

  function exportCSV() {
    if (!orders || orders.length === 0) {
      alert(t('no_orders_to_export'));
      return;
    }

    const headers = ['orderNumber', 'orderId', 'userName', 'courseTitle', 'amount', 'currency', 'status', 'createdAt', 'updatedAt'];
    const rows = orders.map((o) => [
      o.orderNumber || o.orderId || o.id || '',
      o.orderId || o.id || '',
      o.userName || o.userId || '',
      o.courseTitle || (o.courseId && courseTitleMap.get(o.courseId)) || o.courseId || '',
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
    a.download = `orders_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleNext() {
    if (!lastKey) return;
    setHistory((h) => [...h, lastKey]);
    load(lastKey);
  }

  function handlePrev() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const newH = [...h];
      newH.pop();
      const prevKey = newH.length > 0 ? newH[newH.length - 1] : null;
      load(prevKey);
      return newH;
    });
  }

  function mapStatusToAction(status: string) {
    const s = (status || '').toUpperCase();
    if (s === 'PAID') return 'payment_capture';
    if (s === 'COMPLETED') return 'complete';
    if (s === 'CANCELLED') return 'cancel';
    if (s === 'REFUNDED') return 'refund';
    return 'update';
  }

  function confirmAndPatch(order: Order | undefined, label: string, status: string) {
    if (!order || !order.orderId) return;
    const ok = typeof window !== 'undefined' ? window.confirm(`${t('confirm_action')} ${label}${t('action_irreversible')}`) : true;
    if (!ok) return;

    const payment = {
      time: new Date().toISOString(),
      action: mapStatusToAction(status),
      amount: order.amount != null ? order.amount : 0,
      currency: order.currency || 'TWD',
      status,
      note: `Admin action: ${label}`,
    } as any;

    patchOrderWithPayment(order.orderId, status, payment);
  }

  async function patchOrderWithPayment(orderId: string, status: string, payment?: any) {
    try {
      const body: any = { status };
      if (payment) body.payment = payment;
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update order');
      alert(t('order_updated'));
      setEditingOrderId(null);
      if (data && data.order) {
        setOrders((prev) => prev.map((o) => (o.orderId === orderId ? data.order : o)));
      } else {
        load();
      }
    } catch (err: any) {
      alert('Update order error: ' + (err?.message || err));
    }
  }

  // Button styles
  const btnStyle = {
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.2s',
    marginRight: '8px',
  };

  const primaryBtn = { ...btnStyle, backgroundColor: '#007bff', color: '#fff' };
  const successBtn = { ...btnStyle, backgroundColor: '#28a745', color: '#fff' };
  const dangerBtn = { ...btnStyle, backgroundColor: '#dc3545', color: '#fff' };
  const warningBtn = { ...btnStyle, backgroundColor: '#ffc107', color: '#000' };
  const secondaryBtn = { ...btnStyle, backgroundColor: '#6c757d', color: '#fff' };

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', padding: '24px' }}>
      <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px', color: '#1a202c' }}>{t('order_management')}</h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', backgroundColor: '#f7fafc', padding: '20px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '13px', color: '#4a5568' }}>{t('per_page')}</label>
          <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value, 10))} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '13px', color: '#4a5568' }}>{t('status')}</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <option value="">{t('all')}</option>
            <option value="PENDING">PENDING</option>
            <option value="PAID">PAID</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="REFUNDED">REFUNDED</option>
            <option value="FAILED">FAILED</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '13px', color: '#4a5568' }}>OrderId 搜尋</label>
          <input value={filterOrderId} onChange={(e) => setFilterOrderId(e.target.value)} placeholder="輸入訂單編號" style={{ padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '13px', color: '#4a5568' }}>{t('from')}</label>
          <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '13px', color: '#4a5568' }}>{t('to')}</label>
          <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
          <button onClick={handleSearch} style={{ ...primaryBtn, margin: 0 }}>{t('search')}</button>
          <button onClick={() => exportCSV()} style={{ ...secondaryBtn, margin: 0 }}>{t('export_csv')}</button>
        </div>
      </div>

      {loading && <p style={{ color: '#4a5568', fontStyle: 'italic' }}>{t('loading')}</p>}
      {error && <p style={{ color: '#e53e3e', fontSize: '14px' }}>{error}</p>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              <th style={{ padding: '12px 16px', borderBottom: '2px solid #edf2f7', textAlign: 'left', fontSize: '12px', color: '#718096', textTransform: 'uppercase' }}>{t('order_id')}</th>
              <th style={{ padding: '12px 16px', borderBottom: '2px solid #edf2f7', textAlign: 'left', fontSize: '12px', color: '#718096', textTransform: 'uppercase' }}>學員</th>
              <th style={{ padding: '12px 16px', borderBottom: '2px solid #edf2f7', textAlign: 'left', fontSize: '12px', color: '#718096', textTransform: 'uppercase' }}>課程</th>
              <th style={{ padding: '12px 16px', borderBottom: '2px solid #edf2f7', textAlign: 'left', fontSize: '12px', color: '#718096', textTransform: 'uppercase' }}>{t('amount')}</th>
              <th style={{ padding: '12px 16px', borderBottom: '2px solid #edf2f7', textAlign: 'left', fontSize: '12px', color: '#718096', textTransform: 'uppercase' }}>{t('status')}</th>
              <th style={{ padding: '12px 16px', borderBottom: '2px solid #edf2f7', textAlign: 'left', fontSize: '12px', color: '#718096', textTransform: 'uppercase' }}>{t('create_time')}</th>
              <th style={{ padding: '12px 16px', borderBottom: '2px solid #edf2f7', textAlign: 'right', fontSize: '12px', color: '#718096', textTransform: 'uppercase' }}>{t('actions')}</th>
            </tr>
          </thead>
          <tbody style={{ fontSize: '14px', color: '#2d3748' }}>
            {orders.map((o, idx) => (
              <tr key={o.orderId || o.id || idx} style={{ borderBottom: '1px solid #f0f4f8' }}>
                <td style={{ padding: '16px' }}>
                  <Link href={`/admin/orders/${o.orderId}`} style={{ color: '#3182ce', fontWeight: 600, textDecoration: 'none' }}>
                    {o.orderId || o.id}
                  </Link>
                </td>
                <td style={{ padding: '16px' }}>{o.userName || o.userId || '-'}</td>
                <td style={{ padding: '16px' }}>{o.courseTitle || (o.courseId && courseTitleMap.get(o.courseId)) || o.courseId || '-'}</td>
                <td style={{ padding: '16px' }}>{o.currency} {o.amount?.toLocaleString()}</td>
                <td style={{ padding: '16px' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '9999px',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: o.status === 'PAID' ? '#c6f6d5' : o.status === 'PENDING' ? '#feebc8' : '#fed7d7',
                    color: o.status === 'PAID' ? '#22543d' : o.status === 'PENDING' ? '#744210' : '#822727'
                  }}>
                    {o.status}
                  </span>
                </td>
                <td style={{ padding: '16px' }}>{o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '-'}</td>
                <td style={{ padding: '16px', textAlign: 'right' }}>
                  {editingOrderId === o.orderId ? (
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                      <button onClick={() => confirmAndPatch(o, t('mark_as_paid'), 'PAID')} style={successBtn}>{t('set_paid')}</button>
                      <button onClick={() => confirmAndPatch(o, t('cancel_order'), 'CANCELLED')} style={dangerBtn}>{t('cancel')}</button>
                      <button onClick={() => confirmAndPatch(o, t('refund'), 'REFUNDED')} style={warningBtn}>{t('refund')}</button>
                      <button onClick={() => setEditingOrderId(null)} style={secondaryBtn}>取消</button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingOrderId(o.orderId || null)} style={primaryBtn}>編輯</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: '14px', color: '#718096' }}>顯示 {orders.length} 筆資料</p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handlePrev} disabled={history.length === 0} style={{ ...secondaryBtn, opacity: history.length === 0 ? 0.5 : 1 }}>{t('previous')}</button>
          <button onClick={handleNext} disabled={!lastKey} style={{ ...secondaryBtn, opacity: !lastKey ? 0.5 : 1 }}>{t('next')}</button>
        </div>
      </div>
    </div>
  );
}

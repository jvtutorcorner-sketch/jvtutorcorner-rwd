"use client";

import React, { useEffect, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, type StoredUser } from '@/lib/mockAuth';
import Link from 'next/link';
import { useT } from '@/components/IntlProvider';
import { COURSES } from '@/data/courses';

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
  payments?: Array<{
    paymentId?: string;
    orderId?: string;
    amount?: number;
    currency?: string;
    status?: string;
    method?: string;
    reference?: string;
    createdAt?: string;
    note?: string;
  }>;
};

export default function OrdersPage() {
  const router = useRouter();
  const t = useT();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [mounted, setMounted] = useState(false);
  const [limit, setLimit] = useState<number>(20);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterCourseId, setFilterCourseId] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // listen for auth changes to update user state
  useEffect(() => {
    function onAuth() {
      setUser(getStoredUser());
    }
    if (typeof window !== 'undefined') {
      setMounted(true);
      setUser(getStoredUser());
      window.addEventListener('tutor:auth-changed', onAuth);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('tutor:auth-changed', onAuth);
      }
    };
  }, []);

  // build course id -> title map
  const courseTitleMap = new Map<string, string>(COURSES.map((c) => [c.id, c.title]));

  async function load(key: string | null = null) {
    setLoading(true);
    setError(null);
    try {
      const current = getStoredUser();
      const isAdmin = current?.role === 'admin';
      const isTeacher = current?.role === 'teacher';
      
      const q = new URLSearchParams();
      q.set('limit', String(limit));
      if (key) q.set('lastKey', key);
      
      // add filters
      if (filterStatus) q.set('status', filterStatus);
      if (filterCourseId) q.set('courseId', filterCourseId);
      if (filterStartDate) q.set('startDate', filterStartDate + 'T00:00:00.000Z');
      if (filterEndDate) q.set('endDate', filterEndDate + 'T23:59:59.999Z');
      
      if (isAdmin) {
        // Admin gets all orders
        const res = await fetch(`/api/orders?${q.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load orders');
        setOrders(data.data || []);
        setLastKey(data.lastKey || null);
      } else if (isTeacher) {
        // Teacher gets orders for their courses
        const courseRes = await fetch(`/api/courses?teacherId=${encodeURIComponent(current?.teacherId || '')}`);
        const courseData = await courseRes.json();
        if (courseData?.ok && courseData.data) {
          const courseIds = courseData.data.map((c: any) => c.id);
          if (courseIds.length === 0) {
            setOrders([]);
            setLastKey(null);
            setLoading(false);
            return;
          }
          // Get orders for each course
          const orderPromises = courseIds.map((cid: string) =>
            fetch(`/api/orders?courseId=${encodeURIComponent(cid)}&limit=100`)
              .then((r) => r.json())
              .then((data) => (data?.ok ? data.data || [] : []))
              .catch(() => [])
          );
          const allOrderArrays = await Promise.all(orderPromises);
          const uniqueOrders = Array.from(
            new Map(allOrderArrays.flat().map(o => [o.orderId, o])).values()
          );
          
          // Apply filters client-side
          let filtered = uniqueOrders;
          if (filterStatus) filtered = filtered.filter(o => o.status === filterStatus);
          if (filterCourseId) filtered = filtered.filter(o => o.courseId === filterCourseId);
          if (filterStartDate || filterEndDate) {
            filtered = filtered.filter(o => {
              const createdAt = o.createdAt ? new Date(o.createdAt) : null;
              if (filterStartDate && createdAt) {
                const startDate = new Date(filterStartDate + 'T00:00:00.000Z');
                if (createdAt < startDate) return false;
              }
              if (filterEndDate && createdAt) {
                const endDate = new Date(filterEndDate + 'T23:59:59.999Z');
                if (createdAt > endDate) return false;
              }
              return true;
            });
          }
          
          setOrders(filtered.slice(0, limit));
          setLastKey(null);
        } else {
          setOrders([]);
          setLastKey(null);
        }
      } else {
        // Regular user gets their own orders
        q.set('userId', encodeURIComponent(current?.email || ''));
        const res = await fetch(`/api/orders?${q.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load orders');
        setOrders(data.data || []);
        setLastKey(data.lastKey || null);
      }
    } catch (err: any) {
      setError(err?.message || String(err));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!mounted || !user) return;
    // initial load when user is set
    load();
    // clear history when filters change
    setHistory([]);
    setLastKey(null);
  }, [mounted, user?.email, limit, filterStatus, filterCourseId, filterStartDate, filterEndDate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: any) => {
      const updated = e?.detail;
      if (updated && updated.orderId) {
        setOrders((prev) => prev.map((o) => (o.orderId === updated.orderId ? updated : o)));
      }
    };
    const reloadHandler = () => {
      setHistory([]);
      setLastKey(null);
      load();
    };
    window.addEventListener('tutor:order-updated', handler as EventListener);
    window.addEventListener('tutor:orders-changed', reloadHandler as EventListener);
    return () => {
      window.removeEventListener('tutor:order-updated', handler as EventListener);
      window.removeEventListener('tutor:orders-changed', reloadHandler as EventListener);
    };
  }, []);

  function handleSearch() {
    // reset pagination and history, then reload
    setHistory([]);
    setLastKey(null);
    setTimeout(() => load(null), 0);
  }

  function handleNext() {
    if (!lastKey) return;
    const newHistory = [...history, lastKey];
    setHistory(newHistory);
    load(lastKey);
  }

  function handlePrev() {
    if (history.length === 0) return;
    const newHistory = history.slice(0, -1);
    setHistory(newHistory);
    const prevKey = newHistory.length > 0 ? newHistory[newHistory.length - 1] : null;
    load(prevKey);
  }

  // Always render the same header structure to avoid hydration mismatches
  const getPageTitle = () => {
    if (!user) return t('orders_label');
    if (user.role === 'admin') return t('all_orders');
    if (user.role === 'teacher') return t('course_orders');
    return t('my_orders');
  };

  return (
    <div className="page">
      <section className="section">
        {!mounted ? (
          <p>{t('loading')}</p>
        ) : !user ? (
          <>
            <p>{t('login_to_view_orders')}</p>
            <p>
              <Link href="/login">{t('go_login')}</Link>
            </p>
          </>
        ) : (
          <>
            <h2>{getPageTitle()}</h2>
            
            {/* Filter section */}
            <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 6 }}>
              <div style={{ marginBottom: 8 }}>
                <label style={{ marginRight: 8 }}>每頁數量：</label>
                <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value, 10))} style={{ padding: '4px 8px' }}>
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
              
              <div style={{ marginBottom: 8 }}>
                <label style={{ marginRight: 8 }}>狀態：</label>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '4px 8px', marginRight: 12 }}>
                  <option value="">全部</option>
                  <option value="PENDING">待付款</option>
                  <option value="PAID">已付款</option>
                  <option value="COMPLETED">已完成</option>
                  <option value="CANCELLED">已取消</option>
                  <option value="REFUNDED">已退款</option>
                </select>

                {user?.role !== 'user' && (
                  <>
                    <label style={{ marginRight: 8 }}>課程：</label>
                    <select value={filterCourseId} onChange={(e) => setFilterCourseId(e.target.value)} style={{ padding: '4px 8px', marginRight: 12 }}>
                      <option value="">全部</option>
                      {COURSES.map((c) => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ marginRight: 8 }}>開始日期：</label>
                <input 
                  type="date" 
                  value={filterStartDate} 
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  style={{ padding: '4px 8px', marginRight: 12 }}
                />
                
                <label style={{ marginRight: 8 }}>結束日期：</label>
                <input 
                  type="date" 
                  value={filterEndDate} 
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  style={{ padding: '4px 8px', marginRight: 12 }}
                />
              </div>

              <button onClick={handleSearch} style={{ padding: '6px 12px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                搜尋
              </button>
            </div>

            {/* Orders table */}
            {loading ? (
              <p>{t('loading')}</p>
            ) : error ? (
              <p style={{ color: 'red' }}>{t('load_error')}: {error}</p>
            ) : !orders || orders.length === 0 ? (
              <p>{t('no_orders')}</p>
            ) : (
              <>
                <table className="orders-table" style={{ borderCollapse: 'collapse', border: '1px solid #ddd', width: '100%', marginBottom: 12 }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>學生</th>
                      <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>訂單編號</th>
                      <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>課程</th>
                      <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>金額</th>
                      <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>訂單流程</th>
                      <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>建立時間</th>
                      <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>更新時間</th>
                      <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      // Determine order flow state
                      const status = (o.status || 'PENDING').toUpperCase();
                      let flowSteps = [0, 0, 0, 0]; // [Created, Pending, Paid, Completed]
                      
                      if (status === 'PENDING') flowSteps = [1, 1, 0, 0];
                      else if (status === 'PAID') flowSteps = [1, 1, 1, 0];
                      else if (status === 'COMPLETED') flowSteps = [1, 1, 1, 1];
                      else if (status === 'CANCELLED' || status === 'REFUNDED') flowSteps = [1, 0, 0, 0];
                      
                      const isExpanded = expandedOrderId === o.orderId;
                      
                      return (
                        <Fragment key={o.orderId || o.id}>
                          <tr>
                            <td style={{ border: '1px solid #ddd', padding: '6px' }}>{o.userId || user?.email || '-'}</td>
                            <td style={{ border: '1px solid #ddd', padding: '6px' }}>
                              <Link href={`/orders/${o.orderId}`} style={{ color: '#0366d6', textDecoration: 'none' }}>{o.orderId?.substring(0, 8)}</Link>
                            </td>
                            <td style={{ border: '1px solid #ddd', padding: '6px' }}>{o.courseId ? (courseTitleMap.get(o.courseId) || o.courseId) : '-'}</td>
                            <td style={{ border: '1px solid #ddd', padding: '6px' }}>{o.amount !== undefined && o.amount !== null ? `${o.amount} ${o.currency ?? 'TWD'}` : '-'}</td>
                            <td style={{ border: '1px solid #ddd', padding: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                {['Created', 'Pending', 'Paid', 'Completed'].map((step, i) => (
                                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <span style={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: 10,
                                      background: flowSteps[i] ? '#0366d6' : '#fff',
                                      color: flowSteps[i] ? '#fff' : '#999',
                                      border: '1px solid #0366d6',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 11,
                                      fontWeight: 'bold'
                                    }}>
                                      {flowSteps[i] ? '✓' : (i + 1)}
                                    </span>
                                    {i < 3 && <span style={{ color: flowSteps[i] && flowSteps[i + 1] ? '#0366d6' : '#ddd', fontSize: 10 }}>→</span>}
                                  </span>
                                ))}
                                {(status === 'CANCELLED' || status === 'REFUNDED') && (
                                  <span style={{
                                    marginLeft: 4,
                                    padding: '2px 6px',
                                    borderRadius: 3,
                                    background: '#f8d7da',
                                    color: '#721c24',
                                    fontSize: 11,
                                    fontWeight: 'bold'
                                  }}>
                                    {status}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: 12 }}>{o.createdAt ? new Date(o.createdAt).toLocaleString() : '-'}</td>
                            <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: 12 }}>{o.updatedAt ? new Date(o.updatedAt).toLocaleString() : '-'}</td>
                            <td style={{ border: '1px solid #ddd', padding: '6px' }}>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => setExpandedOrderId(isExpanded ? null : o.orderId || null)}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '12px',
                                    background: isExpanded ? '#28a745' : '#0366d6',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 3,
                                    cursor: 'pointer'
                                  }}
                                >
                                  {isExpanded ? '隱藏' : '付款紀錄'}
                                </button>
                                <Link 
                                  href={`/orders/${o.orderId}`}
                                  style={{ padding: '4px 8px', fontSize: '12px', color: '#0366d6', textDecoration: 'none', border: '1px solid #0366d6', borderRadius: 3, display: 'inline-block' }}
                                >
                                  詳情
                                </Link>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (o.payments && o.payments.length > 0) && (
                            <tr key={`payment-${o.orderId}`}>
                              <td colSpan={8} style={{ border: '1px solid #ddd', padding: '12px', background: '#f9f9f9' }}>
                                <div style={{ marginTop: 8 }}>
                                  <h4 style={{ marginTop: 0, marginBottom: 8 }}>付款紀錄</h4>
                                  {(!o.payments || o.payments.length === 0) ? (
                                    <p>無付款紀錄</p>
                                  ) : (
                                    <table style={{ borderCollapse: 'collapse', border: '1px solid #ddd', width: '100%' }}>
                                      <thead>
                                        <tr style={{ background: '#e8e8e8' }}>
                                          <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontSize: 12 }}>時間</th>
                                          <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontSize: 12 }}>事件</th>
                                          <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontSize: 12 }}>金額</th>
                                          <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontSize: 12 }}>幣別</th>
                                          <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontSize: 12 }}>狀態</th>
                                          <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontSize: 12 }}>備註</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {o.payments.map((p, idx) => (
                                          <tr key={idx}>
                                            <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: 12 }}>{p.createdAt ? new Date(p.createdAt).toLocaleString() : '-'}</td>
                                            <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: 12 }}>{p.method || '-'}</td>
                                            <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: 12 }}>{p.amount || '-'}</td>
                                            <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: 12 }}>{p.currency || 'TWD'}</td>
                                            <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: 12 }}>
                                              <span style={{
                                                padding: '2px 6px',
                                                borderRadius: 3,
                                                background: p.status === 'SUCCESS' ? '#d4edda' : p.status === 'PENDING' ? '#fff3cd' : '#f8d7da',
                                                color: p.status === 'SUCCESS' ? '#155724' : p.status === 'PENDING' ? '#856404' : '#721c24',
                                                fontSize: 11,
                                                fontWeight: 'bold'
                                              }}>
                                                {p.status || '-'}
                                              </span>
                                            </td>
                                            <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: 12 }}>{p.note || '-'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>

                {/* Pagination */}
                <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={handlePrev} disabled={history.length === 0} style={{ padding: '6px 12px', background: history.length === 0 ? '#ddd' : '#0366d6', color: '#fff', border: 'none', borderRadius: 4, cursor: history.length === 0 ? 'not-allowed' : 'pointer' }}>
                    上一頁
                  </button>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    第 {history.length + 1} 頁 (每頁 {limit} 筆)
                  </span>
                  <button onClick={handleNext} disabled={!lastKey} style={{ padding: '6px 12px', background: !lastKey ? '#ddd' : '#0366d6', color: '#fff', border: 'none', borderRadius: 4, cursor: !lastKey ? 'not-allowed' : 'pointer' }}>
                    下一頁
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

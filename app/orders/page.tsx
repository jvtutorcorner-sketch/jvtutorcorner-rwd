"use client";

import { useEffect, useState } from 'react';
import { getStoredUser, type StoredUser } from '@/lib/mockAuth';
import Link from 'next/link';
import { useT } from '@/components/IntlProvider';

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
  const t = useT();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [mounted, setMounted] = useState(false);

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

  useEffect(() => {
    if (!mounted || !user) return;
    setLoading(true);
    // Fetch server-side filtered orders: admin gets all, others get their own orders or teacher gets orders for their courses
    const current = getStoredUser();
    const isAdmin = current?.role === 'admin';
    const isTeacher = current?.role === 'teacher';
    
    if (isAdmin) {
      // Admin gets all orders
      const baseUrl = '/api/orders?limit=50';
      fetch(baseUrl)
        .then((r) => r.json())
        .then((data) => {
          let list: Order[] = [];
          if (data && data.ok) list = data.data || data || [];
          else if (data && data.data) list = data.data || [];
          setOrders(list);
        })
        .catch((err) => setError(String(err?.message || err)))
        .finally(() => setLoading(false));
    } else if (isTeacher) {
      // Teacher gets orders for their courses
      // First get teacher's courses, then get orders for those courses
      fetch(`/api/courses?teacherId=${encodeURIComponent(current?.teacherId || '')}`)
        .then((r) => r.json())
        .then((courseData) => {
          if (courseData?.ok && courseData.data) {
            const teacherCourses = courseData.data;
            const courseIds = teacherCourses.map((c: any) => c.id);
            if (courseIds.length === 0) {
              setOrders([]);
              setLoading(false);
              return;
            }
            // Get orders for each course and combine results
            const orderPromises = courseIds.map((courseId: string) => 
              fetch(`/api/orders?courseId=${encodeURIComponent(courseId)}&limit=50`)
                .then((r) => r.json())
                .then((data) => {
                  if (data && data.ok) return data.data || [];
                  if (data && data.data) return data.data || [];
                  return [];
                })
                .catch(() => [])
            );
            
            Promise.all(orderPromises)
              .then((orderArrays) => {
                // Combine all orders and remove duplicates
                const allOrders = orderArrays.flat();
                const uniqueOrders = allOrders.filter((order, index, self) => 
                  index === self.findIndex((o) => o.orderId === order.orderId)
                );
                setOrders(uniqueOrders);
              })
              .catch((err) => setError(String(err?.message || err)))
              .finally(() => setLoading(false));
          } else {
            setOrders([]);
            setLoading(false);
          }
        })
        .catch((err) => {
          setError(String(err?.message || err));
          setLoading(false);
        });
    } else {
      // Regular user gets their own orders
      const baseUrl = '/api/orders?limit=50';
      const url = `${baseUrl}&userId=${encodeURIComponent(current?.email || '')}`;
      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          let list: Order[] = [];
          if (data && data.ok) list = data.data || data || [];
          else if (data && data.data) list = data.data || [];
          // Filter client-side as additional safety
          if (current?.email) {
            const email = current.email.toLowerCase();
            setOrders(list.filter(o => (o.userId || '').toLowerCase() === email));
          } else {
            setOrders([]);
          }
        })
        .catch((err) => setError(String(err?.message || err)))
        .finally(() => setLoading(false));
    }
  }, [user?.email, mounted]);

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
        ) : loading ? (
          <p>{t('loading')}</p>
        ) : error ? (
          <p>{t('load_error')}: {error}</p>
        ) : !orders || orders.length === 0 ? (
          <p>{t('no_orders')}</p>
        ) : (
          <>
            <h2>{getPageTitle()}</h2>
            <table className="orders-table" style={{ borderCollapse: 'collapse', border: '2px solid #ccc', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>使用者</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>訂單編號</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>課程 / ID</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>金額</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>狀態</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>建立時間</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>進入教室</th>
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
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.amount !== undefined && o.amount !== null ? `${o.amount} ${o.currency ?? 'TWD'}` : '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.status ?? '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.createdAt ? new Date(o.createdAt).toLocaleString() : '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>
                      {o.courseId ? (
                        <Link 
                          href={`/classroom/wait?courseId=${encodeURIComponent(o.courseId)}&orderId=${encodeURIComponent(o.orderId)}`}
                          className="btn btn-primary"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                        >
                          進入教室
                        </Link>
                      ) : (
                        '-'
                      )}
                    </td>
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

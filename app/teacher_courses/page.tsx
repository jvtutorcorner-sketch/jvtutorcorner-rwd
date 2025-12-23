"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

export default function TeacherOrdersPage() {
  const router = useRouter();
  const t = useT();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [courseMap, setCourseMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [mounted, setMounted] = useState(false);

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
    if (user.role !== 'teacher') return;
    setLoading(true);

    // Fetch teacher's courses, then fetch orders for those courses
    const teacherId = (user as any).teacherId || '';
    const teacherName = user.lastName ? `${user.lastName}老師` : user.email || '';

    fetch(`/api/courses?teacherId=${encodeURIComponent(teacherId)}`)
      .then((r) => r.json())
      .then((courseData) => {
        let teacherCourses: any[] = [];
        if (courseData?.ok && Array.isArray(courseData.data)) {
          teacherCourses = courseData.data;
        }
        if (teacherCourses.length === 0) {
          // fallback: query by name
          return fetch(`/api/courses?teacher=${encodeURIComponent(teacherName)}`).then((r) => r.json()).then((j) => j?.data || []);
        }
        return teacherCourses;
      })
      .then((teacherCourses: any[]) => {
        const courseIds = teacherCourses.map((c) => c.id).filter(Boolean);
        if (courseIds.length === 0) {
          setOrders([]);
          setLoading(false);
          return;
        }
        const orderPromises = courseIds.map((courseId: string) =>
          fetch(`/api/orders?courseId=${encodeURIComponent(courseId)}&limit=50`).then((r) => r.json()).then((data) => (data && data.ok ? data.data || [] : data?.data || [])).catch(() => []),
        );
        Promise.all(orderPromises)
          .then((orderArrays) => {
            const allOrders = orderArrays.flat();
            const uniqueOrders = allOrders.filter((order, index, self) => index === self.findIndex((o) => o.orderId === order.orderId));
            setOrders(uniqueOrders);
            // build courseId -> title map
            const ids = Array.from(new Set(uniqueOrders.map((o) => o.courseId).filter(Boolean)));
            if (ids.length === 0) {
              setCourseMap({});
              return;
            }
            const courseFetches = ids.map((cid) =>
              fetch(`/api/courses?id=${encodeURIComponent(cid)}`)
                .then((r) => r.json())
                .then((j) => (j && j.ok && j.course ? j.course.title : null))
                .catch(() => null),
            );
            Promise.all(courseFetches)
              .then((titles) => {
                const map: Record<string, string> = {};
                ids.forEach((id, idx) => {
                  if (titles[idx]) map[id] = titles[idx] as string;
                });
                setCourseMap(map);
              })
              .catch(() => {
                // ignore errors building the map
              });
          })
          .catch((err) => setError(String(err?.message || err)))
          .finally(() => setLoading(false));
      })
      .catch((err) => {
        setError(String(err?.message || err));
        setLoading(false);
      });
  }, [user, mounted]);

  if (!mounted) return <div>{t('loading')}</div>;
  if (!user) return (
    <div>
      <p>{t('login_to_view_orders')}</p>
      <p>
        <Link href="/login">{t('go_login')}</Link>
      </p>
    </div>
  );
  if (user.role !== 'teacher') return <div>{t('teacher_only_feature')}</div>;

  return (
    <div className="page">
      <section className="section">
        {loading ? (
          <p>{t('loading')}</p>
        ) : error ? (
          <p>{t('load_error')}: {error}</p>
        ) : !orders || orders.length === 0 ? (
          <p>{t('no_orders')}</p>
        ) : (
          <>
            <h2>{t('course_orders')}</h2>
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
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.userId || '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}><Link href={`/orders/${o.orderId}`}>{o.orderId}</Link></td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.courseId ? (courseMap[o.courseId] || o.courseId) : '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.amount !== undefined && o.amount !== null ? `${o.amount} ${o.currency ?? 'TWD'}` : '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.status ?? '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.createdAt ? new Date(o.createdAt).toLocaleString() : '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.courseId ? (
                      <Link href={`/classroom/wait?courseId=${encodeURIComponent(o.courseId)}&orderId=${encodeURIComponent(o.orderId)}`} className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '12px' }}>進入教室</Link>
                    ) : '-'}
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

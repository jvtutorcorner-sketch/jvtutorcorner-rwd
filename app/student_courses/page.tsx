"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, type StoredUser } from '@/lib/mockAuth';
import Link from 'next/link';
import { useT } from '@/components/IntlProvider';
import { COURSE_RECORDS } from '@/data/courseRecords';

type Order = {
  orderId: string;
  orderNumber?: string;
  userId?: string;
  courseId?: string;
  durationMinutes?: number;
  amount?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
};

export default function StudentCoursesPage() {
  const router = useRouter();
  const t = useT();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [courseMap, setCourseMap] = useState<Record<string, { title?: string; teacherName?: string; durationMinutes?: number; totalSessions?: number }>>({});
  const [userMap, setUserMap] = useState<Record<string, { firstName?: string; lastName?: string }>>({});
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
    setLoading(true);
    const current = getStoredUser();
    const isAdmin = current?.role === 'admin';
    const isTeacher = current?.role === 'teacher';

    if (isAdmin) {
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
      const baseUrl = '/api/orders?limit=50';
      const url = `${baseUrl}&userId=${encodeURIComponent(current?.email || '')}`;
      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          let list: Order[] = [];
          if (data && data.ok) list = data.data || data || [];
          else if (data && data.data) list = data.data || [];
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

  // When orders change, fetch course titles for any courseIds found
  useEffect(() => {
    if (!orders || orders.length === 0) {
      setCourseMap({});
      return;
    }
    const ids = Array.from(new Set(orders.map(o => o.courseId).filter((id): id is string => !!id)));
    if (ids.length === 0) {
      setCourseMap({});
      return;
    }
    const fetches = ids.map((cid: string) =>
      fetch(`/api/courses?id=${encodeURIComponent(cid)}`)
        .then(r => r.json())
        .then(j => (j && j.ok && j.course ? {
          title: j.course.title,
          teacherName: j.course.teacherName || j.course.teacher || null,
          durationMinutes: j.course.durationMinutes,
          totalSessions: j.course.totalSessions
        } : null))
        .catch(() => null)
    );
    Promise.all(fetches).then((results) => {
      const map: Record<string, { title?: string; teacherName?: string; durationMinutes?: number; totalSessions?: number }> = {};
      ids.forEach((id: string, idx: number) => {
        const t = results[idx] as any | null;
        if (t) map[id] = {
          title: t.title,
          teacherName: t.teacherName,
          durationMinutes: t.durationMinutes,
          totalSessions: t.totalSessions
        };
      });
      setCourseMap(map);
    }).catch(() => setCourseMap({}));
  }, [orders]);

  // When orders change, fetch user details for any userIds found
  useEffect(() => {
    if (!orders || orders.length === 0) {
      setUserMap({});
      return;
    }
    const ids = Array.from(new Set(orders.map(o => o.userId).filter((id): id is string => !!id)));
    if (ids.length === 0) {
      setUserMap({});
      return;
    }
    const fetches = ids.map((uid: string) =>
      fetch(`/api/profile?email=${encodeURIComponent(uid)}`)
        .then(r => r.json())
        .then(j => (j && j.ok && j.profile ? { firstName: j.profile.firstName, lastName: j.profile.lastName } : null))
        .catch(() => null)
    );
    Promise.all(fetches).then((results) => {
      const map: Record<string, { firstName?: string; lastName?: string }> = {};
      ids.forEach((id: string, idx: number) => {
        const u = results[idx] as any | null;
        if (u) map[id] = { firstName: u.firstName, lastName: u.lastName };
      });
      setUserMap(map);
    }).catch(() => setUserMap({}));
  }, [orders]);

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
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>{t('student_courses_student')}</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>{t('student_courses_course_name')}</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>{t('student_courses_teacher')}</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>{t('student_courses_status')}</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>剩餘課程數</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>剩餘時間 (分)</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>{t('student_courses_created_at')}</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>{t('enter_classroom')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.orderId}>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.userId ? (userMap[o.userId]?.firstName && userMap[o.userId]?.lastName ? `${userMap[o.userId].firstName} ${userMap[o.userId].lastName}` : o.userId) : '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>
                      {o.courseId ? (courseMap[o.courseId]?.title || o.courseId) : '-'}
                    </td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.courseId ? (courseMap[o.courseId]?.teacherName || '-') : '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>
                      {(() => {
                        if (!o.courseId) return '-';
                        const record = COURSE_RECORDS.find(r => r.courseId === o.courseId);
                        if (record) {
                          if (record.status === 'attended') return t('calendar_status_attended') || 'Attended';
                          if (record.status === 'missed') return t('calendar_status_missed') || 'Missed';
                          if (record.status === 'pending') return t('calendar_status_pending') || 'Pending';
                        }
                        return t('calendar_status_pending') || 'Pending';
                      })()}
                    </td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>
                      {(() => {
                        if (typeof (o as any).remainingSessions === 'number') {
                          return `${(o as any).remainingSessions}`;
                        }
                        if (!o.courseId) return '-';
                        const c = courseMap[o.courseId];
                        if (!c) return '-';
                        const total = c.totalSessions || 0;
                        const attended = COURSE_RECORDS.filter(r => r.courseId === o.courseId && r.status === 'attended').length;
                        return `${Math.max(0, total - attended)}`;
                      })()}
                    </td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>
                      {(() => {
                        if (typeof (o as any).remainingSeconds === 'number') {
                          const sess = typeof (o as any).remainingSessions === 'number' ? (o as any).remainingSessions : 1;
                          return `${Math.ceil(((o as any).remainingSeconds * sess) / 60)} m`;
                        }
                        if (typeof (o as any).remainingMinutes === 'number') {
                          return `${(o as any).remainingMinutes} m`;
                        }
                        if (!o.courseId) return '-';
                        const c = courseMap[o.courseId];
                        if (!c) return '-';
                        const total = c.totalSessions || 0;
                        const attended = COURSE_RECORDS.filter(r => r.courseId === o.courseId && r.status === 'attended').length;
                        const duration = o.durationMinutes || c.durationMinutes || 0;
                        const remaining = Math.max(0, total - attended) * duration;
                        return `${remaining} m`;
                      })()}
                    </td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.createdAt ? new Date(o.createdAt).toLocaleString() : '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>
                      {o.courseId ? (
                        <Link
                          href={`/classroom/wait?courseId=${encodeURIComponent(o.courseId)}&orderId=${encodeURIComponent(o.orderId || (o as any).id || '')}&orderid=${encodeURIComponent(o.orderId || (o as any).id || '')}`}
                          className="btn btn-primary"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                        >
                          {t('enter_classroom')}
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

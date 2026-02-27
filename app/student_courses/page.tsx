"use client";

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { getStoredUser, setStoredUser, type StoredUser } from '@/lib/mockAuth';
import Link from 'next/link';
import { useT } from '@/components/IntlProvider';
import { COURSE_RECORDS } from '@/data/courseRecords';
import Pagination from '@/components/Pagination';

type Order = {
  orderId: string;
  orderNumber?: string;
  userId?: string;
  courseId?: string;
  orderDate?: string;
  amount?: number;
  currency?: string;
  notes?: string;
  enrollmentId?: string;
  startTime?: string;
  endTime?: string;
  createdAt?: string;
  status?: string;
  durationMinutes?: number;
};

function StudentCoursesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const t = useT();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [courseMap, setCourseMap] = useState<Record<string, { title?: string; teacherName?: string; durationMinutes?: number; totalSessions?: number; startDate?: string; nextStartDate?: string; endDate?: string; startTime?: string; endTime?: string }>>({});
  const [userMap, setUserMap] = useState<Record<string, { firstName?: string; lastName?: string }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [mounted, setMounted] = useState(false);

  // Search local state
  const limitParam = parseInt(searchParams.get('limit') || '20', 10);
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const qCourse = searchParams.get('course') || '';
  const qTeacher = searchParams.get('teacher') || '';
  const qTimeFrom = searchParams.get('timeFrom') || '';
  const qTimeTo = searchParams.get('timeTo') || '';

  const [searchInputCourse, setSearchInputCourse] = useState(qCourse);
  const [searchInputTeacher, setSearchInputTeacher] = useState(qTeacher);
  const [searchInputTimeFrom, setSearchInputTimeFrom] = useState(qTimeFrom);
  const [searchInputTimeTo, setSearchInputTimeTo] = useState(qTimeTo);

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
  // AND process plan upgrades if present
  useEffect(() => {
    if (!orders || orders.length === 0) {
      setCourseMap({});
      return;
    }

    // Process plan upgrades based on enrollmentId
    if (user) {
      let upgradedPlan = user.plan;
      let hasUpgrade = false;

      // Find the most recent PAID plan upgrade order
      // We sort assuming orders are already fetched latest first, but we check all PAID
      for (const o of orders) {
        if (o.status?.toUpperCase() === 'PAID' && o.enrollmentId?.startsWith('plan_upgrade_')) {
          const planFromOrder = o.enrollmentId.replace('plan_upgrade_', '');
          if (planFromOrder && planFromOrder !== user.plan) {
            upgradedPlan = planFromOrder as any;
            hasUpgrade = true;
            break; // take the latest
          }
        }
      }

      if (hasUpgrade && upgradedPlan !== user.plan) {
        const updatedUser = { ...user, plan: upgradedPlan };
        setStoredUser(updatedUser);
        setUser(updatedUser);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('tutor:auth-changed'));
        }
      }
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
          totalSessions: j.course.totalSessions,
          startDate: j.course.startDate || null,
          nextStartDate: j.course.nextStartDate || null,
          endDate: j.course.endDate || null,
          startTime: j.course.startTime || null,
          endTime: j.course.endTime || null,
        } : null))
        .catch(() => null)
    );
    Promise.all(fetches).then((results) => {
      const map: Record<string, { title?: string; teacherName?: string; durationMinutes?: number; totalSessions?: number; startDate?: string; nextStartDate?: string; endDate?: string; startTime?: string; endTime?: string }> = {};
      ids.forEach((id: string, idx: number) => {
        const t = results[idx] as any | null;
        if (t) map[id] = {
          title: t.title,
          teacherName: t.teacherName,
          durationMinutes: t.durationMinutes,
          totalSessions: t.totalSessions,
          startDate: t.startDate,
          nextStartDate: t.nextStartDate,
          endDate: t.endDate,
          startTime: t.startTime,
          endTime: t.endTime
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

  function formatDateTime(value: any) {
    if (!value) return '-';
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(/\//g, '-');
    } catch (e) {
      return String(value);
    }
  }

  // Helper to format time only (HH:mm:ss) in 24h
  function formatTime(value: any) {
    if (!value) return '-';
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (e) {
      return String(value);
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', '1'); // reset to page 1
    if (searchInputCourse.trim()) params.set('course', searchInputCourse.trim());
    else params.delete('course');
    if (searchInputTeacher.trim()) params.set('teacher', searchInputTeacher.trim());
    else params.delete('teacher');
    if (searchInputTimeFrom) params.set('timeFrom', searchInputTimeFrom);
    else params.delete('timeFrom');
    if (searchInputTimeTo) params.set('timeTo', searchInputTimeTo);
    else params.delete('timeTo');
    router.push(`${pathname}?${params.toString()}`);
  };

  // Helper to get order start time timestamp for filtering
  const getOrderStartTimestamp = (o: Order) => {
    if (o.startTime && (o.startTime.includes('T') || o.startTime.endsWith('Z'))) {
      return new Date(o.startTime).getTime();
    }
    const c = courseMap[o.courseId || ''];
    if (!c) return 0;
    const datePart = c.nextStartDate || c.startDate;
    let timePart = c.startTime;
    if (!datePart) return 0;
    if (timePart) {
      timePart = timePart.replace(/[上下]午/g, '').trim();
    } else {
      timePart = '00:00:00';
    }
    // ensure timepart has seconds
    if (timePart.split(':').length === 2) {
      timePart += ':00';
    }
    return new Date(`${datePart}T${timePart}`).getTime();
  };

  // Filter orders
  let filteredOrders = orders || [];
  if (filteredOrders.length > 0) {
    if (qCourse) {
      const lowerQ = qCourse.toLowerCase();
      filteredOrders = filteredOrders.filter(o => {
        const title = (o.courseId && courseMap[o.courseId]?.title) ? courseMap[o.courseId].title!.toLowerCase() : '';
        return title.includes(lowerQ) || (o.courseId && o.courseId.toLowerCase().includes(lowerQ));
      });
    }
    if (qTeacher) {
      const lowerT = qTeacher.toLowerCase();
      filteredOrders = filteredOrders.filter(o => {
        const tName = (o.courseId && courseMap[o.courseId]?.teacherName) ? courseMap[o.courseId].teacherName!.toLowerCase() : '';
        return tName.includes(lowerT);
      });
    }
    if (qTimeFrom) {
      const fromMs = new Date(qTimeFrom).getTime();
      filteredOrders = filteredOrders.filter(o => getOrderStartTimestamp(o) >= fromMs);
    }
    if (qTimeTo) {
      const toMs = new Date(qTimeTo).getTime();
      filteredOrders = filteredOrders.filter(o => getOrderStartTimestamp(o) <= toMs);
    }
  }

  // Paginate
  const totalItems = filteredOrders.filter(o => !!o.courseId).length;
  const startIndex = (pageParam - 1) * limitParam;
  const paginatedOrders = filteredOrders.filter(o => !!o.courseId).slice(startIndex, startIndex + limitParam);

  return (
    <div className="page">
      <section className="section">
        <h2 style={{ marginBottom: '16px' }}>{getPageTitle()}</h2>

        {/* Search Bar matching /courses */}
        {user && (
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold' }}>{t('teacher')}</label>
              <input
                type="text"
                value={searchInputTeacher}
                onChange={(e) => setSearchInputTeacher(e.target.value)}
                placeholder={t('search_teacher_placeholder')}
                style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '150px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold' }}>{t('student_courses_course_name')}</label>
              <input
                type="text"
                value={searchInputCourse}
                onChange={(e) => setSearchInputCourse(e.target.value)}
                placeholder={`搜尋課程...`}
                style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '150px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold' }}>開始區間 (起)</label>
              <input
                type="datetime-local"
                step="1"
                value={searchInputTimeFrom}
                onChange={(e) => setSearchInputTimeFrom(e.target.value)}
                style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '180px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold' }}>開始區間 (迄)</label>
              <input
                type="datetime-local"
                step="1"
                value={searchInputTimeTo}
                onChange={(e) => setSearchInputTimeTo(e.target.value)}
                style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '180px' }}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', height: 'fit-content' }}>
              {t('search')}
            </button>
          </form>
        )}

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
        ) : paginatedOrders.length === 0 ? (
          <p>目前沒有符合條件的訂單。</p>
        ) : (
          <>
            <table className="orders-table" style={{ borderCollapse: 'collapse', border: '2px solid #ccc', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>{t('student_courses_student')}</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>{t('student_courses_course_name')}</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>{t('student_courses_teacher')}</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>{t('session_duration_label')}</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>剩餘課程數</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>剩餘時間 (分)</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>{t('start_time_label')}</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>{t('end_time_label')}</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left' }}>{t('enter_classroom')}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((o) => (
                  <tr key={o.orderId}>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.userId ? (userMap[o.userId]?.firstName && userMap[o.userId]?.lastName ? `${userMap[o.userId].firstName} ${userMap[o.userId].lastName}` : o.userId) : '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>
                      {o.courseId ? (
                        <Link href={`/courses/${encodeURIComponent(o.courseId)}`}>
                          {courseMap[o.courseId]?.title || o.courseId}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.courseId ? (courseMap[o.courseId]?.teacherName || '-') : '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>{o.courseId ? (courseMap[o.courseId]?.durationMinutes ? `${courseMap[o.courseId]?.durationMinutes} m` : '-') : '-'}</td>
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
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>
                      {(() => {
                        if (o.startTime) {
                          const isoDate = o.startTime.includes('T') ? o.startTime : `${o.startTime.split(' ')[0]}T${o.startTime.split(' ')[1] || '00:00:00'}`;
                          return formatDateTime(isoDate);
                        }
                        const c = courseMap[o.courseId || ''];
                        if (!c) return '-';
                        const rawDatePart = c.nextStartDate || c.startDate;
                        let timePart = c.startTime;
                        if (!rawDatePart) return '-';
                        const datePart = rawDatePart.split('T')[0];
                        if (timePart) {
                          timePart = timePart.replace(/[上下]午/g, '').trim();
                        }
                        return formatDateTime(`${datePart}T${timePart || '00:00:00'}`);
                      })()}
                    </td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>
                      {(() => {
                        if (o.endTime) {
                          const isoDate = o.endTime.includes('T') ? o.endTime : `${o.endTime.split(' ')[0]}T${o.endTime.split(' ')[1] || '00:00:00'}`;
                          return formatDateTime(isoDate);
                        }
                        const c = courseMap[o.courseId || ''];
                        if (!c) return '-';
                        const rawDatePart = c.endDate;
                        let timePart = c.endTime;
                        if (!rawDatePart) return '-';
                        const datePart = rawDatePart.split('T')[0];
                        if (timePart) {
                          timePart = timePart.replace(/[上下]午/g, '').trim();
                        }
                        return formatDateTime(`${datePart}T${timePart || '00:00:00'}`);
                      })()}
                    </td>
                    <td style={{ border: '2px solid #ccc', padding: '6px' }}>
                      {o.courseId ? (
                        ['basic', 'pro', 'elite'].includes(user?.plan || '') ? (
                          <Link
                            href={`/classroom/wait?courseId=${encodeURIComponent(o.courseId)}&orderId=${encodeURIComponent(o.orderId || (o as any).id || '')}&orderid=${encodeURIComponent(o.orderId || (o as any).id || '')}`}
                            className="btn btn-primary"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                          >
                            {t('enter_classroom')}
                          </Link>
                        ) : (
                          '-'
                        )
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Pagination
              totalItems={totalItems}
              pageSize={limitParam}
              currentPage={pageParam}
            />
          </>
        )}
      </section>
    </div>
  );
}

export default function StudentCoursesPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <StudentCoursesContent />
    </Suspense>
  );
}


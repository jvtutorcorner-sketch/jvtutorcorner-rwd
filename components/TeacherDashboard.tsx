"use client";
"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from './IntlProvider';

type Props = { teacherId?: string; teacherName?: string };

export default function TeacherDashboard({ teacherId, teacherName }: Props) {
  const t = useT();
  const [canEdit, setCanEdit] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const q = new URLSearchParams();
        if (teacherId) q.set('id', teacherId);
        else if (teacherName) q.set('email', teacherName);
        const res = await fetch(`/api/profile?${q.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.ok && data.profile) setProfile(data.profile);
        }
      } catch (e) {
        // ignore
      }

      const s = getStoredUser();
      if (s && (s.role === 'admin' || (s.teacherId && s.teacherId === teacherId) || (profile && s.email === profile.email))) setCanEdit(true);
      if (s && s.email === 'teacher@test.com') setCanEdit(true);
      loadCourses();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, teacherName, profile?.email]);

  async function loadCourses() {
    setLoading(true);
    try {
      const res = await fetch(`/api/courses?teacher=${encodeURIComponent(String(teacherName || ''))}`);
      const data = await res.json();
      if (res.ok && data?.data) {
        setCourses(data.data);
        loadOrderCount(data.data);
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function loadOrderCount(teacherCourses: any[]) {
    const courseIds = teacherCourses.map((c: any) => c.id).filter(Boolean);
    if (courseIds.length === 0) {
      setOrderCount(0);
      return;
    }

    try {
      const orderPromises = courseIds.map((courseId: string) =>
        fetch(`/api/orders?courseId=${encodeURIComponent(courseId)}&limit=100`)
          .then((r) => r.json())
          .then((data) => (data?.ok ? data.data || [] : data?.data || []))
          .catch(() => [])
      );

      const orderArrays = await Promise.all(orderPromises);
      const allOrders = orderArrays.flat();
      const uniqueOrders = allOrders.filter((order, index, self) =>
        index === self.findIndex((o) => o.orderId === order.orderId)
      );
      setOrderCount(uniqueOrders.length);
    } catch (e) {
      // ignore
    }
  }

  async function handleDeleteCourse(id: string) {
    if (!confirm(t('confirm_delete_course'))) return;
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || t('delete_failed'));
      loadCourses();
      alert(t('course_deleted_demo'));
    } catch (err: any) {
      alert(err?.message || t('delete_failed'));
    }
  }

  async function handlePatchCourse(id: string, updates: any) {
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || t('update_failed'));
      loadCourses();
      alert(t('course_updated_demo'));
    } catch (err: any) {
      alert(err?.message || t('update_failed'));
    }
  }

  return (
    <div style={{ marginTop: 18 }}>
      {canEdit && (
        <div style={{ marginBottom: 12 }}>
          <Link href="/dashboard/teacher/new-course" className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            新增課程
          </Link>
        </div>
      )}
      {orderCount !== null && (
        <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
          <h4 style={{ margin: '0 0 8px 0' }}>📊 訂單統計</h4>
          <p style={{ margin: 0, fontSize: 14 }}>
            課程訂單總數：<strong style={{ color: '#2563eb', fontSize: 16 }}>{orderCount}</strong> 個
          </p>
          <Link href="/teacher_courses" style={{ fontSize: 12, color: '#2563eb', textDecoration: 'underline' }}>
            查看詳細訂單 →
          </Link>
        </div>
      )}

      <div>
        <h4>{t('course_list')}</h4>
        {loading && <p>{t('loading')}</p>}
        {courses.length === 0 ? <p className="muted">{t('no_courses')}</p> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {courses.map((c) => (
              <div key={c.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Link href={`/courses/${encodeURIComponent(String(c.id))}`} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                      <strong>{c.title}</strong>
                      <div className="muted">NT$ {c.pricePerSession} • {c.subject}</div>
                      {c.nextStartDate ? <div className="muted">{t('start_date')}: {c.nextStartDate}</div> : null}
                      {c.membershipPlan ? <div className="muted">{t('membership_plan')}: {c.membershipPlan}</div> : null}
                    </Link>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {canEdit && <button onClick={() => {
                      const input = prompt(t('prompt_start_date'), c.nextStartDate || '');
                      if (input === null) return;
                      handlePatchCourse(c.id, { nextStartDate: input || null });
                    }}>{t('set_start_date')}</button>}
                    {canEdit && <button onClick={() => {
                      const mp = prompt(t('prompt_membership_plan'), c.membershipPlan || '');
                      if (mp === null) return;
                      handlePatchCourse(c.id, { membershipPlan: mp || null });
                    }}>{t('set_plan')}</button>}
                    {canEdit && <button onClick={() => handleDeleteCourse(c.id)} style={{ color: 'crimson' }}>{t('delete')}</button>}
                  </div>
                </div>
                {c.description ? <p style={{ marginTop: 8 }}>{c.description}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from './IntlProvider';

type Props = { teacherId: string; teacherName: string };

export default function TeacherDashboard({ teacherId, teacherName }: Props) {
  const t = useT();
  const [canEdit, setCanEdit] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [newCoursePrice, setNewCoursePrice] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newMembershipPlan, setNewMembershipPlan] = useState('');

  useEffect(() => {
    const stored = getStoredUser();
    (async () => {
      try {
        // fetch profile by id to determine ownership (demo)
        const q = new URLSearchParams();
        if (teacherId) q.set('id', teacherId);
        else q.set('email', teacherName);
        const res = await fetch(`/api/profile?${q.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.ok && data.profile) setProfile(data.profile);
        }
      } catch (e) {}
      // allow edit if stored user is admin, matches teacherId, or matches teacher email
      const s = getStoredUser();
      if (s && (s.role === 'admin' || (s.teacherId && s.teacherId === teacherId) || (profile && s.email === profile.email))) setCanEdit(true);
      // fallback: allow if stored user email equals teacher@test.com (demo teacher)
      if (s && s.email === 'teacher@test.com') setCanEdit(true);
      loadCourses();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, teacherName, profile?.email]);

  // After courses are loaded, no need to load orders anymore since they're shown on /orders page
  // useEffect(() => {
  //   if (courses && courses.length > 0) {
  //     loadOrders();
  //   }
  //   if (!courses || courses.length === 0) setOrders([]);
  // }, [courses]);

  async function loadCourses() {
    setLoading(true);
    try {
      const res = await fetch(`/api/courses?teacher=${encodeURIComponent(String(teacherName))}`);
      const data = await res.json();
      if (res.ok && data?.data) setCourses(data.data);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCourse(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload = {
        title: newCourseTitle,
        teacherName,
        pricePerSession: Number(newCoursePrice) || 0,
        nextStartDate: newStartDate || null,
        membershipPlan: newMembershipPlan || null,
      };
      const res = await fetch('/api/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || t('add_course_failed'));
      setNewCourseTitle(''); setNewCoursePrice(''); setNewStartDate(''); setNewMembershipPlan('');
      loadCourses();
      alert(t('course_added_demo'));
    } catch (err: any) {
      alert(err?.message || t('add_course_failed'));
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

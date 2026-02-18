"use client";
"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TEACHERS } from '@/data/teachers';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from './IntlProvider';
import Button from './UI/Button';

type Props = { teacherId?: string; teacherName?: string };

export default function TeacherDashboard({ teacherId, teacherName }: Props) {
  const t = useT();
  const router = useRouter();
  const [canEdit, setCanEdit] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
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
      // Allow admins and demo teachers to edit. Also allow any stored user with role 'teacher' to edit their courses.
      if (s && (s.role === 'admin' || s.role === 'teacher' || (s.teacherId && s.teacherId === teacherId) || (profile && s.email === profile.email))) setCanEdit(true);
      if (s && s.email === 'teacher@test.com') setCanEdit(true);
      loadCourses();
      // In local development, if no stored user exists, enable edit actions for convenience
      // This keeps the demo editable without forcing login. Only enable in non-production builds.
      if (!s && process.env.NODE_ENV !== 'production') {
        setCanEdit(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, teacherName, profile?.email]);

  useEffect(() => {
    // listen for external course updates (e.g., modal create)
    const handler = () => {
      loadCourses();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('courses:updated', handler as EventListener);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('courses:updated', handler as EventListener);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCourses() {
    setLoading(true);
    try {
      const stored = getStoredUser();
      let url = `/api/courses`;
      let myTeacherId = teacherId;
      let myTeacherName = teacherName;

      // Prefer logged-in user info
      if (stored?.role === 'teacher') {
        if (stored.teacherId) myTeacherId = stored.teacherId;
        // Use displayName or lastName as fallback for name matching if needed, 
        // but ID is better.
        if (!myTeacherName) {
          const tFound = TEACHERS.find(x => String(x.id) === String(stored.teacherId));
          myTeacherName = tFound?.name || stored.displayName || stored.lastName;
        }
      }

      // Build query
      if (myTeacherId) {
        url = `/api/courses?teacherId=${encodeURIComponent(String(myTeacherId))}`;
      } else if (myTeacherName) {
        url = `/api/courses?teacher=${encodeURIComponent(String(myTeacherName))}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (res.ok && data?.data) {
        let list = Array.isArray(data.data) ? data.data : [];

        // Strict Client-side filtering to ensure no other teacher's courses leak
        if (stored?.role === 'teacher') {
          const tid = String(stored.teacherId || '').toLowerCase();
          const tname = String(myTeacherName || '').toLowerCase();

          list = list.filter((c: any) => {
            const cTid = String(c.teacherId || '').toLowerCase();
            const cTname = String(c.teacherName || c.teacher || '').toLowerCase();

            // If course has teacherId, match strictly on ID
            if (tid && cTid) {
              return cTid === tid;
            }
            // If course only has name, match on name
            if (tname && cTname) {
              return cTname.includes(tname);
            }
            return false;
          });
        }

        setCourses(list);
      } else {
        setCourses([]);
      }
    } catch (e) {
      // ignore
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }

  function handleEditCourse(id: string) {
    // const ok = confirm(t('confirm_edit_course') || 'Confirm edit this course?');
    // if (!ok) return;
    router.push(`/courses_manage/${encodeURIComponent(id)}/edit`);
  }

  function handleCreateCourse() {
    router.push('/courses_manage/new');
  }

  function formatDateTime(value: any) {
    if (!value) return '-';
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return String(value);
    }
  }

  return (
    <div style={{ marginTop: 18 }}>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h4>{t('course_list')}</h4>
          <div style={{ display: 'flex', gap: 8 }}>
            {canEdit && (
              <Button onClick={handleCreateCourse} variant="primary">
                新增課程
              </Button>
            )}
          </div>
        </div>

        {loading && <p>{t('loading')}</p>}
        {!loading && courses.length === 0 ? (
          <p className="muted">{t('no_courses')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #ccc' }}>
              <thead>
                <tr>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>課程名稱</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>{t('teacher') || 'Teacher'}</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>時長</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>{t('start_date') || 'Start Date'}</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>結束時間</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>{t('membership_plan') || 'Plan'}</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>狀態</th>
                  <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>{t('actions') || 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c, idx) => (
                  <tr key={c.id} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ border: '2px solid #ccc', padding: '8px' }}>
                      <Link href={`/courses/${encodeURIComponent(String(c.id))}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        <strong>{c.title}</strong>
                      </Link>
                    </td>
                    <td style={{ border: '2px solid #ccc', padding: '8px' }}>{c.teacherName || c.teacher || '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '8px' }}>{c.durationMinutes ? `${c.durationMinutes} 分鐘` : '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '8px' }}>{formatDateTime(c.nextStartDate || c.startDate)}</td>
                    <td style={{ border: '2px solid #ccc', padding: '8px' }}>{formatDateTime(c.endDate)}</td>
                    <td style={{ border: '2px solid #ccc', padding: '8px' }}>{c.membershipPlan || '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '8px' }}>{c.status || '-'}</td>
                    <td style={{ border: '2px solid #ccc', padding: '8px' }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button
                          onClick={() => {
                            if (!canEdit) {
                              alert(t('no_permission') || 'You do not have permission');
                              return;
                            }
                            handleEditCourse(c.id);
                          }}
                          variant="primary"
                        >
                          {t('edit')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

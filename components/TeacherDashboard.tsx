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
      // prefer teacherId for logged-in teacher
      if (stored?.role === 'teacher' && stored?.teacherId) {
        url = `/api/courses?teacherId=${encodeURIComponent(stored.teacherId)}`;
      } else if (teacherId) {
        url = `/api/courses?teacherId=${encodeURIComponent(String(teacherId))}`;
      } else if (teacherName) {
        url = `/api/courses?teacher=${encodeURIComponent(String(teacherName))}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data?.data) {
        let list = Array.isArray(data.data) ? data.data : [];
        // if user is teacher and no results, try fallback by teacher name (bundled data uses teacherName)
        if ((stored?.role === 'teacher' && stored?.teacherId) && list.length === 0) {
          const t = TEACHERS.find((x) => String(x.id) === String(stored.teacherId));
          const name = t?.name || `${stored.lastName}老師` || stored.displayName || '';
          if (name) {
            const res2 = await fetch(`/api/courses?teacher=${encodeURIComponent(name)}`);
            const d2 = await res2.json();
            if (res2.ok && d2?.data && Array.isArray(d2.data) && d2.data.length > 0) {
              list = d2.data;
            }
          }

          // Still empty? fetch all courses from the source (.local_data/courses.json) and show them.
          if (list.length === 0) {
            try {
              const resAll = await fetch('/api/courses');
              const dAll = await resAll.json();
              if (resAll.ok && dAll?.data && Array.isArray(dAll.data)) {
                list = dAll.data;
              }
            } catch (e) {
              // ignore
            }
          }
        }

        if (stored?.role === 'teacher' && stored?.teacherId) {
          // Try to filter to the logged-in teacher where possible; if matching information is missing, fall back to showing all fetched courses.
          const teacherKey = String(stored.teacherId).toLowerCase();
          const teacherNameFromList = (TEACHERS.find(x => String(x.id) === String(stored.teacherId))?.name || '').toLowerCase();
          const filtered = list.filter((c: any) => {
            const ids = String(c.teacherId || c.teacher || '').toLowerCase();
            const names = String(c.teacherName || c.teacher || '').toLowerCase();
            if (ids && ids.includes(teacherKey)) return true;
            if (teacherNameFromList && names.includes(teacherNameFromList)) return true;
            return false;
          });
          setCourses(filtered.length > 0 ? filtered : list);
        } else {
          setCourses(list);
        }
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
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

  function handleEditCourse(id: string) {
    const ok = confirm(t('confirm_edit_course') || 'Confirm edit this course?');
    if (!ok) return;
    router.push(`/courses_manage/${encodeURIComponent(id)}/edit`);
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
      {canEdit && (
        <div style={{ marginBottom: 12 }}>
          <Link href="/dashboard/teacher/new-course" className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            新增課程
          </Link>
        </div>
      )}

      <div>
        <h4>{t('course_list')}</h4>
        {loading && <p>{t('loading')}</p>}
        {courses.length === 0 ? (
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
                          {t('edit') || 'Edit'}
                        </Button>
                        <Button
                          onClick={() => {
                            if (!canEdit) {
                              alert(t('no_permission') || 'You do not have permission');
                              return;
                            }
                            if (!confirm(t('confirm_delete_course'))) return;
                            handleDeleteCourse(c.id);
                          }}
                          variant="danger"
                        >
                          {t('delete')}
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

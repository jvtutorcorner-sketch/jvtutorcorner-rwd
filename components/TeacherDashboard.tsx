"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TEACHERS } from '@/data/teachers';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from './IntlProvider';
import Button from './UI/Button';
import Pagination from './Pagination';

type Props = { teacherId?: string; teacherName?: string };

export default function TeacherDashboard({ teacherId, teacherName }: Props) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [canEdit, setCanEdit] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Pagination & Search params
  const limitParam = parseInt(searchParams.get('limit') || '10', 10);
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const qCourse = searchParams.get('course') || '';
  const qTeacher = searchParams.get('teacher') || '';
  const qTimeFrom = searchParams.get('timeFrom') || '';
  const qTimeTo = searchParams.get('timeTo') || '';
  const includeTests = searchParams.get('includeTests') === 'true';

  const [searchInputCourse, setSearchInputCourse] = useState(qCourse);
  const [searchInputTeacher, setSearchInputTeacher] = useState(qTeacher);
  const [searchInputTimeFrom, setSearchInputTimeFrom] = useState(qTimeFrom);
  const [searchInputTimeTo, setSearchInputTimeTo] = useState(qTimeTo);

  useEffect(() => {
    (async () => {
      const s = getStoredUser();
      setUser(s);

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

      // Allow admins and demo teachers to edit. Also allow any stored user with role 'teacher' to edit their courses.
      if (s && (s.role === 'admin' || s.role === 'teacher' || (s.teacherId && s.teacherId === teacherId) || (profile && s.email === profile.email))) setCanEdit(true);
      if (s && s.email === 'teacher@test.com') setCanEdit(true);
      loadCourses(s);
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
      loadCourses(getStoredUser());
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

  async function loadCourses(storedUser?: any) {
    setLoading(true);
    try {
      const stored = storedUser || getStoredUser();
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

      if (includeTests) {
        url += (url.includes('?') ? '&' : '?') + 'includeTests=true';
      }

      const res = await fetch(url);
      const data = await res.json();

      if (res.ok && data?.data) {
        let list = Array.isArray(data.data) ? data.data : [];

        // ✅ Fallback：如果用 UUID 查詢無結果，嘗試用 email 再查一次（支援舊課程）
        if (list.length === 0 && myTeacherId && (stored?.email || stored?.email)) {
          const emailUrl = `/api/courses?teacherId=${encodeURIComponent(String(stored.email))}`;
          const emailRes = await fetch(emailUrl);
          const emailData = await emailRes.json();
          if (emailRes.ok && Array.isArray(emailData?.data)) {
            list = emailData.data;
          }
        }

        // Strict Client-side filtering to ensure no other teacher's courses leak
        if (stored?.role === 'teacher') {
          const tid = String(stored.teacherId || '').toLowerCase();
          const temail = String(stored.email || '').toLowerCase();
          const tname = String(myTeacherName || '').toLowerCase();

          list = list.filter((c: any) => {
            const cTid = String(c.teacherId || '').toLowerCase();
            const cTemail = String(c.teacherEmail || '').toLowerCase();
            const cTname = String(c.teacherName || c.teacher || '').toLowerCase();

            // If course has teacherId, match strictly on ID (UUID or email)
            if (cTid) {
              if (tid && cTid === tid) return true;  // 匹配 UUID
              if (temail && cTid === temail) return true;  // 匹配 email（向後相容）
            }
            // If course has teacherEmail, match on email (向後相容)
            if (cTemail && temail && cTemail === temail) return true;
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

  // Filter courses
  let filteredCourses = courses || [];
  if (filteredCourses.length > 0) {
    if (qCourse) {
      const lowerQ = qCourse.toLowerCase();
      filteredCourses = filteredCourses.filter(c =>
        (c.title || '').toLowerCase().includes(lowerQ)
      );
    }
    if (qTeacher && user?.role === 'admin') {
      const lowerT = qTeacher.toLowerCase();
      filteredCourses = filteredCourses.filter(c =>
        (c.teacherName || c.teacher || '').toLowerCase().includes(lowerT)
      );
    }
    if (qTimeFrom) {
      const fromMs = new Date(qTimeFrom).getTime();
      filteredCourses = filteredCourses.filter(c => {
        const start = new Date(c.nextStartDate || c.startDate).getTime();
        return start >= fromMs;
      });
    }
    if (qTimeTo) {
      const toMs = new Date(qTimeTo).getTime();
      filteredCourses = filteredCourses.filter(c => {
        const start = new Date(c.nextStartDate || c.startDate).getTime();
        return start <= toMs;
      });
    }
  }

  // Paginate
  const totalItems = filteredCourses.length;
  const startIndex = (pageParam - 1) * limitParam;
  const paginatedCourses = filteredCourses.slice(startIndex, startIndex + limitParam);

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
            {user?.role === 'admin' && (
              <Button onClick={() => router.push('/admin/course-reviews')} variant="outline" style={{ borderColor: '#3b82f6', color: '#3b82f6' }}>
                審核中心
              </Button>
            )}
          </div>
        </div>

        {/* Search Bar matching /student_courses pattern */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'flex-end', flexWrap: 'wrap', backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          {user?.role === 'admin' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold' }}>老師名稱</label>
              <input
                type="text"
                value={searchInputTeacher}
                onChange={(e) => setSearchInputTeacher(e.target.value)}
                placeholder="搜尋老師名稱..."
                style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '150px' }}
              />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold' }}>課程名稱</label>
            <input
              type="text"
              value={searchInputCourse}
              onChange={(e) => setSearchInputCourse(e.target.value)}
              placeholder="搜尋課程標題..."
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '200px' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold' }}>開始時間 (起)</label>
            <input
              type="datetime-local"
              value={searchInputTimeFrom}
              onChange={(e) => setSearchInputTimeFrom(e.target.value)}
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '180px' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold' }}>開始時間 (迄)</label>
            <input
              type="datetime-local"
              value={searchInputTimeTo}
              onChange={(e) => setSearchInputTimeTo(e.target.value)}
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '180px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {t('search')}
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchInputCourse('');
                setSearchInputTeacher('');
                setSearchInputTimeFrom('');
                setSearchInputTimeTo('');
                router.push(pathname);
              }}
              style={{ padding: '8px 16px', backgroundColor: '#9ca3af', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              重置
            </button>
          </div>
        </form>

        {loading && <p>{t('loading')}</p>}
        {!loading && paginatedCourses.length === 0 ? (
          <p className="muted">{t('no_courses')}</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #ccc' }}>
                <thead>
                  <tr>
                    <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>課程名稱</th>
                    <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>{t('teacher') || 'Teacher'}</th>
                    <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>時長</th>
                    <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>{t('start_date') || 'Start Date'}</th>
                    <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>結束時間</th>
                    <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>需消耗點數</th>
                    <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>狀態</th>
                    <th style={{ border: '2px solid #ccc', padding: '8px', textAlign: 'left', backgroundColor: '#f3f4f6', fontWeight: 600 }}>{t('actions') || 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCourses.map((c, idx) => (
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
                      <td style={{ border: '2px solid #ccc', padding: '8px' }}>{c.pointCost || 0} 點</td>
                      <td style={{ border: '2px solid #ccc', padding: '8px' }}>
                        {(() => {
                          const isPending = c.status === '待審核' || c.reviewStatus === 'pending';
                          const displayStatus = c.status || '-';

                          let bgColor = '#fef2f2';
                          let textColor = '#dc2626';

                          if (c.status === '上架') {
                            bgColor = '#f0fdf4';
                            textColor = '#059669';
                          } else if (c.status === '待審核') {
                            bgColor = '#eff6ff';
                            textColor = '#3b82f6';
                          } else if (c.status === '已退回') {
                            bgColor = '#fff1f2';
                            textColor = '#e11d48';
                          }

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{
                                color: textColor,
                                fontWeight: 600,
                                backgroundColor: bgColor,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.875rem',
                                width: 'fit-content'
                              }}>
                                {displayStatus}
                              </span>
                              {c.reviewStatus === 'pending' && (
                                <span style={{
                                  color: '#d97706',
                                  backgroundColor: '#fffbeb',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  width: 'fit-content',
                                  border: '1px solid #fcd34d'
                                }}>
                                  變更審核中
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
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

            <Pagination
              totalItems={totalItems}
              pageSize={limitParam}
              currentPage={pageParam}
            />
          </>
        )}
      </div>

    </div>
  );
}

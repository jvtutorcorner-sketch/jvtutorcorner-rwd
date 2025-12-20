"use client";

import { useEffect, useState } from 'react';
import { getStoredUser, PLAN_LABELS, type StoredUser } from '@/lib/mockAuth';

type Course = any;

export default function MyCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ title: '', description: '', pricePerSession: '', durationMinutes: '50', startDateTime: '', endDateTime: '', membershipPlan: '' });

  const [user, setUser] = useState<StoredUser | null>(null);
  const firstName = user?.firstName || '';
  const lastName = user?.lastName || '';
  // keep existing fetch identifier (some courses store teacher by lastName)
  const teacherName = user?.lastName || user?.email || '';
  const allowedPlans = Object.keys(PLAN_LABELS);
  // datatable controls
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    // load user from localStorage on mount and subscribe to auth changes
    if (typeof window !== 'undefined') {
      const syncUser = () => setUser(getStoredUser());
      syncUser();
      window.addEventListener('tutor:auth-changed', syncUser);
      return () => window.removeEventListener('tutor:auth-changed', syncUser);
    }
    // noop on server
    return;
  }, []);

  useEffect(() => {
    // fetch courses only after we know the user (so server/client initial render match)
    if (user && user.role === 'teacher') {
      fetchCourses();
    }
  }, [user]);

  // reset page when search or pageSize changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  async function fetchCourses() {
    setLoading(true);
    try {
      // prefer filtering by teacherId when available, fallback to teacherName for older entries
      const q = user?.teacherId ? `teacherId=${encodeURIComponent(String(user.teacherId))}` : `teacher=${encodeURIComponent(teacherName)}`;
      const res = await fetch(`/api/courses?${q}`);
      const json = await res.json();
      if (json?.ok) setCourses(json.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // derived: filter + pagination
  const filtered = courses.filter((c) => {
    if (!searchTerm) return true;
    const s = searchTerm.trim().toLowerCase();
    const inTitle = String(c.title || '').toLowerCase().includes(s);
    const inDesc = String(c.description || '').toLowerCase().includes(s);
    const inId = String(c.id || '').toLowerCase().includes(s);
    return inTitle || inDesc || inId;
  });
  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const displayed = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function validateForm() {
    const e: Record<string, string> = {};
    if (!form.title || form.title.trim().length < 3) e.title = '請輸入至少 3 個字的課程標題';
    if (form.title && form.title.trim().length > 50) e.title = '課程標題不可超過 50 字';
    if (!form.description || form.description.trim().length < 3) e.description = '請輸入課程描述（至少 3 個字）';
    if (form.description && form.description.trim().length > 200) e.description = '描述不可超過 200 字';
    if (form.pricePerSession && Number(form.pricePerSession) < 0) e.pricePerSession = '價格不可為負數';
    if (String(form.pricePerSession).trim() === '') e.pricePerSession = '請輸入價格';
    else if (Number.isNaN(Number(form.pricePerSession)) || !Number.isFinite(Number(form.pricePerSession))) e.pricePerSession = '價格必須為數字';
    else if (Number(form.pricePerSession) < 0) e.pricePerSession = '價格不可為負數';
    // duration fixed to 50 minutes
    if (String(form.durationMinutes).trim() === '' || Number(form.durationMinutes) !== 50) {
      e.durationMinutes = '時長固定為 50 分鐘';
    }
    // require start/end datetime (include seconds)
    if (!form.startDateTime) e.startDateTime = '請輸入開始日期時間';
    if (!form.endDateTime) e.endDateTime = '請輸入結束日期時間';
    // compare datetimes
    if (form.startDateTime && form.endDateTime) {
      const sd = new Date(form.startDateTime);
      const ed = new Date(form.endDateTime);
      if (isNaN(sd.getTime()) || isNaN(ed.getTime())) {
        e.startDateTime = e.startDateTime || '日期時間格式錯誤';
      } else if (sd.getTime() >= ed.getTime()) {
        e.endDateTime = '結束時間需晚於開始時間';
      }
    }
    // membershipPlan must be chosen (not empty)
    if (!form.membershipPlan) {
      e.membershipPlan = '請選擇會員方案';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSuccessMsg(null);
    const validation = validateForm();
    if (!validation) return;
    setSubmitting(true);
    const payload = {
      title: form.title,
      description: form.description,
      pricePerSession: Number(form.pricePerSession) || 0,
      durationMinutes: 50,
      // totalSessions and seatsLeft intentionally omitted
      // split datetime-local into date and time parts
      startDate: form.startDateTime ? String(form.startDateTime).split('T')[0] : null,
      endDate: form.endDateTime ? String(form.endDateTime).split('T')[0] : null,
      startTime: form.startDateTime ? String(form.startDateTime).split('T')[1] : null,
      endTime: form.endDateTime ? String(form.endDateTime).split('T')[1] : null,
      membershipPlan: form.membershipPlan || null,
      teacherName,
      teacherId: user?.teacherId || null,
      currency: 'USD',
    } as any;
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json?.ok) {
        setForm({ title: '', description: '', pricePerSession: '', durationMinutes: '50', startDateTime: '', endDateTime: '', membershipPlan: '' });
        fetchCourses();
        setSuccessMsg('已新增課程');
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setErrors({ form: json?.message || '新增失敗' });
      }
    } catch (err) {
      console.error(err);
      setErrors({ form: '新增錯誤' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('確定要刪除此課程？此操作不可復原。')) return;
    try {
      const res = await fetch(`/api/courses?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json?.ok) {
        fetchCourses();
        setSuccessMsg('已刪除課程');
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setErrors({ form: json?.message || '刪除失敗' });
      }
    } catch (err) {
      console.error(err);
      setErrors({ form: '刪除錯誤' });
    }
  }

  async function handleEdit(course: Course) {
    // ask for confirmation first
    if (!confirm(`確定要編輯課程「${course.title}」嗎？`)) return;

    // prompt for editable fields (simple inline prompts for demo)
    const newTitle = prompt('新的課程標題（留空表示不變）', course.title);
    if (newTitle === null) return; // cancelled
    const newPriceRaw = prompt('新的價格（每堂，留空表示不變）', String(course.pricePerSession ?? ''));
    if (newPriceRaw === null) return; // cancelled

    const updates: any = {};
    if (newTitle !== '' && newTitle !== course.title) updates.title = newTitle;
    if (newPriceRaw !== '') {
      const p = Number(newPriceRaw);
      if (!Number.isNaN(p)) updates.pricePerSession = p;
    }

    // if nothing to update, do nothing
    if (Object.keys(updates).length === 0) {
      alert('沒有變更，已取消。');
      return;
    }

    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(course.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (json?.ok) {
        fetchCourses();
        setSuccessMsg('已更新課程');
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setErrors({ form: json?.message || '更新失敗' });
      }
    } catch (err) {
      console.error(err);
      setErrors({ form: '更新錯誤' });
    }
  }

  if (!user) {
    return <div>請先登入以管理課程。</div>;
  }

  if (user.role !== 'teacher') {
    return <div>此功能僅提供教師使用。請以教師帳號登入或聯絡管理員。</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>我的課程</h1>
      <p>教師：{firstName} {lastName}</p>
      {/* count moved below course table per request */}

      <section style={{ marginTop: 16, marginBottom: 24 }}>
        <h2>新增課程</h2>
        <form onSubmit={handleCreate} style={{ display: 'grid', gap: 8, maxWidth: 720 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600 }}>課程標題 * <span style={{ color: '#b91c1c' }}>*</span></label>
            <input placeholder="課程標題" maxLength={50} value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ width: '100%', padding: 8 }} />
            {errors.title ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{errors.title}</div> : null}
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600 }}>描述 <span style={{ color: '#b91c1c' }}>*</span></label>
            <textarea placeholder="簡短描述" maxLength={200} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ width: '100%', padding: 8 }} />
            {errors.description ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{errors.description}</div> : null}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontWeight: 600 }}>價格（每堂，USD） <span style={{ color: '#b91c1c' }}>*</span></label>
              <input type="number" min="0" step="1" value={form.pricePerSession ?? ''} onChange={(e) => setForm({ ...form, pricePerSession: e.target.value })} style={{ width: '100%', padding: 8 }} />
              {errors.pricePerSession ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{errors.pricePerSession}</div> : null}
            </div>
            <div style={{ width: 140 }}>
              <label style={{ display: 'block', fontWeight: 600 }}>時長 (分鐘)</label>
              <input type="number" min="1" value={form.durationMinutes ?? '50'} disabled style={{ width: '100%', padding: 8, background: '#f3f4f6' }} />
              {errors.durationMinutes ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{errors.durationMinutes}</div> : null}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontWeight: 600 }}>開始 / 結束時間 (含時分秒) <span style={{ color: '#b91c1c' }}>*</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="datetime-local" step={1} value={form.startDateTime ?? ''} onChange={(e) => setForm({ ...form, startDateTime: e.target.value })} style={{ flex: 1, padding: 8 }} />
                <input type="datetime-local" step={1} value={form.endDateTime ?? ''} onChange={(e) => setForm({ ...form, endDateTime: e.target.value })} style={{ flex: 1, padding: 8 }} />
              </div>
              {errors.startDateTime ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{errors.startDateTime}</div> : null}
              {errors.endDateTime ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{errors.endDateTime}</div> : null}
            </div>
          </div>

          {/* totalSessions and seatsLeft removed per requirements */}

          <div>
            <label style={{ display: 'block', fontWeight: 600 }}>會員方案 *</label>
            <select value={form.membershipPlan ?? ''} onChange={(e) => setForm({ ...form, membershipPlan: e.target.value })} style={{ width: '100%', padding: 8 }}>
              <option value=''>請選擇</option>
              <option value='basic'>basic</option>
              <option value='pro'>pro</option>
              <option value='elite'>elite</option>
              <option value='其他'>其他</option>
            </select>
            {errors.membershipPlan ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{errors.membershipPlan}</div> : null}
          </div>

          {errors.form ? <div style={{ color: '#b91c1c', fontWeight: 600 }}>{errors.form}</div> : null}
          {successMsg ? <div style={{ color: '#16a34a', fontWeight: 600 }}>{successMsg}</div> : null}

          <div>
            <button type="submit" disabled={submitting} style={{ background: submitting ? '#9ca3af' : '#2563eb', color: '#fff', padding: '8px 14px', borderRadius: 6, border: 'none', cursor: submitting ? 'default' : 'pointer' }}>{submitting ? '提交中...' : '新增課程'}</button>
          </div>
        </form>
      </section>

      <section>
        <h2>課程列表</h2>
        {loading ? (
          <div>讀取中…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {totalFiltered === 0 ? (
              <div>尚無課程</div>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900, border: '2px solid #e5e7eb' }}>
                <thead>
                  <tr>
                    <th style={{ border: '2px solid #e5e7eb', padding: 8, textAlign: 'left' }}>標題</th>
                    <th style={{ border: '2px solid #e5e7eb', padding: 8, textAlign: 'left' }}>開始 (UTC)</th>
                    <th style={{ border: '2px solid #e5e7eb', padding: 8, textAlign: 'left' }}>結束 (UTC)</th>
                    <th style={{ border: '2px solid #e5e7eb', padding: 8, textAlign: 'right' }}>價格</th>
                    <th style={{ border: '2px solid #e5e7eb', padding: 8, textAlign: 'left' }}>會員方案</th>
                    <th style={{ border: '2px solid #e5e7eb', padding: 8, textAlign: 'left' }}>建立時間 (UTC)</th>
                    <th style={{ border: '2px solid #e5e7eb', padding: 8, textAlign: 'left' }}>更新時間 (UTC)</th>
                    <th style={{ border: '2px solid #e5e7eb', padding: 8, textAlign: 'center' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((c: Course) => {
                    // derive UTC start/end if possible
                    const toUtc = (dateStr?: string | null, timeStr?: string | null) => {
                      if (!dateStr) return '-';
                      try {
                        const datePart = String(dateStr);
                        const timePart = timeStr ? String(timeStr) : '00:00:00';
                        // Normalize timePart to include seconds if needed
                        const tp = timePart.length === 5 ? timePart + ':00' : timePart;
                        const iso = `${datePart}T${tp}`;
                        const d = new Date(iso);
                        if (isNaN(d.getTime())) return '-';
                        return d.toISOString();
                      } catch (e) {
                        return '-';
                      };
                    }

                    const startUtc = toUtc(c.startDate || c.nextStartDate, c.startTime);
                    const endUtc = toUtc(c.endDate, c.endTime);

                    return (
                      <tr data-course-id={c.id} key={c.id}>
                        <td style={{ border: '2px solid #e5e7eb', padding: 8 }}>{c.title}</td>
                        <td style={{ border: '2px solid #e5e7eb', padding: 8 }}>{startUtc}</td>
                        <td style={{ border: '2px solid #e5e7eb', padding: 8 }}>{endUtc}</td>
                        <td style={{ border: '2px solid #e5e7eb', padding: 8, textAlign: 'right' }}>{c.pricePerSession != null ? `USD ${c.pricePerSession}` : '-'}</td>
                        <td style={{ border: '2px solid #e5e7eb', padding: 8 }}>{c.membershipPlan || '-'}</td>
                        <td style={{ border: '2px solid #e5e7eb', padding: 8 }}>{c.createdAt ? (new Date(c.createdAt)).toISOString() : '-'}</td>
                        <td style={{ border: '2px solid #e5e7eb', padding: 8 }}>{c.updatedAt ? (new Date(c.updatedAt)).toISOString() : '-'}</td>
                        <td style={{ border: '2px solid #e5e7eb', padding: 8, textAlign: 'center' }}>
                          <a href={`/my-courses/${encodeURIComponent(c.id)}/edit`} style={{ marginRight: 8, padding: '6px 10px', display: 'inline-block', textDecoration: 'none', border: '1px solid #ccc', borderRadius: 4 }}>編輯</a>
                          <button onClick={() => handleDelete(c.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4 }}>刪除</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                </table>
                {/* datatable controls moved below the table */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    aria-label="搜尋課程"
                    placeholder="搜尋課程（標題 / 描述 / id）"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    每頁：
                    <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ padding: 6 }}>
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </label>
                </div>
                </div>
                {/* move count below table */}
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontWeight: 600, margin: 0 }}>顯示中 {displayed.length}/{totalFiltered} 筆課程</p>
                </div>
              </>
            )}
          </div>
        )}
      </section>
      {errors.form ? <div style={{ color: '#b91c1c', marginTop: 12 }}>{errors.form}</div> : null}
      {successMsg ? <div style={{ color: '#16a34a', marginTop: 12 }}>{successMsg}</div> : null}
    </div>
  );
}

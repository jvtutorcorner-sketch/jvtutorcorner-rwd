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
  const [form, setForm] = useState({ title: '', description: '', pricePerSession: '', durationMinutes: '60', totalSessions: '', seatsLeft: '', startDate: '', endDate: '', startTime: '', endTime: '', membershipPlan: '' });

  const [user, setUser] = useState<StoredUser | null>(null);
  const teacherName = user?.lastName || user?.email || '';
  const allowedPlans = Object.keys(PLAN_LABELS);

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

  async function fetchCourses() {
    setLoading(true);
    try {
      const res = await fetch(`/api/courses?teacher=${encodeURIComponent(teacherName)}`);
      const json = await res.json();
      if (json?.ok) setCourses(json.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function validateForm() {
    const e: Record<string, string> = {};
    if (!form.title || form.title.trim().length < 3) e.title = '請輸入至少 3 個字的課程標題';
    if (form.pricePerSession && Number(form.pricePerSession) < 0) e.pricePerSession = '價格不可為負數';
    if (form.durationMinutes && (!Number.isFinite(Number(form.durationMinutes)) || Number(form.durationMinutes) <= 0)) e.durationMinutes = '請輸入正整數分鐘數';
    if (form.totalSessions && Number(form.totalSessions) <= 0) e.totalSessions = '總堂數須為正整數';
    if (form.seatsLeft && Number(form.seatsLeft) < 0) e.seatsLeft = '剩餘名額不可為負數';
    if (form.startDate && form.endDate) {
      const sd = new Date(form.startDate);
      const ed = new Date(form.endDate);
      if (sd > ed) e.endDate = '結束日期需晚於或等於開始日期';
      if (sd.getTime() === ed.getTime() && form.startTime && form.endTime) {
        if (form.startTime >= form.endTime) e.endTime = '結束時間需晚於開始時間';
      }
    }
    if (form.membershipPlan && !allowedPlans.includes(form.membershipPlan)) {
      e.membershipPlan = `會員方案應為: ${allowedPlans.join(', ')}`;
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
      durationMinutes: Number(form.durationMinutes) || 60,
      totalSessions: form.totalSessions ? Number(form.totalSessions) : null,
      seatsLeft: form.seatsLeft ? Number(form.seatsLeft) : null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      membershipPlan: form.membershipPlan || null,
      teacherName,
    } as any;
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json?.ok) {
        setForm({ title: '', description: '', pricePerSession: '', durationMinutes: '60', totalSessions: '', seatsLeft: '', startDate: '', endDate: '', startTime: '', endTime: '', membershipPlan: '' });
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
    if (!confirm('確定要刪除此課程？')) return;
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

  if (!user) {
    return <div>請先登入以管理課程。</div>;
  }

  if (user.role !== 'teacher') {
    return <div>此功能僅提供教師使用。請以教師帳號登入或聯絡管理員。</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>我的課程</h1>
      <p>教師：{teacherName}</p>

      <section style={{ marginTop: 16, marginBottom: 24 }}>
        <h2>新增課程</h2>
        <form onSubmit={handleCreate} style={{ display: 'grid', gap: 8, maxWidth: 720 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600 }}>課程標題 *</label>
            <input placeholder="課程標題" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ width: '100%', padding: 8 }} />
            {errors.title ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{errors.title}</div> : null}
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600 }}>描述</label>
            <textarea placeholder="簡短描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ width: '100%', padding: 8 }} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontWeight: 600 }}>價格（每堂）</label>
              <input type="number" min="0" step="1" value={form.pricePerSession} onChange={(e) => setForm({ ...form, pricePerSession: e.target.value })} style={{ width: '100%', padding: 8 }} />
              {errors.pricePerSession ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{errors.pricePerSession}</div> : null}
            </div>
            <div style={{ width: 140 }}>
              <label style={{ display: 'block', fontWeight: 600 }}>時長 (分鐘)</label>
              <input type="number" min="1" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} style={{ width: '100%', padding: 8 }} />
              {errors.durationMinutes ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{errors.durationMinutes}</div> : null}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontWeight: 600 }}>開始 / 結束日期</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={{ flex: 1, padding: 8 }} />
                <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} style={{ flex: 1, padding: 8 }} />
              </div>
              {errors.endDate ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{errors.endDate}</div> : null}
            </div>
            <div style={{ width: 220 }}>
              <label style={{ display: 'block', fontWeight: 600 }}>開始 / 結束時間</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} style={{ flex: 1, padding: 8 }} />
                <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} style={{ flex: 1, padding: 8 }} />
              </div>
              {errors.endTime ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{errors.endTime}</div> : null}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontWeight: 600 }}>總堂數</label>
              <input type="number" min="1" value={form.totalSessions} onChange={(e) => setForm({ ...form, totalSessions: e.target.value })} style={{ width: '100%', padding: 8 }} />
              {errors.totalSessions ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{errors.totalSessions}</div> : null}
            </div>
            <div style={{ width: 160 }}>
              <label style={{ display: 'block', fontWeight: 600 }}>剩餘名額</label>
              <input type="number" min="0" value={form.seatsLeft} onChange={(e) => setForm({ ...form, seatsLeft: e.target.value })} style={{ width: '100%', padding: 8 }} />
              {errors.seatsLeft ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{errors.seatsLeft}</div> : null}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600 }}>會員方案（可留空）</label>
            <input placeholder={`可用: ${allowedPlans.join(', ')}`} value={form.membershipPlan} onChange={(e) => setForm({ ...form, membershipPlan: e.target.value })} style={{ width: '100%', padding: 8 }} />
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
        {loading ? (<div>讀取中…</div>) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {courses.length === 0 ? <li>尚無課程</li> : courses.map((c: Course) => (
              <li key={c.id} style={{ border: '1px solid #e5e7eb', padding: 12, marginBottom: 8, borderRadius: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.title}</div>
                    <div style={{ fontSize: 13, color: '#555' }}>{c.startDate || c.nextStartDate || ''} {c.startTime ? ` ${c.startTime}` : ''} - {c.endDate || ''} {c.endTime || ''}</div>
                    <div style={{ fontSize: 13, color: '#666' }}>會員方案：{c.membershipPlan || '無'}</div>
                  </div>
                  <div>
                    <button onClick={() => handleDelete(c.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4 }}>刪除</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {errors.form ? <div style={{ color: '#b91c1c', marginTop: 12 }}>{errors.form}</div> : null}
      {successMsg ? <div style={{ color: '#16a34a', marginTop: 12 }}>{successMsg}</div> : null}
    </div>
  );
}

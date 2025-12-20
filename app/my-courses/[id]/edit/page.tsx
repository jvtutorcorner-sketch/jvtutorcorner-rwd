'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function EditCoursePage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params?.id as string | undefined;
  const [loading, setLoading] = useState(false);
  const [course, setCourse] = useState<any | null>(null);
  const [form, setForm] = useState<any>({ title: '', description: '', pricePerSession: '', durationMinutes: '', totalSessions: '', seatsLeft: '', startDate: '', endDate: '', startTime: '', endTime: '', membershipPlan: '' });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    (async () => {
      try {
        // use collection GET with query id to avoid path-based mismatch
        const res = await fetch(`/api/courses?id=${encodeURIComponent(courseId)}`);
        const json = await res.json();
        if (json?.ok && (json.course || json.data)) {
          const c = json.course || (Array.isArray(json.data) ? json.data[0] : json.data);
          setCourse(c);
          setForm({
            title: c.title || '',
            description: c.description || '',
            pricePerSession: c.pricePerSession != null ? String(c.pricePerSession) : '',
            durationMinutes: c.durationMinutes != null ? String(c.durationMinutes) : '',
            totalSessions: c.totalSessions != null ? String(c.totalSessions) : '',
            seatsLeft: c.seatsLeft != null ? String(c.seatsLeft) : '',
            startDate: c.startDate || c.nextStartDate || '',
            endDate: c.endDate || '',
            startTime: c.startTime || '',
            endTime: c.endTime || '',
            membershipPlan: c.membershipPlan || '',
          });
        } else {
          // surface server message when available
          const msg = json?.message || '取得課程資料失敗';
          console.warn('[EditCourse] fetch error', msg);
          setError(msg);
        }
      } catch (e) {
        setError('取得課程資料錯誤');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!courseId) {
      setError('找不到課程');
      return;
    }
    const updates: any = {};
    if (form.title) updates.title = form.title;
    updates.description = form.description || '';
    if (form.pricePerSession !== '') updates.pricePerSession = Number(form.pricePerSession);
    if (form.durationMinutes !== '') updates.durationMinutes = Number(form.durationMinutes);
    if (form.totalSessions !== '') updates.totalSessions = Number(form.totalSessions);
    if (form.seatsLeft !== '') updates.seatsLeft = Number(form.seatsLeft);
    updates.startDate = form.startDate || null;
    updates.endDate = form.endDate || null;
    updates.startTime = form.startTime || null;
    updates.endTime = form.endTime || null;
    updates.membershipPlan = form.membershipPlan || null;

    try {
      const ok = typeof window !== 'undefined' ? window.confirm('確定要將變更儲存至課程？') : true;
      if (!ok) return;
      setLoading(true);
      const res = await fetch(`/api/courses/${encodeURIComponent(courseId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (res.ok && json?.ok) {
        // update local state with returned course and navigate back immediately
        if (json.course) setCourse(json.course);
        setSuccess('已更新課程');
        router.push('/my-courses');
      } else {
        const msg = json?.message || '更新失敗';
        console.warn('[EditCourse] patch failed', msg);
        setError(msg);
      }
    } catch (e) {
      setError('更新發生錯誤');
    } finally {
      setLoading(false);
    }
  }

  if (loading && !course) return <div>讀取中…</div>;
  if (error) return <div style={{ color: 'crimson' }}>{error}</div>;
  if (!course) return <div>找不到此課程</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>編輯課程</h1>
      <p>CourseId: {courseId}</p>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 8, maxWidth: 720 }}>
        <div>
          <label style={{ display: 'block', fontWeight: 600 }}>課程標題 *</label>
          <input value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ width: '100%', padding: 8 }} />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600 }}>描述</label>
          <textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ width: '100%', padding: 8 }} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 600 }}>價格（每堂）</label>
            <input type="number" min="0" value={form.pricePerSession ?? ''} onChange={(e) => setForm({ ...form, pricePerSession: e.target.value })} style={{ width: '100%', padding: 8 }} />
          </div>
          <div style={{ width: 140 }}>
            <label style={{ display: 'block', fontWeight: 600 }}>時長 (分鐘)</label>
            <input type="number" min="1" value={form.durationMinutes ?? ''} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} style={{ width: '100%', padding: 8 }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 600 }}>開始 / 結束日期</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" value={form.startDate ?? ''} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={{ flex: 1, padding: 8 }} />
              <input type="date" value={form.endDate ?? ''} onChange={(e) => setForm({ ...form, endDate: e.target.value })} style={{ flex: 1, padding: 8 }} />
            </div>
          </div>
          <div style={{ width: 220 }}>
            <label style={{ display: 'block', fontWeight: 600 }}>開始 / 結束時間</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="time" value={form.startTime ?? ''} onChange={(e) => setForm({ ...form, startTime: e.target.value })} style={{ flex: 1, padding: 8 }} />
              <input type="time" value={form.endTime ?? ''} onChange={(e) => setForm({ ...form, endTime: e.target.value })} style={{ flex: 1, padding: 8 }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 600 }}>總堂數</label>
            <input type="number" min="1" value={form.totalSessions ?? ''} onChange={(e) => setForm({ ...form, totalSessions: e.target.value })} style={{ width: '100%', padding: 8 }} />
          </div>
          <div style={{ width: 160 }}>
            <label style={{ display: 'block', fontWeight: 600 }}>剩餘名額</label>
            <input type="number" min="0" value={form.seatsLeft ?? ''} onChange={(e) => setForm({ ...form, seatsLeft: e.target.value })} style={{ width: '100%', padding: 8 }} />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600 }}>會員方案（可留空）</label>
          <input value={form.membershipPlan ?? ''} onChange={(e) => setForm({ ...form, membershipPlan: e.target.value })} style={{ width: '100%', padding: 8 }} />
        </div>

        {error ? <div style={{ color: 'crimson' }}>{error}</div> : null}
        {success ? <div style={{ color: '#16a34a' }}>{success}</div> : null}

        <div>
          <button type="submit" disabled={loading} style={{ background: loading ? '#9ca3af' : '#2563eb', color: '#fff', padding: '8px 14px', borderRadius: 6, border: 'none', cursor: loading ? 'default' : 'pointer' }}>{loading ? '提交中...' : '儲存變更'}</button>
          <button type="button" onClick={() => router.push('/my-courses')} style={{ marginLeft: 8, padding: '8px 12px' }}>取消</button>
        </div>
      </form>
    </div>
  );
}

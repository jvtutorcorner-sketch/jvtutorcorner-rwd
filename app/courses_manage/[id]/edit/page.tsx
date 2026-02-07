'use client';

import { useEffect, useState } from 'react';
import { PLAN_LABELS } from '@/lib/mockAuth';
import type { PlanId } from '@/lib/mockAuth';
import { useRouter, useParams } from 'next/navigation';

export default function EditCoursePage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params?.id as string | undefined;
  const [loading, setLoading] = useState(false);
  const [course, setCourse] = useState<any | null>(null);
  const [form, setForm] = useState<any>({ title: '', description: '', durationMinutes: '', startDateTime: '', endDateTime: '', membershipPlan: '' });
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
            // Normalize incoming datetime values for date / time inputs
            function toDateInput(val: any) {
              if (!val) return '';
              try {
                const d = new Date(val);
                if (isNaN(d.getTime())) return '';
                return d.toISOString().slice(0, 10);
              } catch (e) {
                return '';
              }
            }
            function toTimeInput(val: any) {
              if (!val) return '';
              try {
                const d = new Date(val);
                if (isNaN(d.getTime())) return '';
                return d.toTimeString().slice(0, 8); // HH:MM:SS
              } catch (e) {
                return '';
              }
            }

            const normalizedStart = c.nextStartDate || c.startDate || null;
            const normalizedEnd = c.endDate || null;

            // Combine date and time for datetime-local inputs
            function toDateTimeInput(val: any) {
              if (!val) return '';
              try {
                const d = new Date(val);
                if (isNaN(d.getTime())) return '';
                // Format as YYYY-MM-DDTHH:MM for datetime-local
                return d.toISOString().slice(0, 16);
              } catch (e) {
                return '';
              }
            }

            setForm({
              title: c.title || '',
              description: c.description || '',
              durationMinutes: c.durationMinutes != null ? String(c.durationMinutes) : '',
              startDateTime: toDateTimeInput(normalizedStart),
              endDateTime: toDateTimeInput(normalizedEnd),
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
    if (form.title !== undefined) updates.title = form.title;
    updates.description = form.description || '';
    updates.durationMinutes = 50; // Fixed duration
    // Combine date + time into ISO string for nextStartDate when provided
    if (form.startDateTime) {
      updates.nextStartDate = new Date(form.startDateTime).toISOString();
    }
    if (form.endDateTime) {
      updates.endDate = new Date(form.endDateTime).toISOString();
    }
    if (form.membershipPlan !== undefined) updates.membershipPlan = form.membershipPlan || null;

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
        if (json.course) setCourse(json.course);
        setSuccess('已更新課程');
        router.push('/courses_manage');
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
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>編輯課程</h1>
        <div>
          <button type="button" onClick={() => router.push('/courses_manage')} className="py-2 px-4 bg-blue-600 text-white rounded">回到列表</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 8, maxWidth: 720 }}>
        <div>
          <label style={{ display: 'block', fontWeight: 600 }}>課程標題 *</label>
          <input value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ width: '100%', padding: 8, backgroundColor: 'white' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600 }}>描述</label>
          <textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ width: '100%', padding: 8, backgroundColor: 'white' }} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 600 }}>時長 (分鐘)</label>
            <div style={{ padding: 8, backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4 }}>50 分鐘</div>
            <input type="hidden" name="durationMinutes" value="50" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 600 }}>開始時間</label>
            <input type="datetime-local" value={form.startDateTime ?? ''} onChange={(e) => setForm({ ...form, startDateTime: e.target.value })} style={{ width: '100%', padding: 8, backgroundColor: 'white' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 600 }}>結束時間</label>
            <input type="datetime-local" value={form.endDateTime ?? ''} onChange={(e) => setForm({ ...form, endDateTime: e.target.value })} style={{ width: '100%', padding: 8, backgroundColor: 'white' }} />
          </div>
        </div>

        {/* totalSessions and seatsLeft removed per request */}

        <div>
          <label style={{ display: 'block', fontWeight: 600 }}>會員方案</label>
          <select value={form.membershipPlan ?? ''} onChange={(e) => setForm({ ...form, membershipPlan: e.target.value })} style={{ width: '100%', padding: 8, backgroundColor: 'white' }}>
            <option value="">
              {form.membershipPlan ? `${PLAN_LABELS[form.membershipPlan as PlanId] || form.membershipPlan}（目前設定）` : '未設定'}
            </option>
            {Object.entries(PLAN_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {error ? <div style={{ color: 'crimson' }}>{error}</div> : null}
        {success ? <div style={{ color: '#16a34a' }}>{success}</div> : null}

        <div>
          <button type="submit" disabled={loading} style={{ background: loading ? '#9ca3af' : '#2563eb', color: '#fff', padding: '8px 14px', borderRadius: 6, border: 'none', cursor: loading ? 'default' : 'pointer' }}>{loading ? '提交中...' : '儲存變更'}</button>
          <button type="button" onClick={() => router.push('/courses_manage')} style={{ marginLeft: 8, padding: '8px 12px' }}>取消</button>
        </div>
      </form>
    </main>
  );
}

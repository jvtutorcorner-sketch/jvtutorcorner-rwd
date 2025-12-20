"use client";

import { useEffect, useState } from 'react';
import { getStoredUser } from '@/lib/mockAuth';

type Props = { teacherId: string; teacherName: string };

export default function TeacherDashboard({ teacherId, teacherName }: Props) {
  const [canEdit, setCanEdit] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
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

  // After courses are loaded, fetch related orders
  useEffect(() => {
    if (courses && courses.length > 0) {
      loadOrders();
    }
    // if no courses, clear orders
    if (!courses || courses.length === 0) setOrders([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses]);

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

  async function loadOrders() {
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      if (res.ok && data?.data) {
        setOrders(data.data.filter((o: any) => courses.some((c) => c.id === o.courseId)));
      }
    } catch (e) {}
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
      if (!res.ok) throw new Error(data?.message || '新增失敗');
      setNewCourseTitle(''); setNewCoursePrice(''); setNewStartDate(''); setNewMembershipPlan('');
      loadCourses();
      alert('已新增課程（示範）');
    } catch (err: any) {
      alert(err?.message || '新增課程失敗');
    }
  }

  async function handleDeleteCourse(id: string) {
    if (!confirm('確定刪除此課程（示範資料）？')) return;
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || '刪除失敗');
      loadCourses();
      alert('已刪除課程（示範）');
    } catch (err: any) {
      alert(err?.message || '刪除失敗');
    }
  }

  async function handlePatchCourse(id: string, updates: any) {
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || '更新失敗');
      loadCourses();
      alert('已更新課程（示範）');
    } catch (err: any) {
      alert(err?.message || '更新失敗');
    }
  }

  return (
    <div style={{ marginTop: 18 }}>
      <h3>教師管理面板</h3>
      {!canEdit ? (
        <p className="muted">非此老師或非管理者，僅顯示公開資訊。</p>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <p className="muted">管理功能已移除：若需新增或管理課程，請使用後台或專用管理介面。</p>
        </div>
      )}

      <div>
        <h4>課程列表</h4>
        {loading && <p>載入中…</p>}
        {courses.length === 0 ? <p className="muted">目前沒有課程</p> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {courses.map((c) => (
              <div key={c.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{c.title}</strong>
                    <div className="muted">NT$ {c.pricePerSession} • {c.subject}</div>
                    {c.nextStartDate ? <div className="muted">開始：{c.nextStartDate}</div> : null}
                    {c.membershipPlan ? <div className="muted">所屬方案：{c.membershipPlan}</div> : null}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {canEdit && <button onClick={() => {
                      const input = prompt('輸入新的開始日期（YYYY-MM-DD），留空則移除', c.nextStartDate || '');
                      if (input === null) return;
                      handlePatchCourse(c.id, { nextStartDate: input || null });
                    }}>設定開始</button>}
                    {canEdit && <button onClick={() => {
                      const mp = prompt('輸入所屬會員方案 key（如 basic/pro/elite），留空則移除', c.membershipPlan || '');
                      if (mp === null) return;
                      handlePatchCourse(c.id, { membershipPlan: mp || null });
                    }}>設定方案</button>}
                    {canEdit && <button onClick={() => handleDeleteCourse(c.id)} style={{ color: 'crimson' }}>刪除</button>}
                  </div>
                </div>
                {c.description ? <p style={{ marginTop: 8 }}>{c.description}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <h4>相關訂單</h4>
        {orders.length === 0 ? <p className="muted">沒有相關訂單。</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Order</th>
                <th>CourseId</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.orderId}>
                  <td>{o.orderNumber || o.orderId}</td>
                  <td>{o.courseId}</td>
                  <td>{o.amount}</td>
                  <td>{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

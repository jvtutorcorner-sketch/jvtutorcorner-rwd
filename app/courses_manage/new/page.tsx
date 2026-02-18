'use client';

import { useEffect, useState } from 'react';
import { PLAN_LABELS } from '@/lib/mockAuth';
import type { PlanId } from '@/lib/mockAuth';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/mockAuth';

export default function NewCoursePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState<any>({
        title: '',
        description: '',
        durationMinutes: '50',
        startDateTime: '',
        endDateTime: '',
        membershipPlan: ''
    });
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);

    useEffect(() => {
        const u = getStoredUser();
        setCurrentUser(u);
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        const updates: any = {};
        if (!form.title) {
            setError('請輸入課程標題');
            return;
        }
        updates.title = form.title;
        updates.description = form.description || '';
        updates.durationMinutes = Number(form.durationMinutes) || 50;

        // Combine date + time into ISO string for nextStartDate when provided
        if (form.startDateTime) {
            updates.nextStartDate = new Date(form.startDateTime).toISOString();
        }
        if (form.endDateTime) {
            updates.endDate = new Date(form.endDateTime).toISOString();
        }
        if (form.membershipPlan) updates.membershipPlan = form.membershipPlan;

        // Attach teacher info
        if (currentUser) {
            if (currentUser.teacherId) updates.teacherId = currentUser.teacherId;
            updates.teacherName = currentUser.displayName || currentUser.lastName || currentUser.name || 'Unknown Teacher';
        } else {
            // Fallback for dev/demo if not logged in?
            // Ideally should block or prompt login, but for now specific to teacher dashboard flow
            updates.teacherName = 'Demo Teacher';
        }

        // Default values
        updates.status = form.status || '上架';
        updates.subject = '其他';
        updates.level = '一般';
        updates.language = '中文';

        try {
            setLoading(true);
            const res = await fetch('/api/courses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            const json = await res.json();
            if (res.ok && json?.ok) {
                setSuccess('已建立課程');
                // Redirect to dashboard after short delay
                setTimeout(() => {
                    router.push('/dashboard/teacher');
                }, 1000);
            } else {
                const msg = json?.message || '建立失敗';
                setError(msg);
            }
        } catch (e) {
            setError('建立發生錯誤');
        } finally {
            setLoading(false);
        }
    }

    return (
        <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700 }}>新增課程</h1>
                <div>
                    <button type="button" onClick={() => router.push('/dashboard/teacher')} className="py-2 px-4 bg-blue-600 text-white rounded">回到儀表板</button>
                </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 8, maxWidth: 720 }}>
                <div>
                    <label style={{ display: 'block', fontWeight: 600 }}>課程標題 *</label>
                    <input
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        style={{ width: '100%', padding: 8, backgroundColor: 'white' }}
                        placeholder="請輸入標題"
                        required
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontWeight: 600 }}>描述</label>
                    <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ width: '100%', padding: 8, backgroundColor: 'white' }} />
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontWeight: 600 }}>時長 (分鐘)</label>
                        <div style={{ padding: 8, backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4 }}>
                            {form.durationMinutes} 分鐘
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontWeight: 600 }}>開始時間</label>
                        <input type="datetime-local" value={form.startDateTime} onChange={(e) => setForm({ ...form, startDateTime: e.target.value })} style={{ width: '100%', padding: 8, backgroundColor: 'white' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontWeight: 600 }}>結束時間</label>
                        <input type="datetime-local" value={form.endDateTime} onChange={(e) => setForm({ ...form, endDateTime: e.target.value })} style={{ width: '100%', padding: 8, backgroundColor: 'white' }} />
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', fontWeight: 600 }}>會員方案</label>
                    <select value={form.membershipPlan} onChange={(e) => setForm({ ...form, membershipPlan: e.target.value })} style={{ width: '100%', padding: 8, backgroundColor: 'white' }}>
                        <option value="">未設定</option>
                        {Object.entries(PLAN_LABELS)
                            .filter(([key]) => key !== 'viewer')
                            .map(([key, label]) => (
                                <option key={key} value={key}>
                                    {label}
                                </option>
                            ))}
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', fontWeight: 600 }}>課程狀態</label>
                    <select
                        value={form.status || '上架'}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                        style={{ width: '100%', padding: 8, backgroundColor: 'white' }}
                    >
                        <option value="上架">上架</option>
                        <option value="下架">下架</option>
                    </select>
                </div>

                {error ? <div style={{ color: 'crimson' }}>{error}</div> : null}
                {success ? <div style={{ color: '#16a34a' }}>{success}</div> : null}

                <div style={{ marginTop: 16 }}>
                    <button type="submit" disabled={loading} style={{ background: loading ? '#9ca3af' : '#2563eb', color: '#fff', padding: '8px 14px', borderRadius: 6, border: 'none', cursor: loading ? 'default' : 'pointer' }}>
                        {loading ? '建立中...' : '建立課程'}
                    </button>
                </div>
            </form>
        </main>
    );
}

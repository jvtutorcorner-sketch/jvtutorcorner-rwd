"use client";

import { useState } from 'react';
import { useT } from './IntlProvider';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/mockAuth';

export default function NewCourseForm({ onSuccess }: { onSuccess?: () => void }) {
  const t = useT();
  const router = useRouter();
  const [form, setForm] = useState({
    title: '',
    description: '',
    duration: '50',
    status: '上架',
    start_time: '',
    end_time: '',
    membershipPlan: '',
  });

  const [preview, setPreview] = useState<string | null>(null); // kept for compatibility if needed
  const [success, setSuccess] = useState<boolean | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const handleChange = (e: any) => {
    const { name, value } = e.target;

    // Update form value first
    const next = { ...form, [name]: value } as any;
    setForm(next);

    // If start_time or end_time changed, validate ordering using timestamps (supports seconds)
    if (name === 'start_time' || name === 'end_time') {
      const s = next.start_time ? new Date(next.start_time).getTime() : null;
      const e = next.end_time ? new Date(next.end_time).getTime() : null;
      const durationMinutes = parseInt(next.duration || '50', 10) || 50;
      const durationMs = durationMinutes * 60 * 1000;

      if (s && e) {
        if (e < s) {
          setTimeError('結束時間不能早於開始時間');
        } else if (e - s < durationMs) {
          setTimeError(`所選區間需至少 ${durationMinutes} 分鐘`);
        } else {
          setTimeError(null);
        }
      } else {
        setTimeError(null);
      }
    }

    if (name === 'membershipPlan') {
      if (!value) setPlanError('請選擇方案');
      else setPlanError(null);
    }
  };

  const submitForm = async (e: any) => {
    e.preventDefault();

    try {
      // TODO: connect to real API endpoint
      const stored = getStoredUser();

      const payload: any = {
        title: form.title,
        description: form.description,
        durationMinutes: Number(form.duration) || 50,
        membershipPlan: form.membershipPlan || null,
        nextStartDate: form.start_time || null,
        endDate: form.end_time || null,
        status: form.status || '上架',
      };
      if (stored) {
        payload.teacherName = stored.displayName || `${stored.firstName || ''} ${stored.lastName || ''}`.trim() || stored.email;
        payload.teacherId = stored.teacherId || null;
      }

      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || res.status !== 201) {
        setSuccess(false);
        return;
      }

      setSuccess(true);
      // Refresh the current page so the dashboard re-fetches courses
      try {
        router.refresh();
      } catch (e) {}

      // notify other components in the window (e.g., TeacherDashboard) to reload
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('courses:updated'));
        }
      } catch (e) {}

      onSuccess?.();
    } catch (err) {
      setSuccess(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">新增課程</h2>
      <form onSubmit={submitForm} className="space-y-4">
        {/* cover removed per request */}
        <div>
          <label className="block font-medium mb-2">課程名稱</label>
          <input name="title" value={form.title} onChange={handleChange} required className="w-full border px-3 py-2 rounded" />
        </div>

        <div>
          <label className="block font-medium mb-2">課程描述</label>
          <textarea name="description" value={form.description} onChange={handleChange} rows={3} required className="w-full border px-3 py-2 rounded" />
        </div>

        <div>
          <label className="block font-medium mb-2">時長</label>
          <div className="w-full border px-3 py-2 rounded bg-gray-50">50 分鐘</div>
          <input type="hidden" name="duration" value="50" />
        </div>

        <div>
          <label className="block font-medium mb-2">狀態</label>
          <select name="status" value={form.status} onChange={handleChange} className="w-full border px-3 py-2 rounded">
            <option value="上架">上架</option>
            <option value="下架">下架</option>
          </select>
        </div>

        {/* price removed per request */}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-medium mb-2">開始時間</label>
            <input type="datetime-local" step="1" name="start_time" value={form.start_time} onChange={handleChange} className="w-full border px-3 py-2 rounded" />
          </div>

          <div>
            <label className="block font-medium mb-2">結束時間</label>
            <input type="datetime-local" step="1" name="end_time" value={form.end_time} onChange={handleChange} min={form.start_time || undefined} className="w-full border px-3 py-2 rounded" />
          </div>
        </div>

        {timeError && <p className="text-red-600">{timeError}</p>}

        <div>
          <label className="block font-medium mb-2">{t('membership_plan') || '所屬方案'}</label>
          <select name="membershipPlan" value={form.membershipPlan} onChange={handleChange} className="w-full border px-3 py-2 rounded">
            <option value="">請選擇方案</option>
            <option value="basic">{t('basic_plan') || '普通會員'}</option>
            <option value="pro">{t('pro_plan') || '中級會員'}</option>
            <option value="elite">{t('elite_plan') || '高級會員'}</option>
          </select>
          {planError && <p className="text-red-600 mt-2">{planError}</p>}
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={!!timeError || !!planError || !form.membershipPlan} className="py-2 px-4 bg-blue-600 text-white rounded disabled:opacity-60" >建立課程</button>
          {success === true && <span className="text-green-600">已建立</span>}
          {success === false && <span className="text-red-600">建立失敗</span>}
        </div>
      </form>
    </div>
  );
}

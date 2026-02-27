// components/EnrollButton.tsx
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';
import Modal from '@/components/Modal';

interface EnrollButtonProps {
  courseId: string;
  courseTitle: string;
  requiredPlan?: 'basic' | 'pro' | 'elite';
  price?: number;
  currency?: string;
  durationMinutes?: number;
}

type Enrollment = {
  id?: string;
  name: string;
  email: string;
  courseId: string;
  courseTitle: string;
  createdAt: string;
};

export const EnrollButton: React.FC<EnrollButtonProps> = ({
  courseId,
  courseTitle,
  requiredPlan = 'basic',
  price = 0,
  currency = 'TWD',
  durationMinutes = 0,
}) => {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [selectedStartTime, setSelectedStartTime] = useState<string>('');
  const [showStartTimeModal, setShowStartTimeModal] = useState(false);
  const [storedUser, setStoredUserState] = useState<any>(null);

  useEffect(() => {
    // Set initial user on client
    setStoredUserState(getStoredUser());

    // 使用者要求：預設為目前時間加 60 分鐘
    const defaultDate = new Date();
    defaultDate.setMinutes(defaultDate.getMinutes() + 60);

    // Format to local ISO string (YYYY-MM-DDTHH:mm)
    const tzoffset = defaultDate.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(defaultDate.getTime() - tzoffset)).toISOString().slice(0, 16);
    setSelectedStartTime(localISOTime);

    const handler = () => setStoredUserState(getStoredUser());
    window.addEventListener('tutor:auth-changed', handler);
    return () => window.removeEventListener('tutor:auth-changed', handler);
  }, []);

  const handleEnrollAndOrder = async () => {
    if (!storedUser) return;
    if (!selectedStartTime) {
      setError('請選擇開始時間');
      return;
    }

    const contactEmail = storedUser.email;
    const contactName = storedUser.email.split('@')[0] || storedUser.email;

    // Calculate endTime
    let endTime = '';
    if (selectedStartTime && durationMinutes) {
      const start = new Date(selectedStartTime);
      const end = new Date(start.getTime() + durationMinutes * 60000);
      const tzoffset = end.getTimezoneOffset() * 60000;
      endTime = (new Date(end.getTime() - tzoffset)).toISOString().slice(0, 16);
    }

    const payload = {
      name: contactName.trim(),
      email: contactEmail.trim(),
      courseId,
      courseTitle,
      startTime: selectedStartTime,
      endTime: endTime || undefined,
    };

    try {
      setIsSubmitting(true);
      setError(null);

      // ✅ 時間衝突檢查：取得使用者已有的訂單，確認是否有時間區間重疊
      const selectedStart = new Date(selectedStartTime).getTime();
      const selectedEnd = endTime ? new Date(endTime).getTime() : selectedStart + 60 * 60000;

      const checkRes = await fetch(`/api/orders?limit=100&userId=${encodeURIComponent(storedUser.email)}`);
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        const existingOrders: any[] = checkData?.data || [];

        for (const existing of existingOrders) {
          if (!existing.startTime) continue;

          // 跳過取消/失敗的訂單
          const existingStatus = String(existing.status || '').toUpperCase();
          if (existingStatus === 'CANCELLED' || existingStatus === 'FAILED') continue;

          // 跳過同一課程的訂單（允許重複報名同一課程）
          if (existing.courseId === courseId) continue;

          const existingStart = new Date(existing.startTime).getTime();
          let existingEnd: number;
          if (existing.endTime) {
            existingEnd = new Date(existing.endTime).getTime();
          } else if (existing.durationMinutes) {
            existingEnd = existingStart + existing.durationMinutes * 60000;
          } else {
            existingEnd = existingStart + 60 * 60000;
          }

          // 檢查是否有時間交集：若兩個區間不是「完全不重疊」，則有衝突
          const hasOverlap = selectedStart < existingEnd && selectedEnd > existingStart;
          if (hasOverlap) {
            const conflictTitle = existing.courseTitle || existing.courseId || '其他課程';
            const conflictStart = new Date(existing.startTime).toLocaleString();
            const conflictEnd = existing.endTime ? new Date(existing.endTime).toLocaleString() : '未知';
            setError(`此時間段（${new Date(selectedStartTime).toLocaleString()} ~ ${endTime ? new Date(endTime).toLocaleString() : '未知'}）與已報名的「${conflictTitle}」（${conflictStart} ~ ${conflictEnd}）有時間重疊，請選擇其他時段。`);
            return;
          }
        }
      }

      const res = await fetch('/api/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || '報名失敗，請稍後再試。');
        return;
      }

      const enrollment: Enrollment = data.enrollment || {
        ...payload,
        createdAt: new Date().toISOString(),
      };

      // Create Order
      const orderPayload = {
        courseId,
        enrollmentId: (enrollment as any).id,
        amount: price,
        currency: currency,
        userId: storedUser.email, // Pass userId for correct linking
        startTime: selectedStartTime,
        endTime: endTime || undefined,
      };

      console.log('[EnrollButton] Sending payload to /api/orders:', orderPayload);

      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      if (!orderRes.ok) throw new Error('Failed to create order');

      // Success! Show success message and wait a bit
      setIsSuccess(true);
      setShowStartTimeModal(false);
      setTimeout(() => {
        router.push('/student_courses');
      }, 2000); // 2 second delay for the user to see success
    } catch (err) {
      console.error('Enroll/Order error:', err);
      setError(t('enroll_error_network'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const PLAN_LEVELS: Record<string, number> = {
    viewer: 0,
    basic: 1,
    pro: 2,
    elite: 3,
  };

  const userPlan = storedUser?.plan || 'viewer';
  const userLevel = PLAN_LEVELS[userPlan] || 0;
  const requiredLevel = PLAN_LEVELS[requiredPlan] || 1;
  const isPlanSufficient = userLevel >= requiredLevel;

  return (
    <>
      <button
        className="enroll-button"
        onClick={() => setShowStartTimeModal(true)}
        disabled={!storedUser || !isPlanSufficient || storedUser.role === 'teacher' || isSubmitting || isSuccess}
        title={
          !storedUser
            ? t('enroll_title_login')
            : storedUser.role === 'teacher'
              ? '老師帳號無法報名學生課程'
              : !isPlanSufficient
                ? `需要 ${requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)} 方案才能報名此課程`
                : `${t('enroll_title_logged_prefix')} ${storedUser.email} ${t('enroll_title_logged_suffix')}`
        }
      >
        {isSubmitting ? t('loading') : isSuccess ? '報名成功！正在跳轉...' : t('enroll_button_label')}
      </button>

      {showStartTimeModal && (
        <Modal onClose={() => setShowStartTimeModal(false)}>
          <div className="p-4">
            <h2 className="text-xl font-bold mb-4">確認報名課程</h2>
            <p className="mb-6 text-gray-600">請確認您預計開始上課的時間。報名成功後，系統將為您建立專屬學習計畫。</p>

            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="start-time" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                選擇課程開始時間:
              </label>
              <input
                id="start-time"
                type="datetime-local"
                value={selectedStartTime}
                onChange={(e) => setSelectedStartTime(e.target.value)}
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '2px solid #e5e7eb',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'all 0.2s',
                  backgroundColor: '#f9fafb'
                }}
              />
              <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#eff6ff', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                <p style={{ fontSize: '0.85rem', color: '#1e40af', lineHeight: '1.5' }}>
                  <strong>配置說明：</strong><br />
                  此時間將作為您第一堂課的建議開始時間。系統會根據此設定為您預約導師並準備教學環境。若需更改，請於課程開始前 24 小時至會員中心調整。
                </p>
              </div>
            </div>

            {error && <p className="form-error mb-4" style={{ color: '#d32f2f' }}>{error}</p>}

            <div className="flex justify-end space-x-3 mt-8">
              <button
                onClick={() => setShowStartTimeModal(false)}
                className="px-6 py-2 border border-gray-300 rounded-lg hober:bg-gray-50 transition-colors"
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                onClick={handleEnrollAndOrder}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-md disabled:bg-blue-300"
                disabled={isSubmitting || !selectedStartTime}
              >
                {isSubmitting ? '處理中...' : '確認報名'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {!storedUser && (
        <p className="auth-warning">{t('enroll_login_hint_before')} <Link href="/login">{t('login')}</Link>{t('enroll_login_hint_after')}</p>
      )}

      {storedUser && storedUser.role === 'teacher' && (
        <p className="auth-warning" style={{ color: '#d32f2f' }}>
          老師帳號無法報名此課程。
        </p>
      )}

      {storedUser && storedUser.role !== 'teacher' && !isPlanSufficient && (
        <p className="auth-warning" style={{ color: '#d32f2f' }}>
          您的 {userPlan} 方案無法報名此課程，請升級至 {requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)} 方案或更高等級。
        </p>
      )}
    </>
  );
};

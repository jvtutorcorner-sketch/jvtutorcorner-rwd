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
  pointCost?: number;          // 每堂所需點數
  enrollmentType?: 'plan' | 'points' | 'both';  // 報名方式
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
  pointCost,
  enrollmentType = 'plan',
}) => {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [selectedStartTime, setSelectedStartTime] = useState<string>('');
  const [showStartTimeModal, setShowStartTimeModal] = useState(false);
  const [storedUser, setStoredUserState] = useState<any>(null);
  // 點數相關
  const [userPoints, setUserPoints] = useState<number | null>(null);
  const [payMethod, setPayMethod] = useState<'plan' | 'points'>(
    enrollmentType === 'points' ? 'points' : 'plan'
  );

  useEffect(() => {
    setStoredUserState(getStoredUser());

    const defaultDate = new Date();
    defaultDate.setMinutes(defaultDate.getMinutes() + 60);
    const tzoffset = defaultDate.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(defaultDate.getTime() - tzoffset)).toISOString().slice(0, 16);
    setSelectedStartTime(localISOTime);

    const handler = () => setStoredUserState(getStoredUser());
    window.addEventListener('tutor:auth-changed', handler);
    return () => window.removeEventListener('tutor:auth-changed', handler);
  }, []);

  // 取得使用者點數餘額
  useEffect(() => {
    if (!storedUser?.email) return;
    if (enrollmentType === 'plan') return;  // 純方案制不需要查點數
    fetch(`/api/points?userId=${encodeURIComponent(storedUser.email)}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setUserPoints(d.balance); })
      .catch(() => {});
  }, [storedUser, enrollmentType]);

  const handleEnrollAndOrder = async () => {
    if (!storedUser) return;
    if (!selectedStartTime) {
      setError('請選擇開始時間');
      return;
    }

    // 點數報名：先驗餘額
    if (payMethod === 'points') {
      if (!pointCost || pointCost <= 0) {
        setError('此課程未設定點數費用');
        return;
      }
      if (userPoints === null || userPoints < pointCost) {
        setError(`點數不足，目前餘額 ${userPoints ?? 0} 點，需要 ${pointCost} 點`);
        return;
      }
    }

    const contactEmail = storedUser.email;
    const contactName = storedUser.email.split('@')[0] || storedUser.email;

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

      // 時間衝突檢查
      const selectedStart = new Date(selectedStartTime).getTime();
      const selectedEnd = endTime ? new Date(endTime).getTime() : selectedStart + 60 * 60000;

      const checkRes = await fetch(`/api/orders?limit=100&userId=${encodeURIComponent(storedUser.email)}`);
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        const existingOrders: any[] = checkData?.data || [];

        for (const existing of existingOrders) {
          if (!existing.startTime) continue;
          const existingStatus = String(existing.status || '').toUpperCase();
          if (existingStatus === 'CANCELLED' || existingStatus === 'FAILED') continue;
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

      // 點數扣點
      if (payMethod === 'points' && pointCost && pointCost > 0) {
        const deductRes = await fetch('/api/points', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: storedUser.email,
            action: 'deduct',
            amount: pointCost,
            reason: `報名課程：${courseTitle}`,
          }),
        });
        const deductData = await deductRes.json();
        if (!deductRes.ok || !deductData.ok) {
          setError(deductData.error || '點數扣除失敗，報名已取消');
          return;
        }
        setUserPoints(deductData.balance);
      }

      // 建立訂單（點數報名 amount 為 0，方案報名 amount 為原價）
      const orderPayload = {
        courseId,
        enrollmentId: (enrollment as any).id,
        amount: payMethod === 'points' ? 0 : price,
        currency,
        userId: storedUser.email,
        startTime: selectedStartTime,
        endTime: endTime || undefined,
        paymentMethod: payMethod === 'points' ? 'points' : undefined,
        pointsUsed: payMethod === 'points' ? pointCost : undefined,
      };

      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      if (!orderRes.ok) throw new Error('Failed to create order');

      setIsSuccess(true);
      setShowStartTimeModal(false);
      setTimeout(() => {
        router.push('/student_courses');
      }, 2000);
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

  // 是否可用點數報名
  const canUsePoints = (enrollmentType === 'points' || enrollmentType === 'both') && !!pointCost;
  // 是否可用方案報名
  const canUsePlan = enrollmentType !== 'points';

  // 按鈕是否可用
  const isEnrollable = storedUser &&
    storedUser.role !== 'teacher' &&
    (canUsePlan ? isPlanSufficient : canUsePoints);

  return (
    <>
      <button
        className="enroll-button"
        onClick={() => setShowStartTimeModal(true)}
        disabled={!isEnrollable || isSubmitting || isSuccess}
        title={
          !storedUser
            ? t('enroll_title_login')
            : storedUser.role === 'teacher'
              ? '老師帳號無法報名學生課程'
              : !canUsePlan && !canUsePoints
                ? '此課程目前不開放報名'
                : canUsePlan && !isPlanSufficient && !canUsePoints
                  ? `需要 ${requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)} 方案才能報名此課程`
                  : `${t('enroll_title_logged_prefix')} ${storedUser.email} ${t('enroll_title_logged_suffix')}`
        }
      >
        {isSubmitting ? t('loading') : isSuccess ? '報名成功！正在跳轉...' : t('enroll_button_label')}
      </button>

      {/* 點數餘額顯示 */}
      {storedUser && canUsePoints && userPoints !== null && (
        <p style={{ marginTop: 6, fontSize: '0.83rem', color: userPoints >= (pointCost ?? 0) ? '#059669' : '#dc2626' }}>
          💎 點數餘額：{userPoints} 點{pointCost ? `（本課需 ${pointCost} 點）` : ''}
        </p>
      )}

      {showStartTimeModal && (
        <Modal onClose={() => setShowStartTimeModal(false)}>
          <div className="p-4">
            <h2 className="text-xl font-bold mb-4">確認報名課程</h2>
            <p className="mb-4 text-gray-600">請確認您預計開始上課的時間。</p>

            {/* 付款方式選擇器（enrollmentType === 'both' 才顯示） */}
            {enrollmentType === 'both' && canUsePoints && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  付款方式：
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setPayMethod('plan')}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 8,
                      border: payMethod === 'plan' ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                      backgroundColor: payMethod === 'plan' ? '#eff6ff' : '#f9fafb',
                      color: payMethod === 'plan' ? '#1d4ed8' : '#374151',
                      fontWeight: payMethod === 'plan' ? 700 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    📅 方案報名
                    <div style={{ fontSize: '0.78rem', marginTop: 2, fontWeight: 400 }}>
                      需 {requiredPlan.toUpperCase()} 方案
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod('points')}
                    disabled={(userPoints ?? 0) < (pointCost ?? 0)}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 8,
                      border: payMethod === 'points' ? '2px solid #7c3aed' : '2px solid #e5e7eb',
                      backgroundColor: payMethod === 'points' ? '#f5f3ff' : '#f9fafb',
                      color: payMethod === 'points' ? '#7c3aed' : '#374151',
                      fontWeight: payMethod === 'points' ? 700 : 400,
                      cursor: (userPoints ?? 0) < (pointCost ?? 0) ? 'not-allowed' : 'pointer',
                      opacity: (userPoints ?? 0) < (pointCost ?? 0) ? 0.5 : 1,
                    }}
                  >
                    💎 點數報名
                    <div style={{ fontSize: '0.78rem', marginTop: 2, fontWeight: 400 }}>
                      扣 {pointCost} 點（餘 {userPoints ?? 0} 點）
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* 純點數制 - 顯示點數資訊 */}
            {enrollmentType === 'points' && (
              <div style={{ marginBottom: 16, padding: '10px 14px', backgroundColor: '#f5f3ff', borderRadius: 8, borderLeft: '4px solid #7c3aed' }}>
                <p style={{ fontSize: '0.88rem', color: '#6d28d9' }}>
                  💎 <strong>點數報名：</strong>本課程需扣 <strong>{pointCost} 點</strong>，您目前有 <strong>{userPoints ?? 0} 點</strong>
                </p>
              </div>
            )}

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
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                onClick={handleEnrollAndOrder}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-md disabled:bg-blue-300"
                disabled={isSubmitting || !selectedStartTime}
              >
                {isSubmitting ? '處理中...' : payMethod === 'points' ? `確認報名（扣 ${pointCost} 點）` : '確認報名'}
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

      {storedUser && storedUser.role !== 'teacher' && canUsePlan && !isPlanSufficient && !canUsePoints && (
        <p className="auth-warning" style={{ color: '#d32f2f' }}>
          您的 {userPlan} 方案無法報名此課程，請升級至 {requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)} 方案或更高等級。
        </p>
      )}

      {storedUser && storedUser.role !== 'teacher' && enrollmentType === 'points' && !canUsePlan && (userPoints ?? 0) < (pointCost ?? 0) && (
        <p className="auth-warning" style={{ color: '#d32f2f' }}>
          點數不足，此課程需要 {pointCost} 點，您目前有 {userPoints ?? 0} 點。請先購買點數套餐。
        </p>
      )}
    </>
  );
};

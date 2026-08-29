// components/EnrollButton.tsx
"use client";

import { useState, useEffect, useRef } from 'react';
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
  startDate?: string;
  endDate?: string;
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
  startDate,
  endDate,
}) => {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const isPointsErrorRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoadingPoints, setIsLoadingPoints] = useState(false); // Added loading state for points
  const [selectedStartTime, setSelectedStartTime] = useState<string>('');
  const [showStartTimeModal, setShowStartTimeModal] = useState(false);
  const [storedUser, setStoredUserState] = useState<any>(null);
  // 點數相關
  const [userPoints, setUserPoints] = useState<number | null>(null);
  const [payMethod, setPayMethod] = useState<'plan' | 'points'>(
    enrollmentType === 'points' || (Number(pointCost) > 0 && enrollmentType !== 'plan') 
      ? 'points' 
      : 'plan'
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
    if (enrollmentType === 'plan' && (!pointCost || pointCost <= 0)) return;  // 純方案制且無點數需求時不需要查點數
    
    setIsLoadingPoints(true);
    fetch(`/api/points?userId=${encodeURIComponent(storedUser.roid_id || storedUser.id || storedUser.email)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { 
        if (d.ok) {
          setUserPoints(d.balance);
          // If points are updated and previously there was a point-related error, clear it
          if (isPointsErrorRef.current) {
            isPointsErrorRef.current = false;
            setError(null);
          }
        }
      })
      .catch(() => { })
      .finally(() => setIsLoadingPoints(false));
  }, [storedUser?.email, enrollmentType, pointCost]);

  const handleEnrollAndOrder = async () => {
    if (!storedUser) return;
    if (!selectedStartTime) {
      setError(t('enroll_error_select_start_time'));
      return;
    }

    // 點數報名：先驗餘額
    console.log('[EnrollButton] handleEnrollAndOrder: payMethod=', payMethod, 'pointCost=', pointCost, 'userPoints=', userPoints);
    if (payMethod === 'points') {
      if (!pointCost || pointCost <= 0) {
        console.error('[EnrollButton] pointCost missing or zero');
        setError(t('enroll_error_no_point_cost'));
        return;
      }
      if (userPoints === null || userPoints < pointCost) {
        console.error('[EnrollButton] insufficient points:', userPoints, '<', pointCost);
        isPointsErrorRef.current = true;
        setError(t('enroll_error_insufficient_points').replace('{balance}', String(userPoints ?? 0)).replace('{cost}', String(pointCost)));
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
      isPointsErrorRef.current = false;

      // 時間衝突檢查
      const selectedStart = new Date(selectedStartTime).getTime();
      const selectedEnd = endTime ? new Date(endTime).getTime() : selectedStart + 60 * 60000;

      const checkRes = await fetch(`/api/orders?limit=100&userId=${encodeURIComponent(storedUser.roid_id || storedUser.id || storedUser.email)}`);
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
            const conflictTitle = existing.courseTitle || existing.courseId || t('enroll_other_course_fallback');
            const conflictStart = new Date(existing.startTime).toLocaleString();
            const conflictEnd = existing.endTime ? new Date(existing.endTime).toLocaleString() : t('unknown');
            setError(t('enroll_error_time_conflict')
              .replace('{startTime}', new Date(selectedStartTime).toLocaleString())
              .replace('{endTime}', endTime ? new Date(endTime).toLocaleString() : t('unknown'))
              .replace('{conflictTitle}', conflictTitle)
              .replace('{conflictStart}', conflictStart)
              .replace('{conflictEnd}', conflictEnd));
            setIsSubmitting(false); // Make sure to stop submission
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
        setError(data.error || t('enroll_error_generic_failed'));
        return;
      }

      const enrollment: Enrollment = data.enrollment || {
        ...payload,
        createdAt: new Date().toISOString(),
      };

      const enrollmentId = (enrollment as any).id;

      // 建立訂單（點數報名 amount 為 0，方案報名 amount 為原價）
      // 後端現在會自動處理點數扣除
      const orderPayload = {
        courseId,
        enrollmentId,
        amount: payMethod === 'points' ? 0 : price,
        currency,
        userId: storedUser.roid_id || storedUser.id || storedUser.email,
        startTime: selectedStartTime,
        endTime: endTime || undefined,
        paymentMethod: payMethod === 'points' ? 'points' : undefined,
        pointsUsed: payMethod === 'points' ? pointCost : undefined,
        status: payMethod === 'points' ? 'PAID' : 'PENDING', // Points order is PAID immediately
      };

      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      const orderData = await orderRes.json();
      
      if (!orderRes.ok || !orderData.ok) {
        setError(orderData.error || t('enroll_error_order_failed'));
        return;
      }

      // Sync enrollment status to PAID if it was a point-based order
      if (payMethod === 'points' && enrollmentId) {
        await fetch('/api/enroll', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: enrollmentId, status: 'PAID' }),
        });
      }

      setIsSuccess(true);
      
      // Dispatch points updated event so other pages (like /pricing) know to re-fetch
      if (payMethod === 'points') {
        window.dispatchEvent(new Event('tutor:points-updated'));
      }
      
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

  // 是否可用點數報名 (若有設定點數且不是純方案制，或者明確標示為 points/both)
  const canUsePoints = (enrollmentType === 'points' || enrollmentType === 'both' || (Number(pointCost) > 0)) && !!pointCost;
  // 是否可用方案報名
  const canUsePlan = enrollmentType !== 'points';

  // 決定是否顯示付款方式選擇器 (只要兩者皆可用)
  const showMethodSelector = canUsePlan && canUsePoints;

  // 是否在課程期間
  const now = new Date();
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  // If dates are not set, assume it's enrollable for now (or handle as TBD)
  // But per request, we should check if it's WITHIN the range if range exists
  const isDateValid = (!start || now >= start) && (!end || now <= end);

  // 按鈕是否可用
  const isEnrollable = storedUser &&
    storedUser.role !== 'teacher' &&
    (canUsePlan ? isPlanSufficient : canUsePoints) &&
    isDateValid;

  console.log('[EnrollButton Render]', {
    courseId,
    enrollmentType,
    pointCost,
    canUsePlan,
    canUsePoints,
    showMethodSelector,
    userPoints,
    isLoadingPoints,
    payMethod,
    isPlanSufficient
  });

  return (
    <>
      <button
        className="enroll-button"
        onClick={() => {
          setError(null);
          setShowStartTimeModal(true);
        }}
        disabled={!isEnrollable || isSubmitting || isSuccess || isLoadingPoints}
        title={
          !storedUser
            ? t('enroll_title_login')
            : storedUser.role === 'teacher'
              ? t('enroll_title_teacher_blocked')
              : !isDateValid
                ? t('enroll_title_out_of_period')
                : !canUsePlan && !canUsePoints
                  ? t('enroll_title_not_open')
                  : canUsePlan && !isPlanSufficient && !canUsePoints
                    ? t('enroll_title_plan_required').replace('{plan}', requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1))
                    : [t('enroll_title_logged_prefix'), storedUser.email, t('enroll_title_logged_suffix')].filter(Boolean).join(' ')
        }
      >
        {isSubmitting ? t('loading') : isSuccess ? t('enroll_success_redirecting') : !isDateValid ? t('enroll_button_out_of_period') : t('enroll_button_label')}
      </button>

      {/* 點數餘額顯示 */}
      {storedUser && canUsePoints && userPoints !== null && (
        <p style={{ marginTop: 6, fontSize: '0.83rem', color: userPoints >= (pointCost ?? 0) ? '#059669' : '#dc2626' }}>
          {t('enroll_points_balance_label')}{userPoints} {t('unit_points')}{pointCost ? t('enroll_points_balance_required_suffix').replace('{cost}', String(pointCost)) : ''}
        </p>
      )}

      {showStartTimeModal && (
        <Modal onClose={() => setShowStartTimeModal(false)}>
          <div className="p-4">
            <h2 className="text-xl font-bold mb-4">{t('enroll_modal_title')}</h2>
            <p className="mb-4 text-gray-600">{t('enroll_modal_subtitle')}</p>

            {/* 付款方式選擇器（只要兩者皆可用才顯示） */}
            {showMethodSelector && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  {t('enroll_modal_payment_method_label')}
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
                    {t('enroll_modal_pay_with_plan')}
                    <div style={{ fontSize: '0.78rem', marginTop: 2, fontWeight: 400 }}>
                      {t('enroll_modal_requires_plan').replace('{plan}', requiredPlan.toUpperCase())}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod('points')}
                    disabled={isLoadingPoints || (userPoints ?? 0) < (pointCost ?? 0)}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 8,
                      border: payMethod === 'points' ? '2px solid #7c3aed' : '2px solid #e5e7eb',
                      backgroundColor: payMethod === 'points' ? '#f5f3ff' : '#f9fafb',
                      color: payMethod === 'points' ? '#7c3aed' : '#374151',
                      fontWeight: payMethod === 'points' ? 700 : 400,
                      cursor: isLoadingPoints || (userPoints ?? 0) < (pointCost ?? 0) ? 'not-allowed' : 'pointer',
                      opacity: isLoadingPoints || (userPoints ?? 0) < (pointCost ?? 0) ? 0.5 : 1,
                    }}
                  >
                    {t('enroll_modal_pay_with_points')}
                    <div style={{ fontSize: '0.78rem', marginTop: 2, fontWeight: 400 }}>
                      {isLoadingPoints ? t('loading') : t('enroll_modal_points_cost_balance').replace('{cost}', String(pointCost)).replace('{balance}', String(userPoints ?? 0))}
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* 純點數制 - 顯示點數資訊 */}
            {enrollmentType === 'points' && (
              <div style={{ marginBottom: 16, padding: '10px 14px', backgroundColor: '#f5f3ff', borderRadius: 8, borderLeft: '4px solid #7c3aed' }}>
                <p style={{ fontSize: '0.88rem', color: '#6d28d9' }}>
                  {t('enroll_modal_pay_with_points')}：{t('enroll_modal_points_only_desc').replace('{cost}', String(pointCost)).replace('{balance}', String(userPoints ?? 0))}
                </p>
              </div>
            )}

            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="start-time" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                {t('enroll_modal_start_time_label')}
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
                  <strong>{t('enroll_modal_config_note_title')}</strong><br />
                  {t('enroll_modal_config_note_body')}
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
                {t('cancel')}
              </button>
              <button
                onClick={handleEnrollAndOrder}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-md disabled:bg-blue-300"
                disabled={isSubmitting || !selectedStartTime || isLoadingPoints || (payMethod === 'points' && (userPoints === null || userPoints < (pointCost ?? 0)))}
              >
                {isSubmitting ? t('processing') : payMethod === 'points' ? t('enroll_confirm_with_points').replace('{cost}', String(pointCost)) : t('enroll_confirm_title')}
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
          {t('enroll_warning_teacher_blocked')}
        </p>
      )}

      {storedUser && storedUser.role !== 'teacher' && canUsePlan && !isPlanSufficient && !canUsePoints && (
        <p className="auth-warning" style={{ color: '#d32f2f' }}>
          {t('enroll_warning_plan_insufficient').replace('{userPlan}', userPlan).replace('{requiredPlan}', requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1))}
        </p>
      )}

      {storedUser && storedUser.role !== 'teacher' && enrollmentType === 'points' && !canUsePlan && (userPoints ?? 0) < (pointCost ?? 0) && (
        <p className="auth-warning" style={{ color: '#d32f2f' }}>
          {t('enroll_warning_points_insufficient').replace('{cost}', String(pointCost)).replace('{balance}', String(userPoints ?? 0))}
        </p>
      )}
    </>
  );
};

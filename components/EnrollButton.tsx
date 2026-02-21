// components/EnrollButton.tsx
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';

interface EnrollButtonProps {
  courseId: string;
  courseTitle: string;
  requiredPlan?: 'basic' | 'pro' | 'elite';
  price?: number;
  currency?: string;
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
}) => {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [storedUser, setStoredUserState] = useState<any>(null);

  useEffect(() => {
    // Set initial user on client
    setStoredUserState(getStoredUser());

    const handler = () => setStoredUserState(getStoredUser());
    window.addEventListener('tutor:auth-changed', handler);
    return () => window.removeEventListener('tutor:auth-changed', handler);
  }, []);

  const handleEnrollAndOrder = async () => {
    if (!storedUser) return;

    const contactEmail = storedUser.email;
    const contactName = storedUser.email.split('@')[0] || storedUser.email;

    const payload = {
      name: contactName.trim(),
      email: contactEmail.trim(),
      courseId,
      courseTitle,
    };

    try {
      setIsSubmitting(true);
      setError(null);

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
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          enrollmentId: (enrollment as any).id,
          amount: price,
          currency: currency,
          userId: storedUser.email, // Pass userId for correct linking
        }),
      });

      if (!orderRes.ok) throw new Error('Failed to create order');

      // Success! Show success message and wait a bit
      setIsSuccess(true);
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
        onClick={handleEnrollAndOrder}
        disabled={!storedUser || !isPlanSufficient || storedUser.role === 'teacher' || isSubmitting}
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

      {error && <p className="form-error" style={{ color: '#d32f2f', marginTop: '10px' }}>{error}</p>}
    </>
  );
};

// components/EnrollButton.tsx
"use client";

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';

interface EnrollButtonProps {
  courseId: string;
  courseTitle: string;
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
}) => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submissions, setSubmissions] = useState<Enrollment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [storedUser, setStoredUserState] = useState(() => (typeof window !== 'undefined' ? getStoredUser() : null));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setStoredUserState(getStoredUser());
    window.addEventListener('tutor:auth-changed', handler);
    return () => window.removeEventListener('tutor:auth-changed', handler);
  }, []);

  const resetForm = () => {
    setName('');
    setEmail('');
    setError(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement> | null) => {
    if (e) e.preventDefault();

    // If storedUser exists, use its email as contact; otherwise fallback to form inputs
    const contactEmail = storedUser?.email || email;
    const contactName = storedUser ? (storedUser.email.split('@')[0] || storedUser.email) : name;

    if (!contactName.trim() || !contactEmail.trim()) {
      setError(t('enroll_error_fill'));
      return;
    }

    if (!contactEmail.includes('@')) {
      setError(t('enroll_error_email_format'));
      return;
    }

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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        console.error('報名 API 回傳錯誤:', data);
        setError(data.error || '報名失敗，請稍後再試。');
        return;
      }

      const enrollment: Enrollment =
        data.enrollment || {
          ...payload,
          createdAt: new Date().toISOString(),
        };

      console.log('前端收到報名成功回應:', enrollment);

      setSubmissions((prev) => [...prev, enrollment]);
      // 建立對應訂單
      try {
        const orderRes = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseId,
            enrollmentId: (enrollment as any).id,
            amount: 0,
            currency: 'TWD',
          }),
        });

        const orderData = await orderRes.json();
        console.log('訂單建立回應:', orderData);

        // demo: simulate payment webhook
        if (orderData?.order?.orderId) {
          await fetch('/api/payments/webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: orderData.order.orderId, status: 'PAID' }),
          });
          alert(t('enroll_alert_payment_simulated'));
        }
      } catch (err) {
        console.error('建立訂單或模擬付款失敗:', err);
        alert(t('enroll_alert_order_error'));
      }

      resetForm();
      setConfirmOpen(false);
      setIsOpen(false);
    } catch (err) {
      console.error('呼叫 /api/enroll 時發生錯誤:', err);
      setError(t('enroll_error_network'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        className="enroll-button"
        onClick={() => {
          if (!storedUser) {
            // not logged in: do nothing (button disabled visually); provide hint instead
            return;
          }
          // logged in: open confirmation modal
          setConfirmOpen(true);
        }}
        disabled={!storedUser}
        title={!storedUser ? t('enroll_title_login') : `${t('enroll_title_logged_prefix')} ${storedUser.email} ${t('enroll_title_logged_suffix')}`}
      >
        {t('enroll_button_label')}
      </button>

      {!storedUser && (
        <p className="auth-warning">{t('enroll_login_hint_before')} <Link href="/login">{t('login')}</Link>{t('enroll_login_hint_after')}</p>
      )}

      {submissions.length > 0 && (
        <p className="enroll-summary">
          {t('enroll_submissions_received_prefix')} {submissions.length} {t('enroll_submissions_received_suffix')}
        </p>
      )}

      {/* Confirmation modal for logged-in users */}
      {confirmOpen && (
        <div className="modal-backdrop" onClick={() => setConfirmOpen(false)}>
          <div
            className="modal"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <h3>{t('enroll_confirm_title')}</h3>
            <p className="modal-subtitle">{t('enroll_confirm_subtitle_prefix')} {courseTitle}</p>
            <p>{t('enroll_confirm_message_prefix')} <strong>{storedUser?.email}</strong> {t('enroll_confirm_message_suffix')}</p>

            {error && <p className="form-error">{error}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="modal-button secondary"
                onClick={() => setConfirmOpen(false)}
                disabled={isSubmitting}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="modal-button primary"
                onClick={() => handleSubmit(null)}
                disabled={isSubmitting}
              >
                {isSubmitting ? t('processing') : t('enroll_confirm_create_order')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

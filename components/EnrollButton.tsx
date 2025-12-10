// components/EnrollButton.tsx
"use client";

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { getStoredUser } from '@/lib/mockAuth';

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
  const [isOpen, setIsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submissions, setSubmissions] = useState<Enrollment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const storedUser = typeof window !== 'undefined' ? getStoredUser() : null;

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
      setError('請填寫姓名與 Email。');
      return;
    }

    if (!contactEmail.includes('@')) {
      setError('Email 格式看起來不正確。');
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
          alert('已模擬付款完成，課程應已生效（Demo）。');
        }
      } catch (err) {
        console.error('建立訂單或模擬付款失敗:', err);
        alert('報名成功，但建立訂單或模擬付款時發生錯誤（請查看 console）。');
      }

      resetForm();
      setConfirmOpen(false);
      setIsOpen(false);
    } catch (err) {
      console.error('呼叫 /api/enroll 時發生錯誤:', err);
      setError('無法連線到伺服器，請稍後再試。');
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
        title={!storedUser ? '請先登入以報名課程' : `以 ${storedUser.email} 報名`}
      >
        立即報名
      </button>

      {!storedUser && (
        <p className="auth-warning">請先登入才能報名，請先前往 <Link href="/login">登入</Link>。</p>
      )}

      {submissions.length > 0 && (
        <p className="enroll-summary">
          已收到 {submissions.length} 筆報名（Demo，重新整理頁面會重置）。
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
            <h3>確認報名</h3>
            <p className="modal-subtitle">課程：{courseTitle}</p>
            <p>你將使用帳號：<strong>{storedUser?.email}</strong> 進行報名。確定要建立報名並建立訂單嗎？</p>

            {error && <p className="form-error">{error}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="modal-button secondary"
                onClick={() => setConfirmOpen(false)}
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                type="button"
                className="modal-button primary"
                onClick={() => handleSubmit(null)}
                disabled={isSubmitting}
              >
                {isSubmitting ? '處理中…' : '確認並建立訂單'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

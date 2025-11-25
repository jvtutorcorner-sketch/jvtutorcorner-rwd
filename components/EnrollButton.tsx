// components/EnrollButton.tsx
'use client';

import { useState, FormEvent } from 'react';

interface EnrollButtonProps {
  courseId: string;
  courseTitle: string;
}

type Enrollment = {
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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submissions, setSubmissions] = useState<Enrollment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setName('');
    setEmail('');
    setError(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!name.trim() || !email.trim()) {
      setError('請填寫姓名與 Email。');
      return;
    }

    if (!email.includes('@')) {
      setError('Email 格式看起來不正確。');
      return;
    }

    const payload = {
      name: name.trim(),
      email: email.trim(),
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
      resetForm();
      setIsOpen(false);
      alert('已送出報名意願（Demo），目前資料已送到 /api/enroll。');
    } catch (err) {
      console.error('呼叫 /api/enroll 時發生錯誤:', err);
      setError('無法連線到伺服器，請稍後再試。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button className="enroll-button" onClick={() => setIsOpen(true)}>
        立即報名
      </button>

      {submissions.length > 0 && (
        <p className="enroll-summary">
          已收到 {submissions.length} 筆報名（Demo，重新整理頁面會重置）。
        </p>
      )}

      {isOpen && (
        <div className="modal-backdrop" onClick={() => setIsOpen(false)}>
          <div
            className="modal"
            onClick={(e) => {
              e.stopPropagation(); // 避免點到內容也關閉
            }}
          >
            <h3>報名課程</h3>
            <p className="modal-subtitle">課程：{courseTitle}</p>

            <form onSubmit={handleSubmit} className="modal-form">
              <div className="field">
                <label htmlFor="name">姓名</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="請輸入您的姓名"
                />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@mail.com"
                />
              </div>

              {error && <p className="form-error">{error}</p>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-button secondary"
                  onClick={() => {
                    resetForm();
                    setIsOpen(false);
                  }}
                  disabled={isSubmitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="modal-button primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? '送出中…' : '送出報名'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

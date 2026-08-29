'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

// 禁用靜態生成，因為此頁面依賴動態查詢參數
export const dynamic = 'force-dynamic';

function EmailVerifiedContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [redirectCount, setRedirectCount] = useState(5);
  const [resendEmail, setResendEmail] = useState(searchParams.get('email') || '');
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resendMessage, setResendMessage] = useState('');

  const messageParam = searchParams.get('message');
  const errorParam = searchParams.get('error');
  const canResend = errorParam === 'token_expired';

  useEffect(() => {
    if (!messageParam && !errorParam) {
      router.push('/login');
      return;
    }

    // 連結過期時停留在頁面上，讓使用者可以重新發送驗證信；其餘情況 5 秒後自動跳轉到登入頁面
    if (canResend) return;

    const timer = setInterval(() => {
      setRedirectCount(prev => {
        if (prev <= 1) {
          router.push('/login');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [messageParam, errorParam, router, canResend]);

  async function handleResend() {
    if (!resendEmail.trim()) {
      setResendStatus('error');
      setResendMessage('請輸入註冊時使用的 Email');
      return;
    }
    setResendStatus('sending');
    setResendMessage('');
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResendStatus('error');
        setResendMessage(data?.error || '發送失敗，請稍後再試');
        return;
      }
      setResendStatus('sent');
      setResendMessage(data?.message || '驗證信已重新發送，請檢查您的郵箱');
    } catch (e) {
      setResendStatus('error');
      setResendMessage('發送失敗，請稍後再試');
    }
  }

  let title = '';
  let message = '';
  let icon = '❌';
  let className = 'error';

  switch (messageParam) {
    case 'email_verified':
      title = '電子郵件驗證成功！';
      message = '您的帳號電子郵件已成功驗證。您現在可以使用此帳號登入。';
      icon = '✅';
      className = 'success';
      break;
    default:
      break;
  }

  switch (errorParam) {
    case 'invalid_verification_link':
      title = '驗證連結無效';
      message = '驗證連結無效或已過期。請重新註冊帳號或聯繫支援。';
      icon = '❌';
      className = 'error';
      break;
    case 'invalid_token':
      title = '驗證令牌不符';
      message = '驗證令牌不匹配。請確認您使用的是正確的驗證連結。';
      icon = '❌';
      className = 'error';
      break;
    case 'token_expired':
      title = '驗證連結已過期';
      message = '驗證連結已過期（有效期為 24 小時）。請點擊下方按鈕重新發送驗證信，不需要重新註冊帳號。';
      icon = '⏰';
      className = 'warning';
      break;
    case 'verification_failed':
      title = '驗證失敗';
      message = '驗證過程中發生錯誤。請稍後重試或聯繫支援。';
      icon = '⚠️';
      className = 'error';
      break;
    default:
      break;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="card" style={{ maxWidth: '500px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>
          {icon}
        </div>
        <h1>{title}</h1>
        <p style={{ fontSize: '16px', color: '#666', marginBottom: '30px', lineHeight: '1.6' }}>
          {message}
        </p>

        {canResend && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px', textAlign: 'left' }}>
            <label style={{ fontSize: '14px', color: '#444' }}>註冊 Email</label>
            <input
              type="email"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              placeholder="請輸入註冊時使用的 Email"
              disabled={resendStatus === 'sending' || resendStatus === 'sent'}
              style={{ padding: '10px', border: '1px solid #ddd', borderRadius: 4, fontSize: '14px' }}
            />
            <button
              type="button"
              className="modal-button primary"
              onClick={handleResend}
              disabled={resendStatus === 'sending' || resendStatus === 'sent'}
            >
              {resendStatus === 'sending' ? '發送中...' : resendStatus === 'sent' ? '已發送' : '重新發送驗證信'}
            </button>
            {resendMessage && (
              <p style={{ fontSize: '13px', color: resendStatus === 'error' ? '#ef4444' : '#10b981', margin: 0 }}>
                {resendMessage}
              </p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          <Link href="/login" className="modal-button primary">
            前往登入
          </Link>
          <Link href="/" className="modal-button secondary">
            返回首頁
          </Link>
        </div>

        {!canResend && (
          <p style={{ fontSize: '12px', color: '#999' }}>
            系統將在 {redirectCount} 秒後自動跳轉到登入頁面...
          </p>
        )}
      </div>

      <style jsx>{`
        .success {
          color: #10b981;
        }
        .error {
          color: #ef4444;
        }
        .warning {
          color: #f59e0b;
        }
      `}</style>
    </div>
  );
}

export default function EmailVerifiedPage() {
  return (
    <div className="page">
      <Suspense fallback={
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card">
            <p>載入中...</p>
          </div>
        </div>
      }>
        <EmailVerifiedContent />
      </Suspense>
    </div>
  );
}

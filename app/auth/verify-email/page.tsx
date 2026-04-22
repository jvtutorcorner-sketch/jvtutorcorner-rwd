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

  const messageParam = searchParams.get('message');
  const errorParam = searchParams.get('error');

  useEffect(() => {
    if (!messageParam && !errorParam) {
      router.push('/login');
      return;
    }

    // 5 秒後自動跳轉到登入頁面
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
  }, [messageParam, errorParam, router]);

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
      message = '驗證連結已過期（有效期為 24 小時）。請重新註冊帳號以獲得新的驗證連結。';
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          <Link href="/login" className="modal-button primary">
            前往登入
          </Link>
          <Link href="/" className="modal-button secondary">
            返回首頁
          </Link>
        </div>

        <p style={{ fontSize: '12px', color: '#999' }}>
          系統將在 {redirectCount} 秒後自動跳轉到登入頁面...
        </p>
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

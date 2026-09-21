'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest,
        pathname: typeof window !== 'undefined' ? window.location.pathname : undefined,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="zh-TW">
      <body>
        <div style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>應用程式發生嚴重錯誤</h1>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            我們已經記錄這個問題，請重新整理頁面再試一次。
          </p>
          <button
            onClick={reset}
            style={{
              padding: '0.5rem 1.5rem',
              borderRadius: '0.5rem',
              border: '1px solid #ccc',
              cursor: 'pointer',
            }}
          >
            重試
          </button>
        </div>
      </body>
    </html>
  );
}

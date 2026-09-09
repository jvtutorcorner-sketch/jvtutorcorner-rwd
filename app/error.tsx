'use client';

import { useEffect } from 'react';

export default function ErrorBoundary({
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
    <div style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>發生了一些問題</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        頁面發生非預期的錯誤，我們已經記錄下來。請重試，或稍後再回來看看。
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
  );
}

'use client';
// components/classroom/RecordingConsentDialog.tsx
//
// Recording-consent dialog (Phase 3b scaffolding — INERT by default). Only shown
// when NEXT_PUBLIC_CLASS_SUMMARY_ENABLED === 'true'. Recording still requires the
// SERVER flag CLASS_SUMMARY_ENABLED and BOTH parties' consent (canRecord) before
// anything is captured. The consent wording below is a PLACEHOLDER pending legal
// review — do not enable recording in production until legal has signed off.

import { useState } from 'react';

interface Props {
  courseId: string;
  orderId: string;
  startTime: string; // ISO scheduled start (drives buildSummaryId)
  onConsent: (summaryId: string) => void;
  onDecline: () => void;
}

export default function RecordingConsentDialog({ courseId, orderId, startTime, onConsent, onDecline }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (agreed: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/class-summaries/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, orderId, startTime, agreed }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        if (agreed && typeof j.summaryId === 'string') onConsent(j.summaryId);
        else onDecline();
      } else {
        setError(j?.error || '無法送出,請稍後再試');
      }
    } catch {
      setError('連線失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      role="dialog"
      aria-modal="true"
    >
      <div style={{ background: '#fff', borderRadius: 14, maxWidth: 460, width: '100%', padding: 24, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#5b21b6', marginBottom: 12 }}>課堂錄音同意</h2>
        <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
          為了在課後產生逐字稿與學習摘要,本堂課會錄下你的麥克風音訊。錄音只在<b>師生雙方都同意</b>時才會開始,
          僅用於本課程的課後整理,並依方案保存期後刪除。你可以拒絕,拒絕不影響上課。
        </p>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '10px 0 18px' }}>
          (同意條款文字為暫定版本,待法務確認後定稿。)
        </p>
        {error && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => submit(false)} disabled={busy} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: busy ? 'default' : 'pointer' }}>
            拒絕錄音
          </button>
          <button type="button" onClick={() => submit(true)} disabled={busy} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: busy ? 'default' : 'pointer' }}>
            {busy ? '送出中…' : '我同意錄音'}
          </button>
        </div>
      </div>
    </div>
  );
}

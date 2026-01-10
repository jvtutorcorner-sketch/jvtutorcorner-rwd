"use client";

import React from 'react';
import { useT } from '@/components/IntlProvider';

export default function WaitCountdownModal({
  show,
  seconds,
  onStay,
  onLeave,
  title,
  message,
  stayLabel,
  leaveLabel,
}: {
  show: boolean;
  seconds: number;
  onStay: () => void;
  onLeave: () => void;
  title?: string | null;
  message?: string | null;
  stayLabel?: string | null;
  leaveLabel?: string | null;
}) {
  const t = useT();
  if (!show) return null;
  const titleText = title ?? t('wait_countdown_title') ?? '等待即將結束';
  const messageText = message ?? t('wait_countdown_message') ?? '若沒有任何動作，將自動返回首頁。';
  const stayText = stayLabel ?? t('wait_countdown_stay') ?? '留下';
  const leaveText = leaveLabel ?? t('wait_countdown_leave') ?? '離開';
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.3)', width: 420, textAlign: 'center' }}>
        <h3 style={{ margin: 0 }}>{titleText}</h3>
        <p style={{ marginTop: 8 }}>{messageText}</p>
        <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8 }}>{seconds}s</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="card-button" onClick={onStay} style={{ padding: '8px 14px' }}>{stayText}</button>
          <button className="card-button secondary" onClick={onLeave} style={{ padding: '8px 14px' }}>{leaveText}</button>
        </div>
      </div>
    </div>
  );
}

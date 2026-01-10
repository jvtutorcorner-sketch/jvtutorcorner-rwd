"use client";

import React from 'react';
import { useT } from '@/components/IntlProvider';

export default function WaitCountdownModal({
  show,
  seconds,
  onStay,
  onLeave,
}: {
  show: boolean;
  seconds: number;
  onStay: () => void;
  onLeave: () => void;
}) {
  const t = useT();
  if (!show) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.3)', width: 420, textAlign: 'center' }}>
        <h3 style={{ margin: 0 }}>{t('wait_countdown_title') || '等待即將結束'}</h3>
        <p style={{ marginTop: 8 }}>{t('wait_countdown_message') || '若沒有任何動作，將自動返回首頁。'}</p>
        <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8 }}>{seconds}s</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="card-button" onClick={onStay} style={{ padding: '8px 14px' }}>{t('wait_countdown_stay') || '留下'}</button>
          <button className="card-button secondary" onClick={onLeave} style={{ padding: '8px 14px' }}>{t('wait_countdown_leave') || '離開'}</button>
        </div>
      </div>
    </div>
  );
}

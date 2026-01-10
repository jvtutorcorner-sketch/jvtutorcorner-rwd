"use client";

import React, { useEffect, useState } from 'react';
import { useT } from './IntlProvider';
import { getStoredUser, clearStoredUser } from '@/lib/mockAuth';
import { useRouter } from 'next/navigation';

const SESSION_EXPIRY_KEY = 'tutor_session_expiry';
const WARNING_MS = 60 * 1000; // 1 minute

export default function SessionTimer() {
  const t = useT();
  const router = useRouter();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    let mounted = true;
    function readExpiry() {
      try {
        const raw = window.localStorage.getItem(SESSION_EXPIRY_KEY);
        if (!raw) return null;
        const ts = Number(raw);
        if (!ts || Number.isNaN(ts)) return null;
        return ts;
      } catch {
        return null;
      }
    }

    function tick() {
      const expiry = readExpiry();
      if (!expiry) {
        if (mounted) setRemaining(null);
        return;
      }
      const r = expiry - Date.now();
      if (mounted) setRemaining(r);
      if (r <= 0) {
        // session expired — force logout
        clearStoredUser();
        window.localStorage.removeItem(SESSION_EXPIRY_KEY);
        window.dispatchEvent(new Event('tutor:auth-changed'));
        alert(t('session_expired') || 'Session expired — logged out');
        router.push('/login');
        return;
      }
      if (r <= WARNING_MS) {
        if (!showWarning && mounted) setShowWarning(true);
      }
    }

    tick();
    const id = window.setInterval(tick, 1000);
    const onAuth = () => tick();
    window.addEventListener('tutor:auth-changed', onAuth);
    return () => {
      mounted = false;
      window.clearInterval(id);
      window.removeEventListener('tutor:auth-changed', onAuth);
    };
  }, [router, t, showWarning]);

  if (!remaining || remaining <= 0) return null;

  const seconds = Math.max(0, Math.ceil(remaining / 1000));

  return (
    <>
      {showWarning && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.3)', width: 360, textAlign: 'center' }}>
            <h3>{t('session_expiry_warning_title') || '會話即將到期'}</h3>
            <p>{t('session_expiry_warning_message') || '您的登入即將到期，請在倒數結束前儲存所有重要內容。'}</p>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{seconds}s</div>
            <div style={{ marginTop: 12 }}>
              <button className="card-button" onClick={() => {
                // Dismiss warning (do not extend session)
                setShowWarning(false);
              }}>{t('dismiss') || '關閉'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

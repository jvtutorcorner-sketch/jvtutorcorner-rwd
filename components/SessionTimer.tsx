"use client";

import React, { useEffect, useState } from 'react';
import { useT } from './IntlProvider';
import { getStoredUser, clearStoredUser } from '@/lib/mockAuth';
import { useRouter, usePathname } from 'next/navigation';
import WaitCountdownModal from './WaitCountdownModal';

const SESSION_EXPIRY_KEY = 'tutor_session_expiry';
const WARNING_MS = 60 * 1000; // 1 minute

export default function SessionTimer() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [modalSeconds, setModalSeconds] = useState<number>(0);

  useEffect(() => {
    // Skip session timer for /classroom/test page
    if (pathname === '/classroom/test') {
      return;
    }

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
      const user = getStoredUser();

      if (!expiry || !user) {
        if (mounted) {
          setRemaining(null);
          setShowWarning(false);
        }
        return;
      }

      const r = expiry - Date.now();
      if (mounted) setRemaining(r);

      if (r <= 0) {
        // session expired — force logout
        clearStoredUser();
        window.localStorage.removeItem(SESSION_EXPIRY_KEY);
        if (mounted) setShowWarning(false);
        window.dispatchEvent(new Event('tutor:auth-changed'));
        alert(t('session_expired') || 'Session expired — logged out');
        router.push('/login');
        return;
      }

      if (r <= WARNING_MS) {
        if (!showWarning && mounted) {
          setShowWarning(true);
          if (mounted) setModalSeconds(Math.max(0, Math.ceil(r / 1000)));
        }
      } else {
        // Hide warning if session was extended or just started
        if (showWarning && mounted) {
          setShowWarning(false);
        }
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
  }, [router, t, showWarning, pathname]);

  // Skip rendering for /classroom/test page
  if (pathname === '/classroom/test') {
    return null;
  }

  if (!remaining || remaining <= 0) return null;

  const seconds = Math.max(0, Math.ceil(remaining / 1000));

  const handleStay = () => {
    // Extend session by 30 minutes
    try {
      const newExpiry = Date.now() + 30 * 60 * 1000;
      window.localStorage.setItem(SESSION_EXPIRY_KEY, String(newExpiry));
      window.dispatchEvent(new Event('tutor:auth-changed'));
    } catch (e) {}
    setShowWarning(false);
  };

  const handleLeave = () => {
    // force logout
    clearStoredUser();
    try { window.localStorage.removeItem(SESSION_EXPIRY_KEY); } catch (e) {}
    window.dispatchEvent(new Event('tutor:auth-changed'));
    router.push('/login');
  };

  return (
    <>
      <WaitCountdownModal
        show={showWarning}
        seconds={modalSeconds || seconds}
        onStay={handleStay}
        onLeave={handleLeave}
        title={t('session_expiry_warning_title')}
        message={t('session_expiry_warning_message')}
        stayLabel={t('wait_countdown_stay') || t('dismiss')}
        leaveLabel={t('wait_countdown_leave') || t('logout')}
      />
      <div style={{ position: 'fixed', right: 12, bottom: 12, background: 'rgba(17,24,39,0.9)', color: 'white', padding: '6px 10px', borderRadius: 8, fontWeight: 600, zIndex: 9998 }}>
        {t('session_expiry_bottom') ? `${t('session_expiry_bottom')} ${seconds}s` : `${t('session_expiry_warning_title') || 'Session'} ${seconds}s`}
      </div>
    </>
  );
}

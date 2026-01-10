"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, clearStoredUser, getSessionStart, setSessionStart } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';

const SESSION_LENGTH_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_LENGTH_MS = 60 * 1000; // 1 minute

export default function SessionTimeout() {
  const t = useT();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  useEffect(() => {
    function startFlow() {
      const user = getStoredUser();
      if (!user) {
        clearTimers();
        return;
      }
      let start = getSessionStart();
      if (!start) {
        start = Date.now();
        setSessionStart(start);
      }
      const end = start + SESSION_LENGTH_MS;
      const now = Date.now();
      const msUntilWarning = end - now - WARNING_LENGTH_MS;

      if (msUntilWarning <= 0) {
        // already within warning window
        showWarning(Math.max(0, Math.ceil((end - now) / 1000)));
      } else {
        // schedule warning
        clearTimers();
        timerRef.current = window.setTimeout(() => {
          const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
          showWarning(left);
        }, msUntilWarning);
      }
    }

    function showWarning(initialSec: number) {
      setVisible(true);
      setSecondsLeft(initialSec);
      // start countdown every second
      countdownRef.current = window.setInterval(() => {
        setSecondsLeft((s) => {
          if (!s) return 0;
          if (s <= 1) {
            // time's up
            clearTimers();
            doLogout();
            return 0;
          }
          return s - 1;
        });
      }, 1000) as unknown as number;
    }

    function clearTimers() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      setVisible(false);
      setSecondsLeft(null);
    }

    function doLogout() {
      clearStoredUser();
      window.dispatchEvent(new Event('tutor:auth-changed'));
      // redirect to login
      try {
        router.push('/login');
      } catch {
        window.location.href = '/login';
      }
    }

    // start on mount and when auth changes
    startFlow();
    const onAuth = () => startFlow();
    window.addEventListener('tutor:auth-changed', onAuth);
    return () => {
      window.removeEventListener('tutor:auth-changed', onAuth);
      clearTimers();
    };
  }, [router, t]);

  if (!visible) return null;

  return (
    <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: 'white', border: '1px solid #ddd', padding: 20, borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', width: 360, textAlign: 'center' }}>
        <h3>{t('session_expiring_title') || '登入即將登出'}</h3>
        <p>{t('session_expiring_message') || '您的登入即將過期，請在倒數結束前儘速完成操作。'}</p>
        <p style={{ fontSize: 28, margin: '8px 0' }}>{secondsLeft ?? 0}s</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="card-button secondary" onClick={() => {
            // extend session by 5 minutes
            const now = Date.now();
            setSessionStart(now);
            // restart flow by dispatching auth-changed
            window.dispatchEvent(new Event('tutor:auth-changed'));
          }}>{t('session_extend') || '延長 5 分鐘'}</button>
          <button className="card-button" onClick={() => {
            clearStoredUser();
            window.dispatchEvent(new Event('tutor:auth-changed'));
            try { router.push('/login'); } catch { window.location.href = '/login'; }
          }}>{t('logout') || '登出'}</button>
        </div>
      </div>
    </div>
  );
}

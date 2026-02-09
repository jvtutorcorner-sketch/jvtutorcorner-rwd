"use client";

import React, { useEffect, useRef, useState } from 'react';
import WaitCountdownModal from './WaitCountdownModal';
import { useT } from '@/components/IntlProvider';

interface WaitCountdownManagerProps {
  sessionReadyKey?: string | null;
}

export default function WaitCountdownManager({ sessionReadyKey }: WaitCountdownManagerProps) {
  const t = useT();
  const [seconds, setSeconds] = useState<number>(600);
  const [show, setShow] = useState(false);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionReadyKey) {
      console.log('[WaitCountdownManager] No sessionReadyKey, using default 10 minutes');
      setSeconds(600);
      setShow(false);
      return;
    }

    // Load actual session end time from API
    const loadSessionTime = async () => {
      try {
        console.log('[WaitCountdownManager] Loading session end time for:', sessionReadyKey);
        const response = await fetch(`/api/classroom/session?uuid=${encodeURIComponent(sessionReadyKey)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.endTs) {
            const now = Date.now();
            const remainingMs = data.endTs - now;
            const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
            
            console.log('[WaitCountdownManager] Session end time loaded:', {
              endTs: new Date(data.endTs).toISOString(),
              remainingSeconds,
              remainingMinutes: Math.floor(remainingSeconds / 60)
            });
            
            setSeconds(remainingSeconds);
            setShow(false);
          } else {
            console.log('[WaitCountdownManager] No end time set, using default 10 minutes');
            setSeconds(600);
            setShow(false);
          }
        } else {
          console.warn('[WaitCountdownManager] Failed to load session time, using default 10 minutes');
          setSeconds(600);
          setShow(false);
        }
      } catch (error) {
        console.error('[WaitCountdownManager] Error loading session time:', error);
        setSeconds(600);
        setShow(false);
      }
    };

    loadSessionTime();
    
    // Clear any existing interval
    if (ref.current) {
      clearInterval(ref.current);
      ref.current = null;
    }
    
    // Start countdown
    ref.current = window.setInterval(() => {
      setSeconds((s) => {
        const next = s - 1;
        if (next <= 60) setShow(true);
        if (next <= 0) {
          try { window.location.href = '/'; } catch (e) {}
          return 0;
        }
        return next;
      });
    }, 1000);
    
    return () => {
      if (ref.current) { clearInterval(ref.current); ref.current = null; }
    };
  }, [sessionReadyKey]);

  const handleStay = () => {
    setSeconds(90);
    setShow(false);
  };

  const handleLeave = () => {
    try { window.location.href = '/'; } catch (e) {}
  };

  return (
    <>
      <WaitCountdownModal show={show} seconds={seconds} onStay={handleStay} onLeave={handleLeave} />
      {/* Bottom countdown bar in normal document flow (not fixed) */}
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: 18, zIndex: 1 }}>
        <div style={{ margin: 12, background: '#111827', color: 'white', padding: '8px 12px', borderRadius: 8, fontWeight: 600 }}>
          {t('wait_countdown_bottom') ? `${t('wait_countdown_bottom')} ${seconds}s` : `${seconds}s`}
        </div>
      </div>
    </>
  );
}

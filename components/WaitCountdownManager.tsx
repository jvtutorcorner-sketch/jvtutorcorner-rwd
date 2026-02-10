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
            let remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
            
            // Grace period logic: if session is expired or expiring soon,
            // don't force immediate redirect. Instead, give a grace period (e.g. 10 mins)
            // so the user isn't kicked out immediately upon entry.
            if (remainingSeconds <= 0) {
               console.log(`[WaitCountdownManager] ${new Date().toISOString()} - Session expired for ${sessionReadyKey}, applying 10-minute grace period.`);
               remainingSeconds = 600;
            }

            console.log(`[WaitCountdownManager] ${new Date().toISOString()} - Session end time loaded for ${sessionReadyKey}:`, {
                  endTs: new Date(data.endTs).toISOString(),
                  remainingSeconds,
                  remainingMinutes: Math.floor(remainingSeconds / 60)
                });
            
            setSeconds(remainingSeconds);
            setShow(false);
          } else {
            console.log(`[WaitCountdownManager] ${new Date().toISOString()} - No end time set for ${sessionReadyKey}, using default 10 minutes`);
            setSeconds(600);
            setShow(false);
          }
        } else {
          console.warn(`[WaitCountdownManager] ${new Date().toISOString()} - Failed to load session time for ${sessionReadyKey}, using default 10 minutes`);
          setSeconds(600);
          setShow(false);
        }
      } catch (error) {
        console.error(`[WaitCountdownManager] ${new Date().toISOString()} - Error loading session time for ${sessionReadyKey}:`, error);
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
    console.log(`[WaitCountdownManager] ${new Date().toISOString()} - Starting countdown for ${sessionReadyKey} at ${seconds}s`);
    ref.current = window.setInterval(() => {
      setSeconds((s) => {
        const next = s - 1;
        if (next <= 60) setShow(true);
        if (next <= 0) {
          console.warn(`[WaitCountdownManager] ${new Date().toISOString()} - Countdown reached zero for ${sessionReadyKey}, redirecting to home immediately`);
          try { window.location.href = '/'; } catch (e) {}
          return 0;
        }
        return next;
      });
    }, 1000);
    
    return () => {
      if (ref.current) { console.log(`[WaitCountdownManager] ${new Date().toISOString()} - Clearing countdown interval for ${sessionReadyKey}`); clearInterval(ref.current); ref.current = null; }
    };
  }, [sessionReadyKey]);

  const handleStay = () => {
    console.log(`[WaitCountdownManager] ${new Date().toISOString()} - User chose to stay on wait page, resetting countdown for ${sessionReadyKey}`);
    setSeconds(90);
    setShow(false);
  };

  const handleLeave = () => {
    console.log(`[WaitCountdownManager] ${new Date().toISOString()} - User chose to leave wait page for ${sessionReadyKey}`);
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

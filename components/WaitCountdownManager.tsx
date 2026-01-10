"use client";

import React, { useEffect, useRef, useState } from 'react';
import WaitCountdownModal from './WaitCountdownModal';
import { useT } from '@/components/IntlProvider';

export default function WaitCountdownManager() {
  const t = useT();
  const [seconds, setSeconds] = useState<number>(600);
  const [show, setShow] = useState(false);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    // start countdown (10 minutes = 600 seconds)
    setSeconds(600);
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
  }, []);

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

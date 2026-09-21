'use client';

// Dev-only manual demo of the canvas whiteboard (EnhancedWhiteboard). It renders
// the board directly from ?channel=&role= query params, with a sample multi-page
// PDF as the backdrop — no classroom enrollment/session needed. Open the SAME
// channel in two browser contexts (role=teacher and role=student) to watch
// teacher→student pen sync + page turns over the DynamoDB-state polling transport
// (see components/EnhancedWhiteboard.tsx). Not linked from any nav; not for prod.

import { Suspense, useEffect, useState } from 'react';
import EnhancedWhiteboard from '@/components/EnhancedWhiteboard';

function DemoBoard() {
  const [channel, setChannel] = useState('demo');
  const [role, setRole] = useState<'teacher' | 'student'>('teacher');
  const [both, setBoth] = useState(false); // ?both=1 → student is also editable
  const [pdf, setPdf] = useState<File | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setChannel(sp.get('channel') || 'demo');
      setRole(sp.get('role') === 'student' ? 'student' : 'teacher');
      setBoth(sp.get('both') === '1');
    } catch {
      /* keep defaults */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/test-pdfs/test-multi-page.pdf')
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`pdf ${r.status}`))))
      .then((b) => {
        if (!cancelled) setPdf(new File([b], 'sample.pdf', { type: 'application/pdf' }));
      })
      .catch(() => {
        /* PDF is optional for the demo; pen sync still works without it */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <div
        style={{
          padding: '6px 12px',
          fontFamily: 'monospace',
          fontSize: 13,
          borderBottom: '1px solid #eee',
          background: role === 'teacher' ? '#eef6ff' : '#f6f6f6',
        }}
      >
        canvas whiteboard demo · channel=<b>{channel}</b> · role=<b>{role}</b>{' '}
        {role === 'teacher' ? '(可畫)' : '(唯讀，鏡像老師)'}
      </div>
      <div className="whiteboard-container" style={{ flex: 1, position: 'relative' }}>
        <EnhancedWhiteboard
          channelName={channel}
          room={undefined}
          editable={role === 'teacher' || both}
          rtcRole={role === 'student' ? 'student' : 'teacher'}
          rtcSelfId={`${role}-${channel}`}
          autoFit
          pdfFile={pdf}
        />
      </div>
    </div>
  );
}

export default function WhiteboardDemoPage() {
  return (
    <Suspense fallback={null}>
      <DemoBoard />
    </Suspense>
  );
}

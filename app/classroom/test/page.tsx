'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const ClientClassroom = dynamic(() => import('../ClientClassroom'), { ssr: false });

export default function TestPage() {
  return (
    <div style={{ padding: 16 }}>
      <h1>Classroom Test Page</h1>
      <p>Use this page to test microphone and camera detection, preview, and mic meter.</p>
      <div style={{ marginBottom: 12 }}>
        <button style={{ marginRight: 8 }} onClick={() => window.open('/classroom/test?role=teacher&channel=testroom', '_blank')}>Open Teacher Window</button>
        <button style={{ marginRight: 8 }} onClick={() => window.open('/classroom/test?role=student&channel=testroom', '_blank')}>Open Student Window</button>
        <span style={{ marginLeft: 8, color: '#666' }}>Click both to simulate a 1-on-1 session in separate windows.</span>
      </div>
      <ClientClassroom channelName={typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('channel') || 'testroom' : 'testroom'} />
    </div>
  );
}

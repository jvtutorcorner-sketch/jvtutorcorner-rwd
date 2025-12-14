'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const ClientClassroom = dynamic(() => import('../ClientClassroom'), { ssr: false });

export default function TestPage() {
  return (
    <div style={{ padding: 16 }}>
      <h1>Classroom Test Page</h1>
      <p>Use this page to test microphone and camera detection, preview, and mic meter.</p>
      <ClientClassroom channelName="testroom" />
    </div>
  );
}

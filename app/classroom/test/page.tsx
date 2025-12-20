'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const ClientClassroom = dynamic(() => import('../ClientClassroom'), { ssr: false });

export default function TestPage() {
  return (
    <div style={{ padding: '8px 16px' }}>
      <ClientClassroom channelName={typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('channel') || 'testroom' : 'testroom'} />
    </div>
  );
}

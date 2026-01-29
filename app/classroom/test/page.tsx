'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const ClientClassroom = dynamic(() => import('../ClientClassroom'), { ssr: false });

export default function TestPage() {
  const channel = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('channel') || 'testroom' : 'testroom';

  return (
    <div style={{ padding: 0, margin: 0, width: '100%', minHeight: '100vh', position: 'relative', isolation: 'isolate' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: 12 }}>
        <LanguageSwitcher />
      </div>
      <ClientClassroom channelName={channel} />
    </div>
  );
}

'use client';

import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const ClientClassroom = dynamic(() => import('../ClientClassroom'), { ssr: false });

export default function TestPage() {
  useEffect(() => {
    // Ensure we have courseId and session params from URL
    // This is called from /classroom/wait with these params already set
    // If not present (direct access), set defaults
    if (typeof window === 'undefined') return;
    
    const params = new URLSearchParams(window.location.search);
    
    // If courseId is missing, add it
    if (!params.has('courseId')) {
      params.set('courseId', 'c1');
    }
    
    // If session is missing, generate one from courseId
    if (!params.has('session')) {
      const courseId = params.get('courseId') || 'c1';
      params.set('session', `classroom_session_ready_${courseId}`);
    }
    
    // Only update URL if we added params
    if (!window.location.search.includes('session')) {
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      try {
        window.history.replaceState({}, '', newUrl);
      } catch (e) {
        // Silently ignore history API errors
      }
    }
  }, []);

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

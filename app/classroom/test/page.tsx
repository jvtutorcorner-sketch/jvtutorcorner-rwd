'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useRouter } from 'next/navigation';
import { getStoredUser, StoredUser } from '@/lib/mockAuth';

const ClientClassroom = dynamic(() => import('../ClientClassroom'), { ssr: false });

export default function TestPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [storedUser, setStoredUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;
    const su = getStoredUser();
    setStoredUser(su);

    // compute session validity and defer redirect slightly to allow auth events to propagate
    const checkSession = () => {
      let sessionValid = false;
      try {
        const expiry = window.localStorage.getItem('tutor_session_expiry');
        if (!expiry) sessionValid = !!getStoredUser();
        else sessionValid = Number(expiry) > Date.now() && !!getStoredUser();
      } catch (e) { sessionValid = !!getStoredUser(); }
      console.log('[AuthCheck][test] storedUser:', getStoredUser(), 'expiry:', window.localStorage.getItem('tutor_session_expiry'), 'sessionValid:', sessionValid);
      if (!sessionValid) {
        try {
          const redirect = encodeURIComponent(window.location.pathname + window.location.search);
          router.replace(`/login?redirect=${redirect}`);
          return true;
        } catch (e) {
          console.warn('Failed to redirect to login:', e);
        }
      }
      return false;
    };

    const recheckTimer = window.setTimeout(() => { if (checkSession()) return; }, 300);
    const onAuthChanged = () => { try { window.clearTimeout(recheckTimer); } catch (e) {} ; checkSession(); };
    const onStorageChanged = (e: StorageEvent) => {
      // If storage changed (cross-tab sync), re-evaluate auth
      if (e.key === 'tutor_mock_user' || e.key === 'tutor_session_expiry') {
        try { window.clearTimeout(recheckTimer); } catch (e) {}
        checkSession();
      }
    };
    window.addEventListener('tutor:auth-changed', onAuthChanged);
    window.addEventListener('storage', onStorageChanged);

    // Role-based authorization: if role param exists, enforce match unless admin
    try {
      const params = new URLSearchParams(window.location.search);
      const urlRole = params.get('role');
      if (urlRole && su?.role && su.role !== urlRole && su.role !== 'admin') {
        router.replace('/');
        return;
      }
    } catch (e) { /* ignore */ }

    return () => { 
      try { window.removeEventListener('tutor:auth-changed', onAuthChanged); } catch (e) {} 
      try { window.removeEventListener('storage', onStorageChanged); } catch (e) {} 
      try { window.clearTimeout(recheckTimer); } catch (e) {} 
    };

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: 12, gap: 12 }}>
        <LanguageSwitcher />
        {mounted && storedUser ? (
          <div style={{ padding: '6px 10px', borderRadius: 8, background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, color: '#111', fontWeight: 600 }}>{storedUser.displayName || storedUser.email}</div>
            <div style={{ fontSize: 12, color: '#666' }}>({storedUser.role || 'user'})</div>
          </div>
        ) : null}
      </div>
      <ClientClassroom channelName={channel} />
    </div>
  );
}

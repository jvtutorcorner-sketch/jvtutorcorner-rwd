'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useRouter } from 'next/navigation';
import { getStoredUser, StoredUser } from '@/lib/mockAuth';
import { useOneTimeEntry } from '@/lib/hooks/useOneTimeEntry';

const ClientClassroom = dynamic(() => import('../ClientClassroom'), { ssr: false });

export default function TestPage() {
  // 一次性進入控制
  useOneTimeEntry();
  
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
      const su = getStoredUser();
      setStoredUser(su); // Sync state with storage

      // Skip detailed checks if just mounted / fast refresh to avoid flicker
      if (!mounted) return false;

      try {
        const expiry = window.localStorage.getItem('tutor_session_expiry');
        if (!expiry) sessionValid = !!su;
        else sessionValid = Number(expiry) > Date.now() && !!su;
      } catch (e) { sessionValid = !!su; }

      console.log('[AuthCheck][test] storedUser:', su, 'expiry:', window.localStorage.getItem('tutor_session_expiry'), 'sessionValid:', sessionValid);
      
      if (!sessionValid) {
        // Skip redirect if recently logged in (last 15s)
        const lastLoginTime = window.sessionStorage.getItem('tutor_last_login_time') || window.localStorage.getItem('tutor_last_login_time');
        const loginComplete = window.sessionStorage.getItem('tutor_login_complete');
        const timeSinceLogin = lastLoginTime ? Date.now() - Number(lastLoginTime) : Infinity;
        
        if ((timeSinceLogin < 15000 && timeSinceLogin >= 0) || loginComplete === 'true') {
           console.log('[AuthCheck][test] Skipping redirect - recently logged in or login complete flag set');
           return false;
        }

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

    // Use a slightly longer delay (1.5s) to allow storage/auth state to settle after page transition
    const recheckTimer = window.setTimeout(() => { if (checkSession()) return; }, 1500);
    const onAuthChanged = () => { 
      try { window.clearTimeout(recheckTimer); } catch (e) {} ; 
      // Re-check after 500ms when auth changes
      window.setTimeout(checkSession, 500); 
    };
    const onStorageChanged = (e: StorageEvent) => {
      // If storage changed (cross-tab sync), re-evaluate auth
      if (e.key === 'tutor_mock_user' || e.key === 'tutor_session_expiry') {
        try { window.clearTimeout(recheckTimer); } catch (e) {}
        checkSession();
      }
    };
    window.addEventListener('tutor:auth-changed', onAuthChanged);
    window.addEventListener('storage', onStorageChanged);

    // Ensure we have courseId and session params from URL
    // This is called from /classroom/wait with these params already set
    // If not present (direct access), set defaults
    const setupParams = () => {
      if (typeof window === 'undefined') return;
      
      const params = new URLSearchParams(window.location.search);
      let changed = false;
      
      // If courseId is missing, add it
      if (!params.has('courseId')) {
        params.set('courseId', 'c1');
        changed = true;
      }
      
      // If session is missing, generate one from courseId
      if (!params.has('session')) {
        const cId = params.get('courseId') || 'c1';
        params.set('session', `classroom_session_ready_${cId}`);
        changed = true;
      }
      
      // Only update URL if we added params
      if (changed) {
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        try {
          window.history.replaceState({}, '', newUrl);
        } catch (e) {
          // Silently ignore history API errors
        }
      }
    };
    setupParams();

    // Role-based authorization: if role param exists, enforce match unless admin
    try {
      const params = new URLSearchParams(window.location.search);
      const urlRole = params.get('role');
      const currentSu = getStoredUser(); // Use fresh user data
      if (urlRole && currentSu?.role && currentSu.role !== 'admin') {
        const isStudentMatch = urlRole === 'student' && currentSu.role === 'user';
        const isExactMatch = currentSu.role === urlRole;
        if (!isStudentMatch && !isExactMatch) {
          console.warn('[AuthCheck][test] Role mismatch detected:', { urlRole, userRole: currentSu.role });
          router.replace('/');
          return;
        }
      }
    } catch (e) { /* ignore */ }

    return () => { 
      try { window.removeEventListener('tutor:auth-changed', onAuthChanged); } catch (e) {} 
      try { window.removeEventListener('storage', onStorageChanged); } catch (e) {} 
      try { window.clearTimeout(recheckTimer); } catch (e) {} 
    };
  }, [mounted, router]);

  const channel = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('channel') || 'testroom' : 'testroom';

  return (
    <div style={{ padding: 0, margin: 0, width: '100%', minHeight: '100vh', position: 'relative', isolation: 'isolate' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: 12, gap: 12 }}>
        <LanguageSwitcher />
        {mounted && storedUser ? (
          <div style={{ padding: '6px 10px', borderRadius: 8, background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, color: '#111', fontWeight: 600 }}>{`${storedUser.lastName || ''} ${storedUser.firstName || ''}`.trim() || storedUser.displayName || ''}</div>
            <div style={{ fontSize: 12, color: '#666' }}>({storedUser.role || 'user'})</div>
          </div>
        ) : null}
      </div>
      <ClientClassroom channelName={channel} />
    </div>
  );
}

"use client";

import React, { useEffect, useState, useRef } from 'react';
import WaitCountdownModal from '@/components/WaitCountdownModal';
import WaitCountdownManager from '@/components/WaitCountdownManager';
import { useRouter } from 'next/navigation';
import { COURSES } from '@/data/courses';
import { getStoredUser } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';
import { useOneTimeEntry } from '@/lib/hooks/useOneTimeEntry';

export default function ClassroomWaitPage() {
  // 一次性進入控制
  useOneTimeEntry();

  const router = useRouter();

  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);

  const [courseId, setCourseId] = useState('c1');
  const [courseTitle, setCourseTitle] = useState('課程');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [storedUserState, setStoredUserState] = useState<any>(null);
  const [role, setRole] = useState<'teacher' | 'student' | null>(null);

  // Helper: compute consistent userId for presence tracking (email-based, no tabId suffix)
  const localPresenceId = React.useMemo(() => {
    const su = typeof window !== 'undefined' ? storedUserState : null;
    const email = su?.email || (typeof window !== 'undefined' ? (window as any).__MOCK_USER_ID__ : null) || null;
    console.log('[WaitPage] Computed localPresenceId:', email);
    return email;
  }, [storedUserState]);

  const course = COURSES.find((c) => c.id === courseId) || null;

  const [sessionReadyKey, setSessionReadyKey] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Array<{ role: string; userId: string; present?: boolean }>>([]);
  const [ready, setReady] = useState(false);
  const [syncMode, setSyncMode] = useState<'sse' | 'polling' | 'disconnected'>('disconnected');
  const [roomUuid, setRoomUuid] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const sseDisabledRef = useRef(false);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const isUpdatingRef = useRef(false);
  const lastSyncDataRef = useRef<{ participantsJson: string; selfIsReady: boolean } | null>(null);
  const syncDebounceRef = useRef<number | null>(null);
  const [deviceCheckPassed, setDeviceCheckPassed] = useState(false);
  const [audioOk, setAudioOk] = useState(false);
  const [videoOk, setVideoOk] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const t = useT();




  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const courseFromUrl = params.get('courseId') ?? 'c1';
    const orderFromUrl = params.get('orderId') || params.get('orderid');
    setCourseId(courseFromUrl);
    setOrderId(orderFromUrl || null);

    // Fetch course details from API for dynamic title
    fetch(`/api/courses/${encodeURIComponent(courseFromUrl)}`)
      .then(r => r.json())
      .then(j => {
        if (j.ok && j.course?.title) {
          setCourseTitle(j.course.title);
        } else {
          // Fallback to bundled data title if API fails or doesn't have it
          const b = COURSES.find(c => c.id === courseFromUrl);
          if (b?.title) setCourseTitle(b.title);
        }
      })
      .catch(() => {
        // Safe fallback
        const b = COURSES.find(c => c.id === courseFromUrl);
        if (b?.title) setCourseTitle(b.title);
      });

    const sessionFromUrl = params.get('session');
    // If no session key in URL, generate one that includes orderId to prevent course-level collisions
    const key = sessionFromUrl ? sessionFromUrl : `classroom_session_ready_${courseFromUrl}${orderFromUrl ? `_${orderFromUrl}` : ''}`;
    setSessionReadyKey(key);
    if (!sessionFromUrl) {
      params.set('session', key);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      try { window.history.replaceState({}, '', newUrl); } catch (e) { }
    }

    const urlRole = params.get('role');
    const su = getStoredUser();
    setStoredUserState(su || null);

    // compute final role early
    let computedRole: 'teacher' | 'student' = 'student';
    const isAdmin = su?.role === 'admin';
    if (su?.role === 'teacher' || isAdmin) computedRole = 'teacher';
    else if (su?.displayName && course?.teacherName) {
      if (su.displayName.includes(course.teacherName) || course.teacherName.includes(su.displayName)) computedRole = 'teacher';
    }
    const finalRole = (urlRole === 'teacher' || urlRole === 'student') ? (urlRole as 'teacher' | 'student') : computedRole;
    setRole(finalRole);

    // Require login: redirect to login page if no stored user OR session expired
    let isInLoginRedirectFlow = false;
    const checkSessionAndMaybeRedirect = () => {
      let sessionValid = false;
      let storedUser: any = null;
      try {
        const expiry = window.localStorage.getItem('tutor_session_expiry');
        storedUser = getStoredUser();
        if (!expiry) sessionValid = !!storedUser;
        else sessionValid = Number(expiry) > Date.now() && !!storedUser;

        // Update state if we found a user during this check (to fix race condition)
        if (storedUser && !storedUserState) {
          setStoredUserState(storedUser);
          // Re-calculate role if needed
          if (!role) {
            let cRole: 'teacher' | 'student' = 'student';
            if (storedUser.role === 'teacher' || storedUser.role === 'admin') cRole = 'teacher';
            // ... other logic ...
            setRole(cRole);
          }
        }
      } catch (e) {
        storedUser = getStoredUser();
        sessionValid = !!storedUser;
      }

      console.log(`[AuthCheck][wait] ${new Date().toISOString()} - storedUser:`, storedUser, 'expiry:', window.localStorage.getItem('tutor_session_expiry'), 'sessionValid:', sessionValid, 'isInLoginFlow:', isInLoginRedirectFlow, 'sessionKey:', key);

      // Check for role mismatches if session is valid — only apply for logged-in users with explicit roles
      // Removed: the old strict redirect which was kicking teachers/students from valid classroom links
      // Role enforcement is now handled at the classroom page level and by the /classroom/test auto-correct logic.

      if (!sessionValid) {
        // Clear login complete flag if session has expired (storedUser is null)
        if (!storedUser) {
          try {
            window.sessionStorage.removeItem('tutor_login_complete');
            window.sessionStorage.removeItem('tutor_last_login_time');
          } catch { }
        }

        // Skip redirect if just logged in (within last 15 seconds) - allow time for state to settle
        const lastLoginTime = window.sessionStorage.getItem('tutor_last_login_time') || window.localStorage.getItem('tutor_last_login_time');
        const loginComplete = window.sessionStorage.getItem('tutor_login_complete');
        const timeSinceLogin = lastLoginTime ? Date.now() - Number(lastLoginTime) : Infinity;

        if ((timeSinceLogin < 15000 || loginComplete === 'true') && timeSinceLogin < Infinity && storedUser) {
          console.log(`[AuthCheck][wait] ${new Date().toISOString()} - Skipping redirect - recently logged in or in login process (${timeSinceLogin} ms ago) for session ${key}`);
          return;
        }

        try {
          // Don't redirect if we just redirected to login recently
          const lastRedirectTime = window.sessionStorage.getItem('redirect_to_login_time');
          const timeSinceRedirect = lastRedirectTime ? Date.now() - Number(lastRedirectTime) : Infinity;

          if (isInLoginRedirectFlow && timeSinceRedirect < 20000) {
            console.log('[AuthCheck][wait] Still in login redirect flow, waiting...');
            return;
          }

          const redirect = encodeURIComponent(window.location.pathname + window.location.search);
          console.log(`[AuthCheck][wait] ${new Date().toISOString()} - Redirecting to login with redirect:`, redirect, 'sessionKey:', key, 'courseId:', courseFromUrl);
          window.sessionStorage.setItem('redirect_to_login_time', String(Date.now()));
          isInLoginRedirectFlow = true;
          router.replace(`/login?redirect=${redirect}`);
          return;
        } catch (e) {
          console.warn('Failed to redirect to login:', e);
        }
      }
    };

    // Defer check to allow storage events/auth changes to propagate.
    // "Reasonable check time": If recently logged in, wait 2 seconds. 
    // If no recent login (cold entry), wait 5 seconds before forcing login redirect. 
    const lastLoginTimeForDelay = window.sessionStorage.getItem('tutor_last_login_time') || window.localStorage.getItem('tutor_last_login_time');
    const timeSinceLoginForDelay = lastLoginTimeForDelay ? Date.now() - Number(lastLoginTimeForDelay) : Infinity;
    const initialDelay = timeSinceLoginForDelay < 15000 ? 2000 : 5000;
    const recheckTimer = window.setTimeout(checkSessionAndMaybeRedirect, initialDelay);
    const onAuthChanged = () => {
      // If auth changed, cancel pending redirect and re-evaluate after a short delay
      try { window.clearTimeout(recheckTimer); } catch (e) { }
      isInLoginRedirectFlow = false;  // Auth changed, so we're out of the redirect flow
      // Add a small delay to allow authentication state to settle
      window.setTimeout(checkSessionAndMaybeRedirect, 200);
    };
    const onStorageChanged = (e: StorageEvent) => {
      // If storage changed (cross-tab sync), re-evaluate auth
      if (e.key === 'tutor_mock_user' || e.key === 'tutor_session_expiry') {
        try { window.clearTimeout(recheckTimer); } catch (e) { }
        checkSessionAndMaybeRedirect();
      }
    };
    window.addEventListener('tutor:auth-changed', onAuthChanged);
    window.addEventListener('storage', onStorageChanged);

    // cleanup listener on unmount
    return () => {
      try { window.removeEventListener('tutor:auth-changed', onAuthChanged); } catch (e) { }
      try { window.removeEventListener('storage', onStorageChanged); } catch (e) { }
      try { window.clearTimeout(recheckTimer); } catch (e) { }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncStateFromServer = React.useCallback((forceUpdate = false) => {
    if (!sessionReadyKey || !role) return;

    // Debounce: clear previous pending sync
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
    }

    syncDebounceRef.current = window.setTimeout(() => {
      fetch(`/api/classroom/ready?uuid=${encodeURIComponent(sessionReadyKey)}`)
        .then((r) => {
          if (!r.ok) throw new Error(`Server responded with ${r.status}`);
          return r.json();
        })
        .then((j) => {
          const serverParticipants = j.participants || [];
          const userId = localPresenceId || role || 'anonymous';
          const selfIsReady = serverParticipants.some((p: { role: string; userId: string; present?: boolean }) => p.role === role && p.userId === userId && p.present);

          const participantsJson = JSON.stringify(serverParticipants);
          const currentData = { participantsJson, selfIsReady };
          const lastData = lastSyncDataRef.current;

          // Skip if currently updating, to prevent stale server data from overwriting optimistic state
          if (isUpdatingRef.current && !forceUpdate) {
            console.log('[Sync] Skipped update because an optimistic update is in progress.');
            return;
          }

          // Always apply if forceUpdate, otherwise only if data actually changed (robust check)
          if (forceUpdate || !lastData || lastData.participantsJson !== participantsJson || lastData.selfIsReady !== selfIsReady) {
            setParticipants(serverParticipants);
            setReady(selfIsReady);
            lastSyncDataRef.current = currentData;
            console.log(`[Sync] Updated state. Role: ${role}, Ready: ${selfIsReady}, Participants: ${serverParticipants.length}. Force: ${forceUpdate}`);
          }
        })
        .catch((e) => {
          console.warn('[Sync] Failed to sync state from server:', e);
          // Only clear if absolutely necessary; usually better to keep last known state
          if (forceUpdate) {
            setParticipants([]);
            setReady(false);
            lastSyncDataRef.current = null;
          }
        });
    }, 100);
  }, [sessionReadyKey, role, localPresenceId]);

  const toggleReady = () => {
    console.log('toggleReady called, deviceCheckPassed:', deviceCheckPassed, 'isUpdating:', isUpdating);
    if (!deviceCheckPassed || isUpdating) {
      if (!deviceCheckPassed) alert(t('wait.ready_toggle_need_check'));
      return;
    }

    const syncUuid = sessionReadyKey;
    const userId = localPresenceId || role || 'anonymous';

    if (!syncUuid || !role) {
      console.error('toggleReady: missing syncUuid or role');
      return;
    }

    const nextReadyState = !ready;

    // 1. Optimistic UI update - lock button immediately
    setIsUpdating(true);
    isUpdatingRef.current = true;
    setReady(nextReadyState);

    // Optimistic participant array update for responsive UI cards
    const optimisticParticipants = [...participants];
    if (nextReadyState) {
      if (!optimisticParticipants.some(p => p.role === role && p.userId === userId)) {
        optimisticParticipants.push({ role, userId, present: true });
      }
    } else {
      const idx = optimisticParticipants.findIndex(p => p.role === role && p.userId === userId);
      if (idx !== -1) optimisticParticipants.splice(idx, 1);
    }
    setParticipants(optimisticParticipants);

    // Reset cache so the next sync from server always applies
    lastSyncDataRef.current = null;

    console.log(`toggleReady: setting optimistic state to ${nextReadyState} for role ${role} and userId ${userId}`);

    // 2. Send the state change to the server.
    fetch('/api/classroom/ready', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uuid: syncUuid, role, userId, action: nextReadyState ? 'ready' : 'unready', present: nextReadyState }),
    })
      .then(res => {
        if (!res.ok) throw new Error(`Server update failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        // 3. Apply state directly from POST response (source of truth, no extra GET needed)
        const serverParticipants = data.participants || [];
        const selfIsReady = serverParticipants.some(
          (p: { role: string; userId: string; present?: boolean }) =>
            p.role === role && p.userId === userId && p.present
        );
        setParticipants(serverParticipants);
        setReady(selfIsReady);
        lastSyncDataRef.current = { participantsJson: JSON.stringify(serverParticipants), selfIsReady };
        console.log(`toggleReady: success. Applied state from POST directly. Role: ${role}, Ready: ${selfIsReady}`);

        // Notify other tabs
        try {
          const bc = bcRef.current || new BroadcastChannel(syncUuid);
          bc.postMessage({ type: 'ready_changed', uuid: syncUuid, timestamp: Date.now() });
          if (!bcRef.current) setTimeout(() => bc.close(), 200);
        } catch (e) { }
      })
      .catch(err => {
        console.error('toggleReady POST failed:', err);
        // 4. Revert optimistic state on error
        setReady(!nextReadyState);
        lastSyncDataRef.current = null;
        alert(t('wait.sync_update_failed'));
        // Force-sync to recover true server state
        syncStateFromServer(true);
      })
      .finally(() => {
        // 5. Unlock the button
        setIsUpdating(false);
        isUpdatingRef.current = false;
      });
  };

  // --- UNIFIED SYNC LOGIC ---
  // This single effect hook manages all state synchronization.
  useEffect(() => {
    // Requires sessionReadyKey to be set. syncStateFromServer is a stable useCallback.
    if (!sessionReadyKey || !syncStateFromServer) return;

    // 1. Initial State Sync
    // Immediately fetch the latest state from the server when the component mounts.
    console.log('SYNC: Performing initial state sync.');
    syncStateFromServer();

    // 2. Cross-Tab Sync (BroadcastChannel)
    // A reliable way to tell other tabs on the same browser to re-sync.
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(sessionReadyKey);
      bc.onmessage = (ev) => {
        console.log('SYNC: BroadcastChannel message received, re-syncing from server.', ev.data);
        syncStateFromServer();
      };
      bcRef.current = bc;
    } catch (e) {
      console.warn('SYNC: Failed to create BroadcastChannel:', e);
    }

    // 3. Cross-Tab Sync (Storage Event)
    // A fallback for older browsers or environments where BroadcastChannel might fail.
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === sessionReadyKey) {
        console.log('SYNC: Storage event detected, re-syncing from server.');
        syncStateFromServer();
      }
    };
    window.addEventListener('storage', onStorage);

    // 4. Real-time Server Sync (Server-Sent Events)
    // SSE is disabled in production (Amplify/Serverless doesn't support long-lived connections).
    // In development, try SSE but disable it after first failure to avoid console spam.
    const createEventSource = () => {
      // Auto-disable SSE in production environment
      const isProduction = window.location.hostname === 'www.jvtutorcorner.com' ||
        window.location.hostname === 'jvtutorcorner.com';

      if (sseDisabledRef.current || isProduction) {
        if (isProduction) {
          console.log('SYNC: Production environment detected, using polling mode only.');
        } else {
          console.log('SYNC: SSE is disabled, relying on polling only.');
        }
        setSyncMode('polling');
        return;
      }

      // In development, try SSE once but disable immediately on error
      try {
        console.log('SYNC: Creating EventSource ->', `/api/classroom/stream?uuid=${encodeURIComponent(sessionReadyKey)}`);
        const es = new EventSource(`/api/classroom/stream?uuid=${encodeURIComponent(sessionReadyKey)}`);
        esRef.current = es;

        es.onopen = () => {
          console.log('SYNC: SSE connection opened successfully.');
          setSyncMode('sse');
          retryCountRef.current = 0;
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
        };

        es.onmessage = (ev) => {
          // Reduce log spam - only log every 5th SSE message
          const messageCount = (window as any).__sseMessageCount = ((window as any).__sseMessageCount || 0) + 1;
          if (messageCount % 5 === 0) {
            console.log(`SYNC: SSE message received (count: ${messageCount}), re-syncing from server.`);
          }
          // The syncStateFromServer function includes debouncing (300ms),
          // so even though SSE can fire rapidly, the actual state update is throttled
          // This prevents unnecessary rerenders from frequent SSE messages
          syncStateFromServer();
        };

        es.onerror = (err) => {
          console.warn('SYNC: SSE error, disabling and switching to polling mode.');
          setSyncMode('polling');
          try { es.close(); } catch (e) { }
          esRef.current = null;

          // Immediately disable SSE after first error (no retries in dev either)
          sseDisabledRef.current = true;
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
        };
      } catch (e) {
        console.warn('SYNC: Failed to create EventSource, falling back to polling.', e);
        sseDisabledRef.current = true;
        setSyncMode('polling');
      }
    };

    createEventSource();

    // If the user navigates back to this tab or the window gains focus, attempt immediate reconnect
    const ensureConnected = () => {
      try {
        if (!sessionReadyKey || sseDisabledRef.current) return;
        if (!esRef.current) {
          console.log('SYNC: ensureConnected triggered, attempting to recreate EventSource');
          // reset retry counter so we try promptly
          retryCountRef.current = 0;
          if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
          createEventSource();
        }
      } catch (e) {
        console.warn('SYNC: ensureConnected error', e);
      }
    };

    window.addEventListener('focus', ensureConnected);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') ensureConnected();
    });

    // 5. Polling Fallback
    // Primary sync method in production. Poll every 5 seconds to keep state updated.
    // Note: debounce inside syncStateFromServer() will further reduce actual sync frequency
    const pollingTimer = setInterval(() => {
      if (esRef.current === null || esRef.current.readyState !== EventSource.OPEN) {
        console.log('SYNC: Polling triggered (SSE not active)');
        syncStateFromServer();
      }
    }, 5000);

    // Cleanup all listeners on unmount
    return () => {
      console.log('SYNC: Cleaning up all synchronization listeners.');
      window.removeEventListener('storage', onStorage);
      clearInterval(pollingTimer);
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
        syncDebounceRef.current = null;
      }
      if (bcRef.current) {
        bcRef.current.close();
        bcRef.current = null;
      }
      if (esRef.current) {
        try { esRef.current.close(); } catch (e) { }
        esRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [sessionReadyKey, syncStateFromServer]);

  // Initialization of session end time has been removed from WaitPage.
  // The actual timer (based on order's remainingSeconds) is now strictly managed
  // by ClientClassroom.tsx when both the teacher and student have fully entered the class.

  const hasTeacher = participants.some((p: { role: string; userId: string; present?: boolean }) => p.role === 'teacher' && p.present);
  const hasStudent = participants.some((p: { role: string; userId: string; present?: boolean }) => p.role === 'student' && p.present);
  const canEnter = hasTeacher && hasStudent;

  const enterClassroom = React.useCallback(() => {
    console.log('enterClassroom triggered');

    // NOTE: do NOT clear the server/local "ready" state here.
    // Clearing on the server before navigation causes the classroom
    // page to see an empty participants list and display "waiting".
    // We'll navigate first and let the classroom page / server decide
    // when to clear the session-ready list after users have joined.

    const target = `/classroom/test?courseId=${encodeURIComponent(courseId)}${orderId ? `&orderId=${encodeURIComponent(orderId)}` : ''}${role ? `&role=${encodeURIComponent(role)}` : ''}${sessionReadyKey ? `&session=${encodeURIComponent(sessionReadyKey)}` : ''}`;
    console.log('Redirecting to:', target);
    router.push(target);
  }, [courseId, orderId, role, sessionReadyKey, router]);

  // Auto-enter classroom is disabled. Users must click the button.
  useEffect(() => {
    // const bothReady = hasTeacher && hasStudent;
    // console.log('Auto-enter check:', { hasTeacher, hasStudent, bothReady });
    // if (bothReady) {
    //   console.log('Both teacher and student ready, auto-entering classroom in 1 second...');
    //   const timer = setTimeout(() => {
    //     console.log('Executing auto-enter...');
    //     enterClassroom();
    //   }, 1000);
    //   return () => {
    //     console.log('Auto-enter timer cleared');
    //     clearTimeout(timer);
    //   };
    // }
  }, [hasTeacher, hasStudent, enterClassroom]);

  const handleDeviceStatusChange = React.useCallback((audio: boolean, video: boolean) => {
    setAudioOk(audio);
    setVideoOk(video);
    // Allow E2E bypass to make it easier for headless/CI tests to proceed
    const e2eBypass = typeof window !== 'undefined' && (window as any).__E2E_BYPASS_DEVICE_CHECK__;
    setDeviceCheckPassed(audio && video || !!e2eBypass);
  }, []);

  const handlePdfUpload = React.useCallback(async (file: File) => {
    if (role !== 'teacher') {
      alert('只有老師可以上傳PDF');
      return;
    }

    setUploadingPdf(true);
    try {
      // Read file as ArrayBuffer
      const reader = new FileReader();
      const arrayBufferPromise = new Promise<ArrayBuffer>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as ArrayBuffer;
          resolve(result);
        };
        reader.onerror = reject;
      });
      reader.readAsArrayBuffer(file);
      const arrayBuffer = await arrayBufferPromise;
      const buffer = Buffer.from(arrayBuffer);

      console.log('PDF Upload - Preparing to upload:', {
        fileName: file.name,
        fileSize: file.size,
        bufferSize: buffer.length,
        uuid: sessionReadyKey
      });

      // Upload strategy can be switched via environment variable.
      // When NEXT_PUBLIC_WHITEBOARD_PDF_UPLOAD=presign the client will request
      // a presigned PUT URL from the server and upload the file directly.
      // Otherwise it falls back to the base64-POST behavior.
      const uploadMode = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_WHITEBOARD_PDF_UPLOAD) || '';

      let result: any = null;
      let usePresign = uploadMode === 'presign';

      if (usePresign) {
        try {
          console.log('PDF Upload - Attempting presigned upload flow');
          // Request presigned URL from server
          const presignResp = await fetch('/api/whiteboard/presign', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ uuid: sessionReadyKey, fileName: file.name, contentType: file.type, orderId })
          });

          if (!presignResp.ok) {
            const errorText = await presignResp.text().catch(() => 'Unknown presign error');
            console.warn('PDF Upload - Presign API not available, falling back to base64 upload:', { status: presignResp.status, statusText: presignResp.statusText, errorText });
            usePresign = false; // Fall back to base64
          } else {
            const presignJson = await presignResp.json();
            const { url, key } = presignJson;
            if (!url) {
              console.warn('PDF Upload - Presign response missing url, falling back to base64 upload');
              usePresign = false; // Fall back to base64
            } else {
              // PUT file bytes directly to storage
              const putResp = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': file.type },
                body: arrayBuffer
              });
              if (!putResp.ok) {
                const putText = await putResp.text().catch(() => 'Unknown PUT error');
                console.error('PDF Upload - PUT to presigned URL failed:', { status: putResp.status, statusText: putResp.statusText, putText });
                throw new Error('Upload to storage failed');
              }

              // Notify server about the uploaded file (so server can record the key)
              const notifyResp = await fetch('/api/whiteboard/pdf', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  uuid: sessionReadyKey,
                  orderId,
                  pdf: { name: file.name, s3Key: key, size: file.size, type: file.type }
                })
              });
              if (!notifyResp.ok) {
                const errText = await notifyResp.text().catch(() => 'Unknown notify error');
                console.error('PDF Upload - Notification to server failed:', { status: notifyResp.status, statusText: notifyResp.statusText, errText });
                throw new Error('Server notify failed');
              }
              result = await notifyResp.json();
              console.log('PDF Upload - Presign upload success');
            }
          }
        } catch (presignError) {
          console.warn('PDF Upload - Presign upload failed, falling back to base64 upload:', presignError);
          usePresign = false; // Fall back to base64
        }
      }

      if (!usePresign) {
        // Fallback: post base64 PDF payload to the existing API
        console.log('PDF Upload - Using base64 upload flow');
        const response = await fetch('/api/whiteboard/pdf', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            uuid: sessionReadyKey,
            orderId,
            pdf: {
              name: file.name,
              data: buffer.toString('base64'),
              size: file.size,
              type: file.type
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('PDF Upload - Server error:', response.status, errorText);
          throw new Error('PDF upload failed');
        }

        result = await response.json();
        console.log('PDF Upload - Base64 upload success');
      }
      console.log('PDF Upload - Success:', result);

      setSelectedPdf(file);
      alert('PDF 上傳成功！');
    } catch (error) {
      console.error('Failed to upload PDF:', error);
      alert('PDF 上傳失敗，請重試');
    } finally {
      setUploadingPdf(false);
    }
  }, [role, sessionReadyKey]);

  const isRoleTaken = React.useMemo(() => {
    if (!role) return false;

    // Bypass room-full check if in debug mode
    if (typeof window !== 'undefined' && window.location.search.includes('debugMode=1')) {
      return false;
    }

    // Use plain email to identify self (no tabId) — same as what we write to DB
    const currentUserId = localPresenceId;
    if (!currentUserId) return false; // Anonymous users can always enter

    // Block only if another DIFFERENT user with the same role is currently PRESENT
    return participants.some(p =>
      p.role === role &&
      p.present === true &&
      p.userId !== currentUserId &&
      // Also ensure the blocking participant isn't a stale record with same email from a previous session
      !p.userId.startsWith(currentUserId)
    );
  }, [participants, role, localPresenceId]);

  // Auto-refresh participants list every 30s when role is occupied to detect when the other user leaves
  const [roleCheckCountdown, setRoleCheckCountdown] = useState(30);
  useEffect(() => {
    if (!isRoleTaken || !sessionReadyKey) return;
    setRoleCheckCountdown(30);
    const countdown = setInterval(() => {
      setRoleCheckCountdown(prev => {
        if (prev <= 1) {
          // Refresh participants from server
          syncStateFromServer();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdown);
  }, [isRoleTaken, sessionReadyKey, syncStateFromServer]);

  if (!isClient) return null;

  if (isRoleTaken) {
    return (
      <div className="wait-page-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <div style={{ padding: 32, background: '#fff0f0', border: '2px solid #ffcdd2', borderRadius: 12, maxWidth: 500 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h2 style={{ color: '#d32f2f', marginBottom: 16 }}>{t('wait.room_full_title') || '目前無法進入'}</h2>
          <p style={{ fontSize: 16, color: '#333', marginBottom: 8, lineHeight: 1.5 }}>
            {t('wait.room_full_desc') || `此教室已經有一位 ${role === 'teacher' ? '老師' : '學生'} 在裡面了。`}
          </p>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 24 }}>
            正在自動等待對方離開... 將在 <strong>{roleCheckCountdown}</strong> 秒後重新檢查。
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => { syncStateFromServer(); setRoleCheckCountdown(30); }}
              style={{ padding: '10px 20px', background: '#1976d2', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              🔄 立即重新檢查
            </button>
            <button
              onClick={() => router.push(role === 'teacher' ? '/teacher_courses' : '/student_courses')}
              style={{ padding: '10px 20px', background: '#666', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              {t('wait.return_home') || '返回我的課程'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wait-page-container">
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2>{t('wait.title')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {storedUserState && (
            <div style={{ marginLeft: 12, padding: '6px 10px', borderRadius: 8, background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 13, color: '#111', fontWeight: 600 }}>{((storedUserState.lastName || '') + ' ' + (storedUserState.firstName || '')).trim() || storedUserState.displayName || 'No Set Name'}</div>
              <div style={{ fontSize: 12, color: '#666' }}>({storedUserState.role || 'user'})</div>
            </div>
          )}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 18 }}>{courseTitle}</div>

        <div style={{ marginTop: 4, color: '#666' }}>
          {t('wait.role_label')} {role ? (role === 'teacher' ? `${t('role_teacher')} (Teacher)` : `${t('role_student')} (Student)`) : '—'}
        </div>

        <div className="wait-sync-info">
          <SyncBadge mode={syncMode} />
          <div style={{ fontSize: 12, color: '#666' }}>
            <div style={{ fontWeight: 600 }}>{t('wait.session_label')}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#333' }}>{sessionReadyKey}</div>
          </div>
        </div>
      </div>

      {/* 音視頻檢測區域 - 所有用戶都需要檢測 */}
      <div style={{ marginTop: 20, padding: 20, border: '2px solid #e0e0e0', borderRadius: 12, background: '#fafafa' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: deviceCheckPassed ? '#4caf50' : '#ff9800', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
            {deviceCheckPassed ? '✓' : '!'}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{t('wait.check_title')}</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{t('wait.check_subtitle')}</div>
          </div>
        </div>
        <VideoSetup onStatusChange={handleDeviceStatusChange} />
      </div>

      {/* 就緒按鈕 - 只有通過設備檢測才能點擊 */}
      <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={toggleReady}
          disabled={!deviceCheckPassed || isUpdating}
          style={{
            padding: '12px 24px',
            background: !deviceCheckPassed ? '#ccc' : (ready ? '#4caf50' : '#2563eb'),
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: (!deviceCheckPassed || isUpdating) ? 'not-allowed' : 'pointer',
            opacity: (!deviceCheckPassed || isUpdating) ? 0.6 : 1,
            minWidth: '180px',
            transition: 'all 0.2s ease'
          }}>
          {isUpdating ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <span className="spinner" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></span>
              {t('processing') || '處理中...'}
            </span>
          ) : (
            ready ? t('wait.ready_toggle_ready') : (deviceCheckPassed ? t('wait.ready_toggle_not_ready') : t('wait.ready_toggle_need_check'))
          )}
        </button>
        {!deviceCheckPassed && (
          <div style={{ color: '#d32f2f', fontSize: 13 }}>
            ⚠ {t('wait.must_test_devices')}
          </div>
        )}
      </div>

      {/* PDF Upload for Teachers */}
      {role === 'teacher' && (
        <div style={{ marginTop: 20, padding: 20, border: '2px solid #e0e0e0', borderRadius: 12, background: '#fafafa' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: selectedPdf ? '#4caf50' : '#2196f3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: 18 }}>
              📄
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>PDF 課程教材</div>
              <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>上傳 PDF 檔案，將在課堂中顯示</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{
              padding: '10px 20px',
              background: uploadingPdf ? '#ccc' : '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: uploadingPdf ? 'not-allowed' : 'pointer',
              display: 'inline-block'
            }}>
              {uploadingPdf ? '上傳中...' : '選擇 PDF 檔案'}
              <input
                type="file"
                accept="application/pdf"
                disabled={uploadingPdf}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handlePdfUpload(file);
                  }
                }}
                style={{ display: 'none' }}
              />
            </label>
            {selectedPdf && (
              <div style={{ fontSize: 14, color: '#333' }}>
                ✓ 已選擇: {selectedPdf.name}
              </div>
            )}
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: '#666' }}>
            ℹ️ 上傳的 PDF 將在進入課堂後顯示。如果沒有上傳 PDF，進入課堂時將不顯示任何 PDF 相關內容。
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 15 }}>{t('wait.waiting_participants_title')}</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, padding: 16, border: hasTeacher ? '2px solid #4caf50' : '2px solid #e0e0e0', borderRadius: 8, background: hasTeacher ? '#f1f8f4' : 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: hasTeacher ? '#4caf50' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 'bold' }}>
                {hasTeacher ? '✓' : ''}
              </div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{t('role_teacher')}</div>
            </div>
            <div style={{ marginTop: 8, fontSize: 14, color: hasTeacher ? '#2e7d32' : '#666' }}>
              {hasTeacher ? t('wait.teacher_ready') : t('wait.teacher_waiting')}
            </div>
          </div>
          <div style={{ flex: 1, padding: 16, border: hasStudent ? '2px solid #4caf50' : '2px solid #e0e0e0', borderRadius: 8, background: hasStudent ? '#f1f8f4' : 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: hasStudent ? '#4caf50' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 'bold' }}>
                {hasStudent ? '✓' : ''}
              </div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{t('role_student')}</div>
            </div>
            <div style={{ marginTop: 8, fontSize: 14, color: hasStudent ? '#2e7d32' : '#666' }}>
              {hasStudent ? t('wait.student_ready') : t('wait.student_waiting')}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          onClick={enterClassroom}
          disabled={!canEnter}
          style={{
            padding: '14px 28px',
            background: canEnter ? '#1976d2' : '#9ca3af',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: canEnter ? 'pointer' : 'not-allowed'
          }}>
          {canEnter ? `✓ ${t('wait.enter_now')}` : t('wait.waiting_all_ready')}
        </button>
        <div style={{ display: 'inline-flex', gap: 8, marginLeft: 16 }}>
          <button
            onClick={async () => {
              try {
                const url = `${window.location.origin}/classroom/wait?courseId=${encodeURIComponent(courseId)}${orderId ? `&orderId=${encodeURIComponent(orderId)}` : ''}${sessionReadyKey ? `&session=${encodeURIComponent(sessionReadyKey)}` : ''}`;
                await navigator.clipboard.writeText(url);
                alert(t('wait.copy_link_alert'));
              } catch (e) {
                try {
                  const url = `${window.location.origin}/classroom/wait?courseId=${encodeURIComponent(courseId)}${orderId ? `&orderId=${encodeURIComponent(orderId)}` : ''}${sessionReadyKey ? `&session=${encodeURIComponent(sessionReadyKey)}` : ''}`;
                  (window as any).prompt(t('wait.copy_link_prompt'), url);
                } catch { }
              }
            }}
            style={{ padding: '10px 16px', border: '1px solid #ccc', borderRadius: 6, background: 'white', cursor: 'pointer' }}>
            📋 {t('wait.copy_link')}
          </button>
        </div>
        {canEnter && (
          <div style={{ marginTop: 12, padding: 12, background: '#e3f2fd', borderRadius: 6, fontSize: 14, color: '#1565c0' }}>
            ✓ {t('wait.all_ready_message')}
          </div>
        )}
      </div>

      {/* Place countdown manager at the end of the page content so it flows with scroll */}
      <div style={{ marginTop: 24 }}>
        <WaitCountdownManager sessionReadyKey={sessionReadyKey} />
      </div>
    </div>
  );
}

function SyncBadge({ mode }: { mode: 'sse' | 'polling' | 'disconnected' }) {
  const t = useT();
  const label = mode === 'sse' ? t('wait.sse') : (mode === 'polling' ? t('wait.polling') : t('wait.disconnected'));
  const color = mode === 'sse' ? '#2e7d32' : (mode === 'polling' ? '#ff9800' : '#d32f2f');
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 999, background: '#fff', border: `1px solid ${color}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ width: 10, height: 10, borderRadius: 5, background: color }} />
      <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{label}</div>
    </div>
  );
}

function VideoSetup({ onStatusChange }: { onStatusChange?: (audioOk: boolean, videoOk: boolean) => void }) {
  const localVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = React.useRef<MediaStream | null>(null);

  // Stop camera preview on unmount to release devices for the next page
  React.useEffect(() => {
    return () => {
      try {
        if (previewStreamRef.current) {
          console.log('[WaitPage] Unmounting, stopping camera preview tracks');
          previewStreamRef.current.getTracks().forEach(t => t.stop());
          previewStreamRef.current = null;
        }
      } catch (e) {
        console.warn('[WaitPage] Failed to stop preview on unmount', e);
      }
    };
  }, []);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const micSourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);

  const [audioInputs, setAudioInputs] = React.useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = React.useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = React.useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = React.useState<string | null>(null);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = React.useState<string | null>(null);
  const [selectedAudioOutputId, setSelectedAudioOutputId] = React.useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = React.useState(false);
  const [previewingCamera, setPreviewingCamera] = React.useState(false);
  const [testingMic, setTestingMic] = React.useState(false);
  const testingMicRef = React.useRef(false);
  const [micLevel, setMicLevel] = React.useState(0);
  const [audioTested, setAudioTested] = React.useState(false);
  const [speakerTested, setSpeakerTested] = React.useState(false);
  const [videoTested, setVideoTested] = React.useState(false);
  const [isClient, setIsClient] = React.useState(false);
  const [showIosNotice, setShowIosNotice] = React.useState(false);
  const t = useT();

  // Detect client-side environment to avoid hydration errors
  React.useEffect(() => {
    setIsClient(true);
    if (typeof window !== 'undefined') {
      const _isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const isHttp = window.location.protocol === 'http:';
      const noMediaDevices = !navigator.mediaDevices;
      // Show warning if iOS on HTTP OR if mediaDevices is not available
      if ((_isIos && isHttp) || noMediaDevices) setShowIosNotice(true);
    }
  }, []);

  // enumerate devices and restore saved selection
  React.useEffect(() => {
    let mounted = true;
    const updateDevices = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!mounted) return;
        const ais = list.filter((d) => d.kind === 'audioinput');
        const vis = list.filter((d) => d.kind === 'videoinput');
        const aos = list.filter((d) => d.kind === 'audiooutput');
        setAudioInputs(ais);
        setAudioOutputs(aos);
        setVideoInputs(vis);
        const sa = localStorage.getItem('tutor_selected_audio');
        const sv = localStorage.getItem('tutor_selected_video');
        const so = localStorage.getItem('tutor_selected_output');
        if (sa) setSelectedAudioDeviceId(sa);
        else if (!selectedAudioDeviceId && ais.length) setSelectedAudioDeviceId(ais[0].deviceId);
        if (sv) setSelectedVideoDeviceId(sv);
        else if (!selectedVideoDeviceId && vis.length) setSelectedVideoDeviceId(vis[0].deviceId);
        if (so) setSelectedAudioOutputId(so);
        else if (!selectedAudioOutputId && aos.length) setSelectedAudioOutputId(aos[0].deviceId);
        // Do NOT mark devices as "tested" based on enumeration alone.
        // Testing should be explicit (mic test / speaker test) or after permission.
      } catch (e) {
        console.warn('[Device Enum] enumeration failed:', e);
      }
    };
    updateDevices();
    try { navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener('devicechange', updateDevices); } catch (e) { }
    return () => { mounted = false; try { navigator.mediaDevices && navigator.mediaDevices.removeEventListener && navigator.mediaDevices.removeEventListener('devicechange', updateDevices); } catch (e) { } };
  }, []);

  const requestPermissions = async () => {
    try {
      console.log('[Permission] Requesting camera and microphone access...');

      if (!navigator.mediaDevices) {
        console.error('[Permission] navigator.mediaDevices not available');
        return false;
      }

      if (!navigator.mediaDevices.getUserMedia) {
        console.error('[Permission] getUserMedia not available - requires HTTPS on iOS');
        return false;
      }

      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      console.log('[Permission] Permissions granted, stream acquired');
      setPermissionGranted(true);

      // Stop all tracks
      s.getTracks().forEach((t) => {
        console.log('[Permission] Stopping track:', t.kind, t.id);
        t.stop();
      });

      // Add a small delay before enumerating devices (helps with iOS)
      await new Promise(resolve => setTimeout(resolve, 100));

      // After permissions granted, enumerate devices to populate the selectors
      try {
        console.log('[Permission] Enumerating devices...');
        const list = await navigator.mediaDevices.enumerateDevices();
        const ais = list.filter((d) => d.kind === 'audioinput');
        const vis = list.filter((d) => d.kind === 'videoinput');
        console.log('[Permission] Devices enumerated:', { audioInputs: ais.length, videoInputs: vis.length, allDevices: list.length });

        setAudioInputs(ais);
        setVideoInputs(vis);
        // Auto-select first device if not already selected
        if (!selectedAudioDeviceId && ais.length) {
          setSelectedAudioDeviceId(ais[0].deviceId);
          console.log('[Permission] Auto-selected audio device:', ais[0].label);
        }
        if (!selectedVideoDeviceId && vis.length) {
          setSelectedVideoDeviceId(vis[0].deviceId);
          console.log('[Permission] Auto-selected video device:', vis[0].label);
        }
      } catch (enumError) {
        console.warn('[Permission] Failed to enumerate devices after permission grant:', enumError);
        // On iOS, enumeration might fail but permissions are still granted
        // Continue anyway since getUserMedia succeeded
      }
      return true;
    } catch (e: any) {
      console.error('[Permission] Permission error:', e?.name, e?.message);
      setPermissionGranted(false);

      // Provide more specific error messages
      if (e?.name === 'NotAllowedError') {
        alert(t('permission_denied_devices'));
      } else if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
        alert(t('devices_not_found'));
      } else if (e?.name === 'NotSupportedError') {
        alert(t('browser_not_supported'));
      } else {
        alert(t('error_occurred_prefix') + (e?.message || t('unknown_error')));
      }
      return false;
    }
  };

  const startCameraPreview = async () => {
    try {
      const constraints: any = { video: true };
      if (selectedVideoDeviceId && selectedVideoDeviceId !== '') {
        constraints.video = { deviceId: { ideal: selectedVideoDeviceId } };
      }
      let s: MediaStream | null = null;
      try {
        s = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        console.warn('startCameraPreview: getUserMedia with deviceId failed, retrying without deviceId/facingMode', err);
        // Retry without deviceId constraint — iOS often does not support deviceId until after permissions
        try {
          const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
          if (isIos) {
            s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          } else {
            s = await navigator.mediaDevices.getUserMedia({ video: true });
          }
        } catch (err2) {
          console.warn('startCameraPreview: retry without deviceId also failed', err2);
          throw err2;
        }
      }

      previewStreamRef.current = s;
      if (localVideoRef.current) {
        try { localVideoRef.current.srcObject = s; } catch (e) { }
        try { await localVideoRef.current.play(); } catch (e) { console.warn('startCameraPreview: video.play() failed', e); }
      }
      setPreviewingCamera(true);
      setVideoTested(true);
    } catch (e) {
      console.warn('startCameraPreview failed', e);
      alert(t('camera_preview_failed'));
      setPreviewingCamera(false);
      setVideoTested(false);
    }
  };

  const stopCameraPreview = async () => {
    try {
      const s = previewStreamRef.current;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
      }
      previewStreamRef.current = null;
      if (localVideoRef.current) try { localVideoRef.current.srcObject = null; } catch (e) { }
    } catch (e) {
      console.warn('stopCameraPreview failed', e);
    }
    setPreviewingCamera(false);
  };

  const startMicTest = async () => {
    try {
      const constraints: any = { audio: true };
      if (selectedAudioDeviceId && selectedAudioDeviceId !== '') {
        constraints.audio = { deviceId: { ideal: selectedAudioDeviceId } };
      }
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioContextRef.current;
      const src = ctx.createMediaStreamSource(s);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;
      micSourceRef.current = src;
      setTestingMic(true);
      testingMicRef.current = true;
      setAudioTested(true);

      const update = () => {
        try {
          const arr = new Uint8Array(analyserRef.current!.frequencyBinCount);
          analyserRef.current!.getByteFrequencyData(arr);
          let sum = 0;
          for (let i = 0; i < arr.length; i++) sum += arr[i];
          const avg = sum / arr.length;
          setMicLevel(Math.min(100, Math.floor(avg)));
        } catch (e) { }
        if (testingMicRef.current) window.requestAnimationFrame(update);
      };
      update();
    } catch (e) {
      console.warn('startMicTest failed', e);
      setTestingMic(false);
      testingMicRef.current = false;
      setAudioTested(false);
      alert(t('mic_start_failed'));
    }
  };

  const stopMicTest = () => {
    try {
      try { audioContextRef.current?.close(); } catch (e) { }
      audioContextRef.current = null;
      analyserRef.current = null;
      micSourceRef.current = null;
    } catch (e) { }
    setTestingMic(false);
    testingMicRef.current = false;
    setMicLevel(0);
  };

  // persist selection when changed
  React.useEffect(() => {
    try { if (selectedAudioDeviceId) localStorage.setItem('tutor_selected_audio', selectedAudioDeviceId); } catch (e) { }
  }, [selectedAudioDeviceId]);
  React.useEffect(() => {
    try { if (selectedVideoDeviceId) localStorage.setItem('tutor_selected_video', selectedVideoDeviceId); } catch (e) { }
  }, [selectedVideoDeviceId]);
  React.useEffect(() => {
    try { if (selectedAudioOutputId) localStorage.setItem('tutor_selected_output', selectedAudioOutputId); } catch (e) { }
  }, [selectedAudioOutputId]);

  // 通知父組件檢測狀態
  React.useEffect(() => {
    if (onStatusChange) {
      // Require both microphone and speaker to be tested for audio readiness
      const audioReady = audioTested && speakerTested;
      onStatusChange(audioReady, videoTested);
    }
  }, [audioTested, speakerTested, videoTested, onStatusChange]);

  // Speaker test: play a short tone into selected output (or default)
  const testSpeaker = async () => {
    try {
      // Create an AudioContext and oscillator, connect to a MediaStreamDestination
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        alert(t('wait.sound_not_supported'));
        return;
      }
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.15;
      osc.type = 'sine';
      osc.frequency.value = 880;
      const dest = ctx.createMediaStreamDestination();
      osc.connect(gain);
      gain.connect(dest);

      const a = document.createElement('audio');
      a.autoplay = true;
      a.srcObject = dest.stream;

      // If sink selection is supported, try to set it
      try {
        const sink = (selectedAudioOutputId && selectedAudioOutputId !== '') ? selectedAudioOutputId : undefined;
        if (sink && typeof (a as any).setSinkId === 'function') {
          await (a as any).setSinkId(sink);
          console.log('[SpeakerTest] setSinkId applied:', sink);
        }
      } catch (e) {
        console.warn('[SpeakerTest] setSinkId failed', e);
      }

      // Play tone briefly
      osc.start();
      document.body.appendChild(a);
      // stop after 700ms
      setTimeout(async () => {
        try { osc.stop(); } catch (e) { }
        try { ctx.close(); } catch (e) { }
        try { a.pause(); a.srcObject = null; a.remove(); } catch (e) { }
        setSpeakerTested(true);
      }, 700);
    } catch (e) {
      console.warn('testSpeaker failed', e);
      alert(t('wait.sound_test_failed'));
    }
  };

  // No auto-request: permissions will be requested by explicit user gesture
  React.useEffect(() => {
    return () => { };
  }, []);

  return (
    <div className="wait-device-setup">
      {/* HTTPS Notice */}
      {showIosNotice && (
        <div style={{ width: '100%', padding: 16, background: '#ffebee', border: '2px solid #d32f2f', borderRadius: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 24 }}>⚠️</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#d32f2f' }}>{t('wait.https_required_notice')}</div>
            </div>
          </div>
        </div>
      )}

      <div className="wait-preview">
        <div style={{ width: '100%', aspectRatio: '16/9', background: '#1a1a1a', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
          <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {!previewingCamera && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 14 }}>
              {t('wait.camera_not_started')}
            </div>
          )}
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: videoTested ? '#4caf50' : '#666' }} />
          <span>{videoTested ? t('wait.video_tested') : t('wait.video_not_tested')}</span>
        </div>
      </div>
      <div className="wait-controls">
        {/* 麥克風設定 */}
        <div style={{ padding: 14, border: '1px solid #e0e0e0', borderRadius: 8, background: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: audioTested ? '#4caf50' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 'bold' }}>
              {audioTested ? '✓' : ''}
            </div>
            <label style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{t('wait.microphone')}</label>
          </div>
          {isClient && (
            <>
              <select
                value={selectedAudioDeviceId ?? ''}
                onChange={(e) => setSelectedAudioDeviceId(e.target.value || null)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #ccc', marginBottom: 10 }}>
                {audioInputs.length === 0 && <option value="">{t('wait.no_microphone')}</option>}
                {audioInputs.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || t('wait.microphone')}</option>))}
              </select>
              <button
                onClick={() => { testingMic ? stopMicTest() : startMicTest(); }}
                style={{ width: '100%', padding: '10px 14px', background: testingMic ? '#d32f2f' : '#1976d2', color: 'white', border: 'none', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
                {testingMic ? t('wait.mic_stop') : t('wait.mic_test')}
              </button>
            </>
          )}
          {testingMic && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{t('wait.volume_label')}</div>
              <div style={{ width: '100%', height: 12, background: '#eee', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: `${micLevel}%`, height: '100%', background: micLevel > 60 ? '#4caf50' : '#ff9800', transition: 'width 0.1s' }} />
              </div>
            </div>
          )}
        </div>

        {/* 喇叭 (輸出裝置) 檢查 */}
        <div style={{ padding: 14, border: '1px solid #e0e0e0', borderRadius: 8, background: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: speakerTested ? '#4caf50' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 'bold' }}>
              {speakerTested ? '✓' : ''}
            </div>
            <label style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{t('wait.sound')}</label>
          </div>
          {isClient && (
            <>
              <select
                value={selectedAudioOutputId ?? ''}
                onChange={(e) => setSelectedAudioOutputId(e.target.value || null)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #ccc', marginBottom: 10 }}>
                {audioOutputs.length === 0 && <option value="">{t('wait.no_sound')}</option>}
                {audioOutputs.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || t('wait.sound')}</option>))}
              </select>
              <button
                onClick={() => { testSpeaker(); }}
                style={{ width: '100%', padding: '10px 14px', background: '#1976d2', color: 'white', border: 'none', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
                🔊 {t('wait.sound_test')}
              </button>
            </>
          )}
        </div>

        {/* 攝影機設定 */}
        <div style={{ padding: 14, border: '1px solid #e0e0e0', borderRadius: 8, background: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: videoTested ? '#4caf50' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 'bold' }}>
              {videoTested ? '✓' : ''}
            </div>
            <label style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{t('wait.camera')}</label>
          </div>
          {isClient && (
            <>
              <select
                value={selectedVideoDeviceId ?? ''}
                onChange={(e) => setSelectedVideoDeviceId(e.target.value || null)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #ccc', marginBottom: 10 }}>
                {videoInputs.length === 0 && <option value="">{t('wait.no_camera')}</option>}
                {videoInputs.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || t('wait.camera')}</option>))}
              </select>
              <button
                onClick={() => { previewingCamera ? stopCameraPreview() : startCameraPreview(); }}
                style={{ width: '100%', padding: '10px 14px', background: previewingCamera ? '#d32f2f' : '#1976d2', color: 'white', border: 'none', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
                {previewingCamera ? t('wait.camera_stop_preview') : t('wait.camera_preview')}
              </button>
            </>
          )}
        </div>

        {isClient && !permissionGranted && (
          <button
            onClick={async () => {
              try {
                // Check if mediaDevices is available before requesting
                if (!navigator.mediaDevices) {
                  alert(t('wait.https_required_notice'));
                  return;
                }
                const ok = await requestPermissions();
                if (ok) {
                  try { await startCameraPreview(); } catch (e) { console.warn('preview after grant failed', e); }
                } else {
                  alert(t('wait.permissions_failed_notice'));
                }
              } catch (e) { console.warn('manual request failed', e); }
            }}
            style={{ padding: '12px 16px', background: '#ff9800', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
            🔐 {t('wait.grant_permissions')}
          </button>
        )}

        {isClient && permissionGranted && (
          <div style={{ padding: 12, background: '#c8e6c9', borderRadius: 6, fontSize: 13, color: '#2e7d32', fontWeight: 500 }}>
            ✓ {t('wait.permissions_granted')}
          </div>
        )}

        <div style={{ padding: 12, background: '#e3f2fd', borderRadius: 6, fontSize: 13, color: '#1565c0' }}>
          💡 {t('wait.devices_saved_hint')}
        </div>
        {/* Countdown modal removed from here; managed by WaitCountdownManager */}
      </div>
    </div>
  );
}

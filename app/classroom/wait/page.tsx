"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { COURSES } from '@/data/courses';
import { getStoredUser } from '@/lib/mockAuth';
import VideoControls from '@/components/VideoControls';
import { VideoQuality } from '@/lib/agora/useAgoraClassroom';

export default function ClassroomWaitPage() {
  const router = useRouter();

  const [courseId, setCourseId] = useState('c1');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [storedUserState, setStoredUserState] = useState<any>(null);
  const [role, setRole] = useState<'teacher' | 'student' | null>(null);

  const course = COURSES.find((c) => c.id === courseId) || null;

  const [sessionReadyKey, setSessionReadyKey] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Array<{ role: string; userId: string }>>([]);
  const [ready, setReady] = useState(false);
  const [syncMode, setSyncMode] = useState<'sse' | 'polling' | 'disconnected'>('disconnected');
  const [roomUuid, setRoomUuid] = useState<string | null>(null);
  const [currentQuality, setCurrentQuality] = useState<VideoQuality>('high');
  const [isLowLatencyMode, setIsLowLatencyMode] = useState(false);
  const pollRef = useRef<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const [deviceCheckPassed, setDeviceCheckPassed] = useState(false);
  const [audioOk, setAudioOk] = useState(false);
  const [videoOk, setVideoOk] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const courseFromUrl = params.get('courseId') ?? 'c1';
    const orderFromUrl = params.get('orderId');
    setCourseId(courseFromUrl);
    setOrderId(orderFromUrl ?? null);
    const sessionFromUrl = params.get('session');
    const key = sessionFromUrl ? sessionFromUrl : `classroom_session_ready_${courseFromUrl}`;
    setSessionReadyKey(key);
    if (!sessionFromUrl) {
      params.set('session', key);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      try { window.history.replaceState({}, '', newUrl); } catch (e) {}
    }
    const urlRole = params.get('role');
    const su = getStoredUser();
    setStoredUserState(su || null);

    let computedRole: 'teacher' | 'student' = 'student';
    const isAdmin = su?.role === 'admin';
    if (su?.role === 'teacher' || isAdmin) computedRole = 'teacher';
    else if (su?.displayName && course?.teacherName) {
      if (su.displayName.includes(course.teacherName) || course.teacherName.includes(su.displayName)) computedRole = 'teacher';
    }

    const finalRole = (urlRole === 'teacher' || urlRole === 'student') ? (urlRole as 'teacher' | 'student') : computedRole;
    setRole(finalRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readReady = React.useCallback(() => {
    if (!sessionReadyKey) return;
    try {
      const raw = localStorage.getItem(sessionReadyKey);
      console.log('readReady called:', { sessionReadyKey, raw, role, email: storedUserState?.email, time: new Date().toISOString() });
      const arr = raw ? JSON.parse(raw) as Array<{ role: string; userId: string }> : [];
      setParticipants(arr);
      const email = storedUserState?.email;
      const userId = email || role || 'anonymous';
      const selfMarked = role ? arr.some((p) => p.role === role && p.userId === userId) : false;
      console.log('readReady parsed:', { arr, userId, selfMarked });
      setReady(selfMarked);
    } catch (e) {
      console.error('readReady error:', e);
      setParticipants([]);
      setReady(false);
    }
  }, [sessionReadyKey, role, storedUserState]);

  // Create persistent BroadcastChannel - separate from other effects to avoid recreation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!sessionReadyKey) return; // require valid session key
    
    try {
      const channel = new BroadcastChannel(sessionReadyKey as string);
      bcRef.current = channel;
      
      channel.onmessage = (ev) => {
        console.log('BroadcastChannel message received:', ev.data, 'key:', sessionReadyKey, new Date().toISOString());
        if (ev.data.type === 'ready-cleared') {
          // Ready state was cleared, reset local state
          setParticipants([]);
          setReady(false);
          return;
        }
        // Force immediate re-read from localStorage
        setTimeout(() => {
          if (!sessionReadyKey) return;
          const raw = localStorage.getItem(sessionReadyKey as string);
          console.log('After BC message, localStorage value:', raw);
          // Re-read and parse the ready state using the same logic as readReady
          try {
            const arr = raw ? JSON.parse(raw) as Array<{ role: string; userId: string }> : [];
            setParticipants(arr);
            // Use the same logic as readReady for consistency
            const email = storedUserState?.email;
            const userId = email || role || 'anonymous';
            const selfMarked = role ? arr.some((p) => p.role === role && p.userId === userId) : false;
            setReady(selfMarked);
            console.log('After BC, updated state:', { arr, selfMarked, role, userId });
          } catch (e) {
            console.error('Failed to parse after BC message:', e);
          }
        }, 10);
      };
      
      // Test that BroadcastChannel is working by sending a test message
      setTimeout(() => {
        try {
          if (bcRef.current) {
            console.log('BroadcastChannel test: sending test message');
            bcRef.current.postMessage({ type: 'test', timestamp: Date.now() });
          }
        } catch (e) {
          console.warn('BroadcastChannel test failed:', e);
        }
      }, 100);
      
      console.log('Persistent BroadcastChannel created with listener:', sessionReadyKey, 'instance:', channel);
    } catch (e) {
      console.warn('Failed to create persistent BroadcastChannel:', e);
    }

    return () => {
      try { 
        console.log('Closing BroadcastChannel:', sessionReadyKey);
        bcRef.current?.close(); 
      } catch (e) {}
      bcRef.current = null;
    };
  }, [sessionReadyKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onStorage = (ev: StorageEvent) => {
      console.log('Storage event:', ev.key, ev.newValue, new Date().toISOString());
      if (!ev.key || ev.key === sessionReadyKey) readReady();
    };
    window.addEventListener('storage', onStorage);

    // Initial read
    readReady();

    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [sessionReadyKey, readReady]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    console.log('Setting up server synchronization...');
    // Use sessionReadyKey as the synchronization UUID
    const syncUuid = sessionReadyKey;

    if (syncUuid) {
      console.log('Starting initial server sync...');
      // initial fetch to populate state
      fetch(`/api/classroom/ready?uuid=${encodeURIComponent(syncUuid)}`).then((r) => r.json()).then((j) => {
        console.log('Initial server sync:', j);
        const participants = j.participants || [];
        setParticipants(participants);
        // Also update ready state for current user
        const email = storedUserState?.email;
        const userId = email || role || 'anonymous';
        const selfMarked = role ? participants.some((p: { role: string; userId: string }) => p.role === role && p.userId === userId) : false;
        setReady(selfMarked);
      }).catch((e) => console.warn('Initial server sync failed:', e));
      
      // clear any existing poll
      if (pollRef.current) { window.clearInterval(pollRef.current!); pollRef.current = null; }
      // close any existing EventSource
      try { esRef.current?.close(); } catch (e) {}
      try {
        setSyncMode('disconnected');
        const es = new EventSource(`/api/classroom/stream?uuid=${encodeURIComponent(syncUuid)}`);
        let sseOpened = false;
        es.onopen = () => {
          sseOpened = true;
          console.log('SSE connection opened successfully');
          setSyncMode('sse');
          // Clear any polling fallback when SSE reconnects
          if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
        };

        // If SSE doesn't open within 8 seconds, start polling as a reliable fallback
        // Increased timeout to allow for slow startups / proxy buffering.
        const sseTimeout = window.setTimeout(() => {
            if (!sseOpened) {
            console.warn('SSE did not open in time, starting polling fallback');
            setSyncMode('polling');
            if (!pollRef.current) {
              pollRef.current = window.setInterval(() => {
                fetch(`/api/classroom/ready?uuid=${encodeURIComponent(syncUuid)}`).then((r) => r.json()).then((j) => {
                  const participants = j.participants || [];
                  setParticipants(participants);
                  const email = storedUserState?.email;
                  const userId = email || role || 'anonymous';
                  const selfMarked = role ? participants.some((p: { role: string; userId: string }) => p.role === role && p.userId === userId) : false;
                  setReady(selfMarked);
                }).catch((e) => { console.warn('Polling fallback error:', e); });
              }, 2000) as unknown as number;
            }
          }
        }, 2000);
        
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            console.log('SSE message received:', data);
            
            // Handle different message types
            if (data.type === 'connected') {
              console.log('SSE connected successfully');
            } else if (data.type === 'ping') {
              // Keep-alive ping, ignore
              console.log('SSE ping received');
            } else {
              // Regular data message
              const participants = data.participants || [];
              setParticipants(participants);
              // Also update ready state for current user using same logic as readReady
              const email = storedUserState?.email;
              const userId = email || role || 'anonymous';
              const selfMarked = role ? participants.some((p: { role: string; userId: string }) => p.role === role && p.userId === userId) : false;
              setReady(selfMarked);
              console.log('SSE updated state:', { participants: participants.length, selfMarked, role, userId });
            }
          } catch (e) {
            console.warn('SSE message parse error:', e);
          }
        };
        es.onerror = (err) => {
          console.warn('SSE error:', err);
          console.log('SSE readyState:', es.readyState, 'url:', es.url);
          setSyncMode(es.readyState === EventSource.CLOSED ? 'polling' : 'disconnected');
          
          // Don't fallback to polling immediately, try to reconnect
            if (es.readyState === EventSource.CLOSED) {
            console.log('SSE connection closed, attempting to reconnect...');
            setTimeout(() => {
              // The EventSource will automatically reconnect, but we can help by re-initializing
              if (pollRef.current) window.clearInterval(pollRef.current);
              pollRef.current = window.setInterval(() => {
                fetch(`/api/classroom/ready?uuid=${encodeURIComponent(syncUuid)}`).then((r) => r.json()).then((j) => {
                  const participants = j.participants || [];
                  setParticipants(participants);
                  // Also update ready state for current user
                  const email = storedUserState?.email;
                  const userId = email || role || 'anonymous';
                  const selfMarked = role ? participants.some((p: { role: string; userId: string }) => p.role === role && p.userId === userId) : false;
                  setReady(selfMarked);
                }).catch((e) => console.warn('Polling fallback failed:', e));
              }, 5000) as unknown as number; // Increased to 5 seconds for less frequent polling
              setSyncMode('polling');
            }, 1000);
          }
        };
        esRef.current = es;
        // clear the timeout if SSE later opened or when cleaning up
        try { if (sseOpened) window.clearTimeout(sseTimeout); } catch (e) {}
      } catch (e) {
        console.warn('EventSource creation failed, falling back to polling:', e);
        // fallback: polling
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = window.setInterval(() => {
          fetch(`/api/classroom/ready?uuid=${encodeURIComponent(syncUuid)}`).then((r) => r.json()).then((j) => {
            const participants = j.participants || [];
            setParticipants(participants);
            // Also update ready state for current user
            const email = storedUserState?.email;
            const userId = email || role || 'anonymous';
            const selfMarked = role ? participants.some((p: { role: string; userId: string }) => p.role === role && p.userId === userId) : false;
            setReady(selfMarked);
          }).catch(() => {});
        }, 2000) as unknown as number;
      }
    }

    return () => {
      if (pollRef.current) { window.clearInterval(pollRef.current!); pollRef.current = null; }
      try { esRef.current?.close(); } catch (e) {}
      esRef.current = null;
    };
  }, [sessionReadyKey, role, storedUserState]);


  const toggleReady = () => {
    if (!deviceCheckPassed) {
      alert('請先完成音視頻檢測！');
      return;
    }
    
    try {
      const email = storedUserState?.email;
      // For demo purposes, use role as identifier if email is not available
      const userId = email || role || 'anonymous';
      console.log('toggleReady called:', { sessionReadyKey, role, email, userId, ready });

      // Re-enable server API for cross-device synchronization
      const syncUuid = sessionReadyKey;
      if (syncUuid) {
        // server-backed: POST ready state to server
        fetch('/api/classroom/ready', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ uuid: syncUuid, role, userId, action: ready ? 'unready' : 'ready' }),
        }).then((r) => r.json()).then((j) => {
          console.log('Server ready update response:', j);
          const parts = j.participants || [];
          setParticipants(parts);
          try {
            const email = storedUserState?.email;
            const userId = email || role || 'anonymous';
            const selfMarked = role ? parts.some((p: { role: string; userId: string }) => p.role === role && p.userId === userId) : false;
            setReady(selfMarked);
          } catch (e) {
            // fallback: toggle
            setReady(!ready);
          }
        }).catch((e) => {
          console.warn('Server ready update failed, falling back to localStorage:', e);
          // Fallback to localStorage if server fails
          fallbackToLocalStorage();
        });
      } else {
        // Fallback to localStorage
        fallbackToLocalStorage();
      }
    } catch (e) {
      console.warn('toggleReady failed', e);
    }
  };

  const fallbackToLocalStorage = () => {
    if (!sessionReadyKey) {
      console.warn('fallbackToLocalStorage called without sessionReadyKey');
      return;
    }
    const raw = localStorage.getItem(sessionReadyKey as string);
    const arr = raw ? JSON.parse(raw) as Array<{ role: string; userId: string }> : [];
    const email = storedUserState?.email;
    // For demo purposes, use role as identifier if email is not available
    const userId = email || role || 'anonymous';

    // Check if current user is already in the array
    const existingIndex = role ? arr.findIndex((p) => p.role === role && p.userId === userId) : -1;

    let filtered: Array<{ role: string; userId: string }>;
    let newReadyState: boolean;

    if (existingIndex >= 0) {
      // User is ready, remove them (toggle off)
      filtered = arr.filter((_, i) => i !== existingIndex);
      newReadyState = false;
    } else {
      // User is not ready, add them (toggle on)
      filtered = [...arr, { role: role!, userId }];
      newReadyState = true;
    }

    console.log('toggleReady localStorage:', {
      role,
      userId,
      currentReady: ready,
      existingIndex,
      arr,
      filtered,
      newReadyState,
      sessionReadyKey
    });

    localStorage.setItem(sessionReadyKey as string, JSON.stringify(filtered));
    try { window.dispatchEvent(new StorageEvent('storage', { key: sessionReadyKey as string, newValue: JSON.stringify(filtered) })); } catch (e) {}
    // also notify other tabs via BroadcastChannel when available
    try {
      console.log('Attempting to send BC message, bcRef.current:', bcRef.current);
      if (bcRef.current) {
        bcRef.current.postMessage({ type: 'ready-updated', timestamp: Date.now() });
        console.log('BroadcastChannel message sent from toggleReady:', sessionReadyKey, Date.now());
      } else {
        console.warn('BroadcastChannel not available - bcRef.current is null');
      }
    } catch (e) {
      console.warn('BroadcastChannel send failed:', e);
    }

    // Update local state
    setReady(newReadyState);
    setParticipants(filtered);
  };

  // ensure we have a whiteboard room UUID to key server readiness (create if needed)
  useEffect(() => {
    if (roomUuid || typeof window === 'undefined') return;
    // Disable Netless creation for now to avoid 400 errors and focus on sync
    /*
    fetch('/api/netless/room', { method: 'POST', body: JSON.stringify({}) }).then((r) => r.json()).then((j) => {
      if (j && j.uuid) setRoomUuid(j.uuid);
    }).catch(() => {});
    */
  }, [roomUuid]);

  useEffect(() => {
    // cleanup on unmount - DON'T remove ready state when entering classroom
    // Users should remain ready until they explicitly unready
    return () => {
      // Keep ready state intact when navigating to classroom
      // The ready state will be cleared when the user explicitly unready's
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReadyKey, role, storedUserState]);

  const hasTeacher = participants.some((p: { role: string; userId: string }) => p.role === 'teacher');
  const hasStudent = participants.some((p: { role: string; userId: string }) => p.role === 'student');
  const canEnter = hasTeacher && hasStudent;

  const enterClassroom = () => {
    // Clear ready state when entering classroom so users start fresh next time
    try {
      // Clear localStorage
      if (sessionReadyKey) try { localStorage.removeItem(sessionReadyKey as string); } catch (e) {}

      // Clear server-side ready state
      const syncUuid = sessionReadyKey;
      if (syncUuid) {
        fetch('/api/classroom/ready', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ uuid: syncUuid, action: 'clear-all' }),
        }).catch((e) => {
          console.warn('Failed to clear server ready state:', e);
        });
      }

      // Notify other tabs/windows via BroadcastChannel
      try {
        if (bcRef.current) {
          bcRef.current.postMessage({ type: 'ready-cleared', timestamp: Date.now() });
        }
      } catch (e) {
        console.warn('Failed to send ready-cleared message:', e);
      }

      // Reset local state
      setParticipants([]);
      setReady(false);
    } catch (e) {
      console.warn('Failed to clear ready state:', e);
    }

    const target = `/classroom/test?courseId=${encodeURIComponent(courseId)}${orderId ? `&orderId=${encodeURIComponent(orderId)}` : ''}${role ? `&role=${encodeURIComponent(role)}` : ''}${sessionReadyKey ? `&session=${encodeURIComponent(sessionReadyKey)}` : ''}`;
    router.push(target);
  };

  // Auto-enter classroom when both teacher and student are ready
  useEffect(() => {
    if (canEnter) {
      console.log('Both teacher and student ready, auto-entering classroom in 1 second...');
      const timer = setTimeout(() => {
        enterClassroom();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [canEnter]);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2>準備加入教室</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SyncBadge mode={syncMode} />
          <div style={{ fontSize: 12, color: '#666' }}>
            <div style={{ fontWeight: 600 }}>Session:</div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#333' }}>{sessionReadyKey}</div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 18 }}>{course?.title ?? '課程'}</div>
        <div style={{ marginTop: 8, color: '#666' }}>課程 ID: {courseId}</div>
        {orderId && <div style={{ color: '#666' }}>訂單 ID: {orderId}</div>}
        <div style={{ marginTop: 4, color: '#666' }}>
          角色：{role ? (role === 'teacher' ? '授課者 (Teacher)' : '學生 (Student)') : '—'}
        </div>
      </div>

      {/* 音視頻檢測區域 - 所有用戶都需要檢測 */}
      <div style={{ marginTop: 20, padding: 20, border: '2px solid #e0e0e0', borderRadius: 12, background: '#fafafa' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: deviceCheckPassed ? '#4caf50' : '#ff9800', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
            {deviceCheckPassed ? '✓' : '!'}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>檢查您的音訊和視訊</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>在加入前，請確認麥克風和攝影機運作正常</div>
          </div>
        </div>
        <VideoSetup onStatusChange={(audio, video) => {
          setAudioOk(audio);
          setVideoOk(video);
          setDeviceCheckPassed(audio && video);
        }} />
      </div>

      {/* 就緒按鈕 - 只有通過設備檢測才能點擊 */}
      <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button 
          onClick={toggleReady} 
          disabled={!deviceCheckPassed}
          style={{ 
            padding: '12px 24px', 
            background: !deviceCheckPassed ? '#ccc' : (ready ? '#4caf50' : '#2563eb'), 
            color: 'white', 
            border: 'none', 
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: !deviceCheckPassed ? 'not-allowed' : 'pointer',
            opacity: !deviceCheckPassed ? 0.6 : 1
          }}>
          {ready ? '✓ 已準備好，點擊取消' : (deviceCheckPassed ? '點擊表示準備好' : '請先完成音視頻檢測')}
        </button>
        {!deviceCheckPassed && (
          <div style={{ color: '#d32f2f', fontSize: 13 }}>
            ⚠ 請先測試麥克風和攝影機
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 15 }}>等待參與者就緒：</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, padding: 16, border: hasTeacher ? '2px solid #4caf50' : '2px solid #e0e0e0', borderRadius: 8, background: hasTeacher ? '#f1f8f4' : 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: hasTeacher ? '#4caf50' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 'bold' }}>
                {hasTeacher ? '✓' : ''}
              </div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>授課老師</div>
            </div>
            <div style={{ marginTop: 8, fontSize: 14, color: hasTeacher ? '#2e7d32' : '#666' }}>
              {hasTeacher ? '老師已準備好' : '等待老師加入...'}
            </div>
          </div>
          <div style={{ flex: 1, padding: 16, border: hasStudent ? '2px solid #4caf50' : '2px solid #e0e0e0', borderRadius: 8, background: hasStudent ? '#f1f8f4' : 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: hasStudent ? '#4caf50' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 'bold' }}>
                {hasStudent ? '✓' : ''}
              </div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>學生</div>
            </div>
            <div style={{ marginTop: 8, fontSize: 14, color: hasStudent ? '#2e7d32' : '#666' }}>
              {hasStudent ? '學生已準備好' : '等待學生加入...'}
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
          {canEnter ? '✓ 立即進入教室' : '等待所有人準備好...'}
        </button>
        <div style={{ display: 'inline-flex', gap: 8, marginLeft: 16 }}>
          <button 
            onClick={async () => { 
              try { 
                const url = `${window.location.origin}/classroom/wait?courseId=${encodeURIComponent(courseId)}${orderId ? `&orderId=${encodeURIComponent(orderId)}` : ''}${sessionReadyKey ? `&session=${encodeURIComponent(sessionReadyKey)}` : ''}`; 
                await navigator.clipboard.writeText(url); 
                alert('等待室連結已複製到剪貼簿！請分享給其他參與者。'); 
              } catch (e) { 
                try { 
                  const url = `${window.location.origin}/classroom/wait?courseId=${encodeURIComponent(courseId)}${orderId ? `&orderId=${encodeURIComponent(orderId)}` : ''}${sessionReadyKey ? `&session=${encodeURIComponent(sessionReadyKey)}` : ''}`; 
                  (window as any).prompt('複製此連結', url); 
                } catch {} 
              } 
            }} 
            style={{ padding: '10px 16px', border: '1px solid #ccc', borderRadius: 6, background: 'white', cursor: 'pointer' }}>
            📋 複製等待室連結
          </button>
        </div>
        {canEnter && (
          <div style={{ marginTop: 12, padding: 12, background: '#e3f2fd', borderRadius: 6, fontSize: 14, color: '#1565c0' }}>
            ✓ 所有參與者已準備好！將在 1 秒後自動進入教室...
          </div>
        )}
      </div>

      {/* Video quality controls - only visible to admin */}
      {storedUserState?.role === 'admin' && (
        <div style={{ marginTop: 20, maxWidth: 720 }}>
          <VideoControls currentQuality={currentQuality} isLowLatencyMode={isLowLatencyMode} onQualityChange={setCurrentQuality} onLowLatencyToggle={setIsLowLatencyMode} hasVideo={true} />
        </div>
      )}
    </div>
  );
}

function SyncBadge({ mode }: { mode: 'sse' | 'polling' | 'disconnected' }) {
  const label = mode === 'sse' ? 'SSE' : (mode === 'polling' ? 'Polling' : 'Disconnected');
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
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const micSourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);

  const [audioInputs, setAudioInputs] = React.useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = React.useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = React.useState<string | null>(null);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = React.useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = React.useState(false);
  const [previewingCamera, setPreviewingCamera] = React.useState(false);
  const [testingMic, setTestingMic] = React.useState(false);
  const testingMicRef = React.useRef(false);
  const [micLevel, setMicLevel] = React.useState(0);
  const [audioTested, setAudioTested] = React.useState(false);
  const [videoTested, setVideoTested] = React.useState(false);
  const [isClient, setIsClient] = React.useState(false);
  const [showIosNotice, setShowIosNotice] = React.useState(false);

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
        setAudioInputs(ais);
        setVideoInputs(vis);
        const sa = localStorage.getItem('tutor_selected_audio');
        const sv = localStorage.getItem('tutor_selected_video');
        if (sa) setSelectedAudioDeviceId(sa);
        else if (!selectedAudioDeviceId && ais.length) setSelectedAudioDeviceId(ais[0].deviceId);
        if (sv) setSelectedVideoDeviceId(sv);
        else if (!selectedVideoDeviceId && vis.length) setSelectedVideoDeviceId(vis[0].deviceId);
      } catch (e) {
        console.warn('[Device Enum] enumeration failed:', e);
      }
    };
    updateDevices();
    try { navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener('devicechange', updateDevices); } catch (e) {}
    return () => { mounted = false; try { navigator.mediaDevices && navigator.mediaDevices.removeEventListener && navigator.mediaDevices.removeEventListener('devicechange', updateDevices); } catch (e) {} };
  }, []);

  const requestPermissions = async () => {
    try {
      console.log('[Permission] Requesting camera and microphone access...');
      
      // On iOS Safari over HTTP, getUserMedia is not available
      // User must use HTTPS (ngrok tunnel recommended)
      if (!navigator.mediaDevices) {
        console.error('[Permission] navigator.mediaDevices not available - requires HTTPS on iOS');
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
        alert('您拒絕了相機或麥克風的權限。請在設定中允許存取權限。');
      } else if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
        alert('未找到相機或麥克風。請確認硬體已連接。');
      } else if (e?.name === 'NotSupportedError') {
        alert('您的瀏覽器不支援此功能。\n\n提示：iPhone 需要使用 HTTPS 連接（不能用 HTTP）。\n請使用 ngrok：ngrok http 3000');
      } else {
        alert(`發生錯誤：${e?.message || '未知錯誤'}\n\n如果您在 iPhone 上，請確保使用 HTTPS 連接。`);
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
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      previewStreamRef.current = s;
      if (localVideoRef.current) try { localVideoRef.current.srcObject = s; } catch (e) {}
      setPreviewingCamera(true);
      setVideoTested(true);
    } catch (e) {
      console.warn('startCameraPreview failed', e);
      alert('無法啟動相機預覽，請確認已授予權限且相機未被其他應用程式使用。');
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
      if (localVideoRef.current) try { localVideoRef.current.srcObject = null; } catch (e) {}
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
        } catch (e) {}
        if (testingMicRef.current) window.requestAnimationFrame(update);
      };
      update();
    } catch (e) {
      console.warn('startMicTest failed', e);
      setTestingMic(false);
      testingMicRef.current = false;
      setAudioTested(false);
      alert('無法啟動麥克風，請檢查權限設定');
    }
  };

  const stopMicTest = () => {
    try {
      try { audioContextRef.current?.close(); } catch (e) {}
      audioContextRef.current = null;
      analyserRef.current = null;
      micSourceRef.current = null;
    } catch (e) {}
    setTestingMic(false);
    testingMicRef.current = false;
    setMicLevel(0);
  };

  // persist selection when changed
  React.useEffect(() => {
    try { if (selectedAudioDeviceId) localStorage.setItem('tutor_selected_audio', selectedAudioDeviceId); } catch (e) {}
  }, [selectedAudioDeviceId]);
  React.useEffect(() => {
    try { if (selectedVideoDeviceId) localStorage.setItem('tutor_selected_video', selectedVideoDeviceId); } catch (e) {}
  }, [selectedVideoDeviceId]);

  // 通知父組件檢測狀態
  React.useEffect(() => {
    if (onStatusChange) {
      onStatusChange(audioTested, videoTested);
    }
  }, [audioTested, videoTested, onStatusChange]);

  // No auto-request: permissions will be requested by explicit user gesture
  React.useEffect(() => {
    return () => {};
  }, []);

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* iOS HTTPS Notice */}
      {showIosNotice && (
        <div style={{ width: '100%', padding: 16, background: '#ffebee', border: '2px solid #d32f2f', borderRadius: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 24 }}>⚠️</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#d32f2f' }}>iPhone 需要 HTTPS 連接</div>
              <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>HTTP 連接無法存取相機和麥克風，請使用 ngrok 建立 HTTPS 隧道</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#666', fontFamily: 'monospace', background: '#fff', padding: 8, borderRadius: 6, marginBottom: 8 }}>
            ngrok http 3000
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>
            然後在 iPhone 瀏覽器開啟 ngrok 提供的 HTTPS 網址（如：https://xxxxx.ngrok.io）
          </div>
        </div>
      )}

      <div style={{ flex: '0 0 auto', width: '100%', maxWidth: 420, background: '#000', padding: 16, borderRadius: 12, position: 'relative' }}>
        <div style={{ width: '100%', aspectRatio: '16/9', background: '#1a1a1a', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
          <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {!previewingCamera && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 14 }}>
              攝影機未啟動
            </div>
          )}
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: videoTested ? '#4caf50' : '#666' }} />
          <span>{videoTested ? '視訊已測試' : '尚未測試視訊'}</span>
        </div>
      </div>
      <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 麥克風設定 */}
        <div style={{ padding: 14, border: '1px solid #e0e0e0', borderRadius: 8, background: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: audioTested ? '#4caf50' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 'bold' }}>
              {audioTested ? '✓' : ''}
            </div>
            <label style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>麥克風</label>
          </div>
          {isClient && (
            <>
              <select 
                value={selectedAudioDeviceId ?? ''} 
                onChange={(e) => setSelectedAudioDeviceId(e.target.value || null)} 
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #ccc', marginBottom: 10 }}>
                {audioInputs.length === 0 && <option value="">未偵測到麥克風</option>}
                {audioInputs.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || '麥克風'}</option>))}
              </select>
              <button 
                onClick={() => { testingMic ? stopMicTest() : startMicTest(); }}
                style={{ width: '100%', padding: '10px 14px', background: testingMic ? '#d32f2f' : '#1976d2', color: 'white', border: 'none', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
                {testingMic ? '🔴 停止測試' : '🎤 測試麥克風'}
              </button>
            </>
          )}
          {testingMic && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>音量：</div>
              <div style={{ width: '100%', height: 12, background: '#eee', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: `${micLevel}%`, height: '100%', background: micLevel > 60 ? '#4caf50' : '#ff9800', transition: 'width 0.1s' }} />
              </div>
            </div>
          )}
        </div>

        {/* 攝影機設定 */}
        <div style={{ padding: 14, border: '1px solid #e0e0e0', borderRadius: 8, background: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: videoTested ? '#4caf50' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 'bold' }}>
              {videoTested ? '✓' : ''}
            </div>
            <label style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>攝影機</label>
          </div>
          {isClient && (
            <>
              <select 
                value={selectedVideoDeviceId ?? ''} 
                onChange={(e) => setSelectedVideoDeviceId(e.target.value || null)} 
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #ccc', marginBottom: 10 }}>
                {videoInputs.length === 0 && <option value="">未偵測到攝影機</option>}
                {videoInputs.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || '攝影機'}</option>))}
              </select>
              <button 
                onClick={() => { previewingCamera ? stopCameraPreview() : startCameraPreview(); }}
                style={{ width: '100%', padding: '10px 14px', background: previewingCamera ? '#d32f2f' : '#1976d2', color: 'white', border: 'none', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
                {previewingCamera ? '🔴 停止預覽' : '📹 預覽攝影機'}
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
                  alert('此功能需要 HTTPS 連接。\n\niOS/iPhone 必須使用 HTTPS 才能存取相機和麥克風。\n\n請使用 ngrok：\n1. 執行：ngrok http 3000\n2. 在 iPhone 開啟 ngrok 提供的 HTTPS URL');
                  return;
                }
                const ok = await requestPermissions();
                if (ok) {
                  try { await startCameraPreview(); } catch (e) { console.warn('preview after grant failed', e); }
                } else {
                  alert('無法取得權限。如果您在 iPhone 上，請確保使用 HTTPS（ngrok http 3000）');
                }
              } catch (e) { console.warn('manual request failed', e); }
            }}
            style={{ padding: '12px 16px', background: '#ff9800', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
            🔐 授予麥克風和攝影機權限
          </button>
        )}

        {isClient && permissionGranted && (
          <div style={{ padding: 12, background: '#c8e6c9', borderRadius: 6, fontSize: 13, color: '#2e7d32', fontWeight: 500 }}>
            ✓ 權限已授予，請選擇裝置並測試
          </div>
        )}

        <div style={{ padding: 12, background: '#e3f2fd', borderRadius: 6, fontSize: 13, color: '#1565c0' }}>
          💡 提示：完成測試後，您的裝置偏好會被記住
        </div>
      </div>
    </div>
  );
}

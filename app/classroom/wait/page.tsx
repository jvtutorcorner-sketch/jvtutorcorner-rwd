"use client";

import React, { useEffect, useState, useRef } from 'react';
import WaitCountdownModal from '@/components/WaitCountdownModal';
import WaitCountdownManager from '@/components/WaitCountdownManager';
import { useRouter } from 'next/navigation';
import { COURSES } from '@/data/courses';
import { getStoredUser } from '@/lib/mockAuth';
import VideoControls from '@/components/VideoControls';
import { VideoQuality } from '@/lib/agora/useAgoraClassroom';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useT } from '@/components/IntlProvider';

export default function ClassroomWaitPage() {
  const router = useRouter();

  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);

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
  const reconnectTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const sseDisabledRef = useRef(false);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const isUpdatingRef = useRef(false);
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

  const syncStateFromServer = React.useCallback(() => {
    if (!sessionReadyKey || !role) return;

    fetch(`/api/classroom/ready?uuid=${encodeURIComponent(sessionReadyKey)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Server responded with ${r.status}`);
        return r.json();
      })
      .then((j) => {
        const serverParticipants = j.participants || [];
        setParticipants(serverParticipants);
        
        const email = storedUserState?.email;
        const userId = email || role || 'anonymous';
        const selfIsReady = serverParticipants.some((p: { role: string; userId: string }) => p.role === role && p.userId === userId);
        setReady(selfIsReady);
        console.log('Synced state from server:', { participants: serverParticipants.length, selfIsReady });
      })
      .catch((e) => {
        console.warn('Failed to sync state from server:', e);
        // On failure, reset to a safe state
        setParticipants([]);
        setReady(false);
      });
  }, [sessionReadyKey, role, storedUserState]);

  const toggleReady = () => {
    if (!deviceCheckPassed) {
      alert(t('wait.ready_toggle_need_check'));
      return;
    }

    const syncUuid = sessionReadyKey;
    const email = storedUserState?.email;
    const userId = email || role || 'anonymous';
    const nextReadyState = !ready;

    if (!syncUuid || !role) return;

    // Send the state change to the server.
    fetch('/api/classroom/ready', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uuid: syncUuid, role, userId, action: nextReadyState ? 'ready' : 'unready' }),
    })
    .then(res => {
      if (!res.ok) throw new Error('Server update failed');
      // After successfully telling the server, immediately sync the latest state from it.
      // The server is the source of truth.
      syncStateFromServer();
      // Notify other tabs in this browser to re-sync immediately
      try {
        if (bcRef.current) {
          bcRef.current.postMessage({ type: 'ready_changed', uuid: syncUuid, timestamp: Date.now() });
        } else {
          const bc = new BroadcastChannel(syncUuid);
          bc.postMessage({ type: 'ready_changed', uuid: syncUuid, timestamp: Date.now() });
          setTimeout(() => bc.close(), 200);
        }
      } catch (e) {
        // ignore
      }
    })
    .catch(err => {
      console.error('toggleReady POST failed:', err);
      // If the POST fails, we can show an error and re-sync to get the last good state.
      alert(t('wait.sync_update_failed'));
      syncStateFromServer();
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
          console.log('SYNC: SSE message received, re-syncing from server.');
          syncStateFromServer();
        };

        es.onerror = (err) => {
          console.warn('SYNC: SSE error, disabling and switching to polling mode.');
          setSyncMode('polling');
          try { es.close(); } catch (e) {}
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
    const pollingTimer = setInterval(() => {
      if (esRef.current === null || esRef.current.readyState !== EventSource.OPEN) {
        syncStateFromServer();
      }
    }, 5000);

    // Cleanup all listeners on unmount
    return () => {
      console.log('SYNC: Cleaning up all synchronization listeners.');
      window.removeEventListener('storage', onStorage);
      clearInterval(pollingTimer);
      if (bcRef.current) {
        bcRef.current.close();
        bcRef.current = null;
      }
      if (esRef.current) {
        try { esRef.current.close(); } catch (e) {}
        esRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [sessionReadyKey, syncStateFromServer]);

  const hasTeacher = participants.some((p: { role: string; userId: string }) => p.role === 'teacher');
  const hasStudent = participants.some((p: { role: string; userId: string }) => p.role === 'student');
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
      // Read file as base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Extract base64 data (remove data:application/pdf;base64, prefix)
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      // Upload PDF to server
      const response = await fetch('/api/whiteboard/pdf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          uuid: sessionReadyKey,
          pdf: {
            name: file.name,
            data: base64Data,
            size: file.size,
            type: file.type
          }
        })
      });

      if (!response.ok) {
        throw new Error('PDF upload failed');
      }

      setSelectedPdf(file);
      alert('PDF 上傳成功！');
    } catch (error) {
      console.error('Failed to upload PDF:', error);
      alert('PDF 上傳失敗，請重試');
    } finally {
      setUploadingPdf(false);
    }
  }, [role, sessionReadyKey]);

  if (!isClient) return null;

  return (
    <div className="wait-page-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2>{t('wait.title')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LanguageSwitcher />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 18 }}>{course?.title ?? '課程'}</div>
        <div style={{ marginTop: 8, color: '#666' }}>{t('wait.course_id_label')} {courseId}</div>
        {orderId && <div style={{ color: '#666' }}>{t('wait.order_id_label')} {orderId}</div>}
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
          {ready ? t('wait.ready_toggle_ready') : (deviceCheckPassed ? t('wait.ready_toggle_not_ready') : t('wait.ready_toggle_need_check'))}
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
                } catch {} 
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

      {/* Video quality controls - only visible to admin */}
      {storedUserState?.role === 'admin' && (
        <div style={{ marginTop: 20, maxWidth: 720 }}>
          <VideoControls currentQuality={currentQuality} isLowLatencyMode={isLowLatencyMode} onQualityChange={setCurrentQuality} onLowLatencyToggle={setIsLowLatencyMode} hasVideo={true} />
        </div>
      )}
    {/* Place countdown manager at the end of the page content so it flows with scroll */}
    <div style={{ marginTop: 24 }}>
      <WaitCountdownManager />
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
    try { navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener('devicechange', updateDevices); } catch (e) {}
    return () => { mounted = false; try { navigator.mediaDevices && navigator.mediaDevices.removeEventListener && navigator.mediaDevices.removeEventListener('devicechange', updateDevices); } catch (e) {} };
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
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      previewStreamRef.current = s;
      if (localVideoRef.current) try { localVideoRef.current.srcObject = s; } catch (e) {}
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
      alert(t('mic_start_failed'));
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
  React.useEffect(() => {
    try { if (selectedAudioOutputId) localStorage.setItem('tutor_selected_output', selectedAudioOutputId); } catch (e) {}
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
        try { osc.stop(); } catch (e) {}
        try { ctx.close(); } catch (e) {}
        try { a.pause(); a.srcObject = null; a.remove(); } catch (e) {}
        setSpeakerTested(true);
      }, 700);
      } catch (e) {
      console.warn('testSpeaker failed', e);
      alert(t('wait.sound_test_failed'));
    }
  };

  // No auto-request: permissions will be requested by explicit user gesture
  React.useEffect(() => {
    return () => {};
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

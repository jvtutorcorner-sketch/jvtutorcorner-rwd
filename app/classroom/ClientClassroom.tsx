'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useAgoraClassroom } from '@/lib/agora/useAgoraClassroom';
import { getStoredUser, setStoredUser } from '@/lib/mockAuth';
import { COURSES } from '@/data/courses';
import EnhancedWhiteboard from '@/components/EnhancedWhiteboard';
import dynamic from 'next/dynamic';
import { useT } from '@/components/IntlProvider';
import type { AgoraWhiteboardRef } from '@/components/AgoraWhiteboard';

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), { ssr: false });
const ConsoleLogViewer = dynamic(() => import('@/components/ConsoleLogViewer'), { ssr: false });
const NetworkSpeedMonitor = dynamic(() => import('@/components/NetworkSpeedMonitor'), { ssr: false });

// Agora Whiteboard (Feature Flag)
const AgoraWhiteboard = dynamic(() => import('@/components/AgoraWhiteboard'), { 
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-blue-600" />
    </div>
  )
});

type Role = 'teacher' | 'student';

const hexToRgbArray = (value: string | number[]): [number, number, number] => {
  if (Array.isArray(value) && value.length === 3) {
    const arr = value as number[];
    return [arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0];
  }
  let hex = (value || '').toString().trim();
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (hex.length !== 6 || Number.isNaN(Number.parseInt(hex, 16))) {
    return [0, 0, 0];
  }
  const num = Number.parseInt(hex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
};

const ClientClassroom: React.FC<{ channelName?: string }> = ({ channelName }) => {
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const courseId = searchParams?.get('courseId') ?? 'c1';
  const orderId = searchParams?.get('orderId') ?? null;
  const sessionParam = searchParams?.get('session');
  const sessionReadyKey = sessionParam || channelName || `classroom_session_ready_${courseId}`;
  const t = useT();
  
  // Feature Flag: Agora Whiteboard vs Canvas Whiteboard
  // Default to using Agora whiteboard unless explicitly disabled with NEXT_PUBLIC_USE_AGORA_WHITEBOARD='false'
  const useAgoraWhiteboard = process.env.NEXT_PUBLIC_USE_AGORA_WHITEBOARD !== 'false';
  const agoraWhiteboardRef = useRef<AgoraWhiteboardRef>(null);
  const [agoraRoomData, setAgoraRoomData] = useState<{ uuid: string; roomToken: string; appIdentifier: string; region: string; userId: string } | null>(null);
  // determine courseId from query string (e.g. ?courseId=c1)
  const course = COURSES.find((c) => c.id === courseId) || null;
  
  // Share classroom and media channel via explicit session param when available
  const effectiveChannelName = sessionParam || channelName || `classroom_session_ready_${courseId}`;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // determine role from stored user + course mapping
  const storedUser = typeof window !== 'undefined' ? getStoredUser() : null;
  // allow overriding role via URL parameter `role=teacher|student` for testing
  const urlRole = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('role') : null;
  const forceJoin = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('forceJoin') === 'true';

  const isAdmin = storedUser?.role === 'admin';
  let computedRole: Role = 'student';
  if (storedUser?.role === 'teacher' || isAdmin) {
    // if storedUser has teacher role or is admin (for testing), assume teacher for the course
    computedRole = 'teacher';
  } else if (storedUser?.displayName && course?.teacherName) {
    // if displayName matches course teacher name, treat as teacher
    if (storedUser.displayName.includes(course.teacherName) || course.teacherName.includes(storedUser.displayName)) {
      computedRole = 'teacher';
    }
  }

  const {
    joined,
    loading,
    error,
    remoteUsers,
    localVideoRef,
    remoteVideoRef,
    whiteboardRef,
    whiteboardMeta,
    join,
    leave,
    checkDevices,
    // 新增：视频控制
    currentQuality,
    isLowLatencyMode,
    setVideoQuality,
    setLowLatencyMode,
    setLocalAudioEnabled,
    setLocalVideoEnabled,
    // Troubleshoot helpers
    fixStatus,
    triggerFix,
  } = useAgoraClassroom({
    channelName: effectiveChannelName,
    role: (urlRole === 'teacher' || urlRole === 'student') ? (urlRole as Role) : computedRole,
    isOneOnOne: true, // 启用1对1优化
    defaultQuality: 'high' // 默认高质量
  });
  

  const firstRemote = useMemo(() => remoteUsers?.[0] ?? null, [remoteUsers]);

  const isTeacher = (urlRole === 'teacher' || computedRole === 'teacher');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__classroom_role = isTeacher ? 'teacher' : 'student';
      (window as any).__classroom_is_teacher = isTeacher;
    }
  }, [isTeacher]);

  useEffect(() => {
    console.log('[ClientClassroom] remoteUsers changed:', remoteUsers.length);
  }, [remoteUsers]);

  const [hasAudioInput, setHasAudioInput] = useState<boolean | null>(null);
  const [hasVideoInput, setHasVideoInput] = useState<boolean | null>(null);
  const [wantPublishVideo, setWantPublishVideo] = useState(true);
  // Independent microphone control (works before joining)
  const [micEnabled, setMicEnabled] = useState(true);
  const initializedDefaultsRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micTogglePendingRef = useRef(false);

  // PDF viewer state
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [showPdf, setShowPdf] = useState(false);

  // Define userId for Agora whiteboard
  const userId = storedUser?.email || (urlRole === 'teacher' || computedRole === 'teacher' ? 'teacher' : 'student') || 'anonymous';

  // Initialize Agora Whiteboard Room (if feature flag enabled)
  useEffect(() => {
    if (!useAgoraWhiteboard || !mounted || !userId) return;
    
    const initAgoraWhiteboard = async () => {
      try {
        const res = await fetch('/api/whiteboard/room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });
        
        if (res.ok) {
          const data = await res.json();
          setAgoraRoomData(data);
          console.log('[ClientClassroom] Agora Whiteboard room initialized:', data.uuid);
        } else {
          console.error('[ClientClassroom] Failed to initialize Agora Whiteboard room');
        }
      } catch (error) {
        console.error('[ClientClassroom] Error initializing Agora Whiteboard:', error);
      }
    };
    
    initAgoraWhiteboard();
  }, [useAgoraWhiteboard, mounted, userId]);

  // Load PDF from server if available (synced from wait page)
  useEffect(() => {
    if (!mounted || !sessionReadyKey) return;
    
    const checkPdf = async () => {
      try {
        const resp = await fetch(`/api/whiteboard/pdf?uuid=${encodeURIComponent(sessionReadyKey)}&check=true`);
        if (resp.ok) {
           const json = await resp.json();
           if (json.found) {
             console.log('[ClientClassroom] Found existing PDF for session');
             const fileResp = await fetch(`/api/whiteboard/pdf?uuid=${encodeURIComponent(sessionReadyKey)}`);
             if (fileResp.ok) {
               const blob = await fileResp.blob();
               // Get filename from json meta if possible
               const fileName = json.meta?.name || 'course.pdf';
               const fileType = json.meta?.type || 'application/pdf';
               const file = new File([blob], fileName, { type: fileType });
               setSelectedPdf(file);
               setShowPdf(true); 
             } else {
               console.warn('[ClientClassroom] PDF file download failed:', fileResp.status);
             }
           }
        }
      } catch (e) {
        console.warn('Failed to check for PDF', e);
      }
    };
    
    checkPdf();
  }, [mounted, sessionReadyKey]);
  // session countdown - default to 5 minutes
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState<number>(5); // 5 minutes
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  // DISABLED: Old canvas whiteboard initialization (conflicts with Agora whiteboard)
  // Initialize whiteboard room BEFORE joining Agora session
  // const [whiteboardMetaBeforeJoin, setWhiteboardMetaBeforeJoin] = useState<any>(null);

  // DISABLED: Canvas whiteboard init - now using Agora whiteboard by default
  // useEffect(() => {
  //   if (typeof window === 'undefined') return;
  //   if (!useAgoraWhiteboard) { // Only init canvas whiteboard if Agora is disabled
  //     const initializeWhiteboard = async () => { ... }
  //     initializeWhiteboard();
  //   }
  // }, [effectiveChannelName, useAgoraWhiteboard]);

  // Device lists and selections (Google Meet-like UI)
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(null);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  // Restore device selections saved from waiting page (if any)
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const sa = window.localStorage.getItem('tutor_selected_audio');
      const sv = window.localStorage.getItem('tutor_selected_video');
      if (sa) setSelectedAudioDeviceId(sa);
      if (sv) setSelectedVideoDeviceId(sv);
    } catch (e) {}
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pre-join waiting / readiness state (require same course + order)
  const [ready, setReady] = useState(false);
  const [canJoin, setCanJoin] = useState(false);

  // Camera preview and mic test
  const previewStreamRef = useRef<MediaStream | null>(null);
  const [previewingCamera, setPreviewingCamera] = useState(false);
  const [testingMic, setTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const [penColor, setPenColor] = useState<string>('#000000');

  // Log initialization info once on mount
  useEffect(() => {
    console.log('ClientClassroom initialized:', { 
      courseId, 
      orderId, 
      channelName, 
      effectiveChannelName,
      urlRole,
      computedRole 
    });
  }, []); // Empty deps = run once on mount
  
  // Debug whiteboard state
  useEffect(() => {
    console.log('Whiteboard state:', {
      hasWhiteboardRef: !!whiteboardRef,
      whiteboardMeta,
      joined
    });
    
    // 為 E2E 測試暴露狀態
    if (typeof window !== 'undefined') {
      (window as any).__classroom_joined = joined;
      (window as any).__classroom_whiteboard_ready = !!whiteboardMeta;
      (window as any).__classroom_ready = joined && !!whiteboardMeta;
    }
  }, [whiteboardRef, whiteboardMeta, joined]);

  // 跨标签页同步：老師開始上課時通知學生
  useEffect(() => {
    // Use the shared session identifier (same as waiting page) so messages are received across pages
    const sessionBroadcastName = sessionParam || channelName || `classroom_session_ready_${courseId}`;
    console.log('ClientClassroom broadcast channel:', sessionBroadcastName);
    const bc = new BroadcastChannel(sessionBroadcastName);
    
    bc.onmessage = (event) => {
      console.log('[BroadcastChannel] Received message:', event.data);
      if (event.data?.type === 'class_started' && !joined && !loading) {
        // New: Student saves the authoritative endTs from teacher
        if (event.data.endTs) {
            const endKey = `class_end_ts_${sessionReadyKey}`;
            try {
                localStorage.setItem(endKey, String(event.data.endTs));
            } catch (e) {}
        }
        console.log('收到開始上課通知，自動加入... 頻道:', effectiveChannelName);
        // 学生端自动加入
        join({ publishAudio: micEnabled, publishVideo: wantPublishVideo, audioDeviceId: selectedAudioDeviceId ?? undefined, videoDeviceId: selectedVideoDeviceId ?? undefined });
      } else if (event.data?.type === 'ready-updated') {
        // Another tab updated ready state — re-check localStorage and update canJoin immediately
        try {
          const raw = localStorage.getItem(sessionReadyKey);
          const arr = raw ? JSON.parse(raw) as Array<{ role: string; email?: string; present?: boolean }> : [];
          const hasTeacher = arr.some((p) => p.role === 'teacher' && p.present);
          const hasStudent = arr.some((p) => p.role === 'student' && p.present);
          setCanJoin(hasTeacher && hasStudent);
          console.log('[BroadcastChannel] ready-updated processed, canJoin=', hasTeacher && hasStudent);
        } catch (e) {
          console.warn('Failed to process ready-updated BC message', e);
        }
      } else if (event.data?.type === 'class_ended') {
        console.log('收到結束上課通知');
        // 如果已经在课堂中，自动离开并返回等待页
        if (joined) {
          endSession();
        }
      }
    };
    
    return () => {
      try { bc.close(); } catch (e) {}
    };
  }, [courseId, orderId, joined, loading, micEnabled, wantPublishVideo, join, sessionParam, channelName]);

  // 🚀 自動加入/恢復機制 (Auto-join / Re-join)
  // 處理學生自動進入已開始的課堂，以及老師重新整理頁面後恢復通話
  useEffect(() => {
    if (!mounted || joined || loading || !sessionReadyKey) return;

    const checkAndAutoJoin = async () => {
      try {
        const roleName = (urlRole === 'teacher' || computedRole === 'teacher') ? 'teacher' : 'student';
        const isTeacher = roleName === 'teacher';
        const isStudent = roleName === 'student';

        // 1. 檢查伺服器端的會話狀態（判斷課堂是否已經正式開始）
        const sResp = await fetch(`/api/classroom/session?uuid=${encodeURIComponent(sessionReadyKey)}`);
        let hasActiveSession = false;
        if (sResp.ok) {
          const sJson = await sResp.json();
          // 如果 endTs 存在且大於目前時間，表示課堂已在進行中
          if (sJson.endTs && sJson.endTs > Date.now()) {
            hasActiveSession = true;
          }
        }

        // 檢查雙方是否都已「進入教室」(present)
        const qResp = await fetch(`/api/classroom/ready?uuid=${encodeURIComponent(sessionReadyKey)}`, { cache: 'no-store' });
        let bothPresent = false;
        if (qResp.ok) {
          const qJson = await qResp.json();
          const parts = qJson.participants || [];
          bothPresent = parts.some((p: any) => p.role === 'teacher' && p.present) && 
                        parts.some((p: any) => p.role === 'student' && p.present);
        }

        if (hasActiveSession) {
          console.log(`[AutoJoin] ${roleName} 檢測到進行中會話，正在自動加入...`);
          join({ 
            publishAudio: micEnabled, 
            publishVideo: wantPublishVideo, 
            audioDeviceId: selectedAudioDeviceId ?? undefined, 
            videoDeviceId: selectedVideoDeviceId ?? undefined 
          });
          return;
        }

        // 2. 只有當雙方都在教室內 (canJoin=true 或 qResp 返回雙方都 present) 才觸發啟動
        if (canJoin || bothPresent || forceJoin) {
          if ((bothPresent && !canJoin) || forceJoin) setCanJoin(true);
          console.log(`[AutoJoin] 雙方都已進入教室 (or forceJoin)，${roleName} 自動加入...`);
          join({ 
            publishAudio: micEnabled, 
            publishVideo: wantPublishVideo, 
            audioDeviceId: selectedAudioDeviceId ?? undefined, 
            videoDeviceId: selectedVideoDeviceId ?? undefined 
          });
        }
      } catch (e) {
        console.warn('[AutoJoin] 自動加入檢查失敗:', e);
      }
    };

    // 如果 canJoin 已經為 true，縮短延遲以加速啟動
    const delay = canJoin ? 500 : 2000;
    const timer = setTimeout(checkAndAutoJoin, delay);
    return () => clearTimeout(timer);
  }, [mounted, joined, loading, sessionReadyKey, urlRole, computedRole, micEnabled, wantPublishVideo, join, canJoin]);

  useEffect(() => {
    let mountedFlag = true;
    (async () => {
      if (checkDevices) {
        const d = await checkDevices();
        if (!mountedFlag) return;
        setHasAudioInput(Boolean(d.hasAudioInput));
        setHasVideoInput(Boolean(d.hasVideoInput));
        // ONLY set defaults on first initialization, do NOT reset after user changes them
        if (!initializedDefaultsRef.current) {
          setMicEnabled(Boolean(d.hasAudioInput));
          setWantPublishVideo(Boolean(d.hasVideoInput));
          initializedDefaultsRef.current = true;
        }
      } else {
        setHasAudioInput(false);
        setHasVideoInput(false);
      }
    })();
    return () => { mountedFlag = false; };
  }, [checkDevices]);

  // enumerate devices and listen for devicechange
  useEffect(() => {
    let mountedFlag = true;

    const updateDevices = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!mountedFlag) return;
        const ais = list.filter((d) => d.kind === 'audioinput');
        const vis = list.filter((d) => d.kind === 'videoinput');
        setAudioInputs(ais);
        setVideoInputs(vis);
        if (!selectedAudioDeviceId && ais.length) setSelectedAudioDeviceId(ais[0].deviceId);
        if (!selectedVideoDeviceId && vis.length) setSelectedVideoDeviceId(vis[0].deviceId);
      } catch (e) {
        // ignore
      }
    };

    updateDevices();
    navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener('devicechange', updateDevices);

    return () => {
      mountedFlag = false;
      try { navigator.mediaDevices && navigator.mediaDevices.removeEventListener && navigator.mediaDevices.removeEventListener('devicechange', updateDevices); } catch (e) {}
    };
  }, [selectedAudioDeviceId, selectedVideoDeviceId]);

  // Auto-request permissions on mount to populate device list
  useEffect(() => {
    if (!mounted) return;
    let ignore = false;
    (async () => {
      try {
        // Check if we already have permission by trying to get a minimal stream
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (!ignore) {
          setPermissionGranted(true);
          // Stop the stream immediately
          stream.getTracks().forEach(t => t.stop());
          // Re-enumerate to get device labels
          const list = await navigator.mediaDevices.enumerateDevices();
          setAudioInputs(list.filter((d) => d.kind === 'audioinput'));
          setVideoInputs(list.filter((d) => d.kind === 'videoinput'));
          setHasAudioInput(list.some((d) => d.kind === 'audioinput'));
          setHasVideoInput(list.some((d) => d.kind === 'videoinput'));
        }
      } catch (e) {
        // Permission denied or not yet granted - that's ok, user can click Request Permissions
        if (!ignore) setPermissionGranted(false);
      }
    })();
    return () => { ignore = true; };
  }, [mounted]);

  const requestPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      // Stop the stream immediately
      stream.getTracks().forEach(t => t.stop());
      setPermissionGranted(true);
      // re-enumerate to get labels
      const list = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(list.filter((d) => d.kind === 'audioinput'));
      setVideoInputs(list.filter((d) => d.kind === 'videoinput'));
      setHasAudioInput(list.some((d) => d.kind === 'audioinput'));
      setHasVideoInput(list.some((d) => d.kind === 'videoinput'));
      alert(t('permission_granted_devices'));
    } catch (e) {
      console.warn('Permission request failed', e);
      alert(t('permission_denied_devices'));
    }
  };

  // readiness management using localStorage to coordinate between teacher/student tabs
  useEffect(() => {
    let es: EventSource | null = null;
    const readReadyLocal = () => {
      try {
        const raw = localStorage.getItem(sessionReadyKey);
        const arr = raw ? JSON.parse(raw) as Array<{ role: string; email?: string; present?: boolean }> : [];
        // Only consider them "ready" in the classroom if they are also "present"
        const hasTeacher = arr.some((p) => p.role === 'teacher' && p.present);
        const hasStudent = arr.some((p) => p.role === 'student' && p.present);
        setCanJoin(hasTeacher && hasStudent);
      } catch (e) {
        setCanJoin(false);
      }
    };

    // Run local read immediately to have some state
    readReadyLocal();

    // Also attempt an authoritative server-side read to avoid relying on localStorage after navigation
    (async () => {
      try {
        if (!sessionReadyKey) return;
        const r = await fetch(`/api/classroom/ready?uuid=${encodeURIComponent(sessionReadyKey)}`, { cache: 'no-store' });
        const j = await r.json();
        const parts = j.participants || [];
        // Require both to be marked as 'present' (meaning they've entered the classroom page)
        const hasTeacher = parts.some((p: any) => p.role === 'teacher' && p.present);
        const hasStudent = parts.some((p: any) => p.role === 'student' && p.present);
        setCanJoin(hasTeacher && hasStudent);
      } catch (e) {
        // ignore server read errors
      }
    })();

    // Subscribe to server SSE for updates to participants (keeps canJoin in sync)
    // In production, we skip SSE (which returns 503) and rely on the polling interval set below
    const isProduction = process.env.NODE_ENV === 'production';
    try {
      if (sessionReadyKey && !isProduction) {
        es = new EventSource(`/api/classroom/stream?uuid=${encodeURIComponent(sessionReadyKey)}`);
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data.participants) {
              const parts = data.participants as Array<{ role: string; userId?: string; present?: boolean }>;
              const hasTeacher = parts.some((p) => p.role === 'teacher' && p.present);
              const hasStudent = parts.some((p) => p.role === 'student' && p.present);
              setCanJoin(hasTeacher && hasStudent);
            }
          } catch (e) {}
        };
      }
    } catch (e) {}

    // Add a fallback interval to refresh participant status (essential for production where SSE is disabled, 
    // and good as a safety fallback in development if SSE fails).
    let pollingInterval: any = null;
    if (sessionReadyKey) {
      pollingInterval = setInterval(async () => {
        try {
          const r = await fetch(`/api/classroom/ready?uuid=${encodeURIComponent(sessionReadyKey)}`, { cache: 'no-store' });
          if (r.ok) {
            const j = await r.json();
            const parts = j.participants || [];
            const hasTeacher = parts.some((p: any) => p.role === 'teacher' && p.present);
            const hasStudent = parts.some((p: any) => p.role === 'student' && p.present);
            setCanJoin(hasTeacher && hasStudent);
          }
        } catch (e) {}
      }, 3000); 
    }

    // Also respond to storage events from other tabs
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === sessionReadyKey) readReadyLocal();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('storage', onStorage);
      if (pollingInterval) clearInterval(pollingInterval);
      try { es?.close(); } catch (e) {}
    };
  }, [sessionReadyKey]);

  // Report current user as ready to the server when entering the classroom page
  // This ensures cross-device synchronization works even if localStorage is not shared.
  useEffect(() => {
    if (!mounted || !sessionReadyKey) return;

    const reportReady = async () => {
      const roleName = (urlRole === 'teacher' || computedRole === 'teacher') ? 'teacher' : 'student';
      const userId = storedUser?.email || roleName || 'anonymous';
      
      // Update local storage first to ensure local consistency
      markReady(true);
      
      try {
        const r = await fetch(`/api/classroom/ready?uuid=${encodeURIComponent(sessionReadyKey)}`, { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        const parts = j.participants || [];
        const selfEntry = parts.find((p: any) => p.role === roleName && p.userId === userId);
        
        // BUG FIX: If even if we are in the list, we might not be marked as 'present'.
        // We must ensure the server knows we are in the classroom page.
        if (!selfEntry || !selfEntry.present) {
          await fetch('/api/classroom/ready', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ 
              uuid: sessionReadyKey, 
              role: roleName, 
              userId, 
              action: 'ready',
              present: true 
            }),
          });
          console.log(`[ClientClassroom] Force reported ${roleName} as PRESENT to server (previous state: ${selfEntry ? 'ready only' : 'not found'})`);
        }
      } catch (e) {
        console.warn('[ClientClassroom] Failed to report ready to server', e);
      }
    };

    reportReady();
    
    // Periodic heartbeat to keep the ready status alive while on this page
    const interval = setInterval(reportReady, 10000);
    return () => {
      clearInterval(interval);
      // Optional: Mark as not present when leaving the page (best-effort)
      const roleName = (urlRole === 'teacher' || computedRole === 'teacher') ? 'teacher' : 'student';
      const userId = storedUser?.email || roleName || 'anonymous';
      const params = new URLSearchParams();
      params.append('uuid', sessionReadyKey);
      
      // Use sendBeacon for more reliable delivery during unload
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ uuid: sessionReadyKey, role: roleName, userId, action: 'ready', present: false })], { type: 'application/json' });
        navigator.sendBeacon('/api/classroom/ready', blob);
      }
    };
  }, [mounted, sessionReadyKey, urlRole, computedRole, storedUser]);

  const endSession = async () => {
    try {
      // 广播结束上课通知 (use same shared session name as wait page)
      const sessionBroadcastName = sessionParam || channelName || `classroom_session_ready_${courseId}`;
      try {
        const bc = new BroadcastChannel(sessionBroadcastName);
        bc.postMessage({ type: 'class_ended', timestamp: Date.now() });
        console.log('已廣播結束上課通知 ->', sessionBroadcastName);
        setTimeout(() => { try { bc.close(); } catch (e) {} }, 100);
      } catch (e) {
        console.warn('BroadcastChannel endSession failed', e);
      }
      
      await leave();
      try { (window as any).__wbRoom = null; } catch (e) {}
        if (whiteboardMeta?.uuid) {
        try {
          await fetch('/api/agora/whiteboard/close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid: whiteboardMeta.uuid }),
            keepalive: true,
          });
        } catch (e) { console.warn('whiteboard close request failed (ignored)', e); }
      }
      
      // 返回到等待页面，保持相应的 role 参数
      const currentRole = (urlRole === 'teacher' || urlRole === 'student') ? urlRole : computedRole;
      const waitPageUrl = `/classroom/wait?courseId=${courseId}${orderId ? `&orderId=${orderId}` : ''}&role=${currentRole}`;
      try {
        // Clear persistent end timestamp when session ends
        const endKey = `class_end_ts_${sessionReadyKey}`;
        try { 
          localStorage.removeItem(endKey);
          // Also clear the ready state for the session
          localStorage.removeItem(sessionReadyKey);
        } catch (e) {}
        try {
          // clear authoritative server session record as well
          try { await fetch('/api/classroom/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uuid: sessionReadyKey, action: 'clear' }) }); } catch (e) { console.warn('Failed to clear server session', e); }
        } catch (e) {}
      } catch (e) {}
      window.location.href = waitPageUrl;
    } catch (e) {
      console.warn('end session failed', e);
      alert('End session attempt failed; check console');
    }
  };

  const handleLeave = async () => {
    try {
      console.log('handleLeave called');
      await leave();
      console.log('leave() completed');
      // Return to wait page based on role
      const currentRole = (urlRole === 'teacher' || urlRole === 'student') ? urlRole : computedRole;
      const waitPageUrl = `/classroom/wait?courseId=${courseId}${orderId ? `&orderId=${orderId}` : ''}&role=${currentRole}`;
      console.log('navigating to:', waitPageUrl);
      window.location.href = waitPageUrl;
    } catch (e) {
      console.warn('leave failed', e);
      // Don't show alert for extension errors
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (!errorMessage.includes('Receiving end does not exist')) {
        alert('Leave failed; check console');
      }
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
      if (localVideoRef.current) {
        try { localVideoRef.current.srcObject = s; } catch (e) { console.warn('attach preview failed', e); }
      }
      setPreviewingCamera(true);
    } catch (e) {
      console.warn('startCameraPreview failed', e);
      alert(t('camera_preview_failed'));
      setPreviewingCamera(false);
    }
  };

  const markReady = (flag: boolean) => {
    setReady(flag);
    try {
      const raw = localStorage.getItem(sessionReadyKey);
      const arr = raw ? JSON.parse(raw) as Array<{ role: string; userId?: string; email?: string; present?: boolean }> : [];
      const user = (getStoredUser && typeof getStoredUser === 'function') ? getStoredUser() : null;
      const roleName = (urlRole === 'teacher' || computedRole === 'teacher') ? 'teacher' : 'student';
      const userId = user?.email || roleName || 'anonymous';
      
      // remove existing entry for this role/userId
      const filtered = arr.filter((p) => !(p.role === roleName && (p.userId === userId || p.email === user?.email)));
      if (flag) {
        filtered.push({ role: roleName, userId, email: user?.email, present: true }); // We are in classroom, so mark as present
      }
      localStorage.setItem(sessionReadyKey, JSON.stringify(filtered));
      try { window.dispatchEvent(new StorageEvent('storage', { key: sessionReadyKey, newValue: JSON.stringify(filtered) })); } catch (e) {}
      // notify other tabs via BroadcastChannel
      try {
        const bc = new BroadcastChannel(sessionReadyKey);
        bc.postMessage({ type: 'ready-updated' });
        bc.close();
      } catch (e) {}
    } catch (e) {
      console.warn('markReady failed', e);
    }
  };

  useEffect(() => {
    // This effect is intentionally left empty. The original logic that cleared
    // the "ready" status on unmount has been moved to the `useEffect` that
    // handles the `joined` state change. This prevents a user leaving the
    // classroom from affecting the state of the waiting room.
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The 'beforeunload' logic that modified the ready list has also been removed
  // to prevent race conditions and incorrect state changes for the wait page.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // This effect is intentionally left empty.
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReadyKey, urlRole, computedRole]);

  // start/stop countdown when `joined` changes
  useEffect(() => {
    // clear existing timer
    if (timerRef.current) {
      try { window.clearInterval(timerRef.current); } catch (e) {}
      timerRef.current = null;
    }

    if (joined) {
      (async () => {
        // 老师开始上课时，广播通知学生 and persist end timestamp
        const isTeacher = (urlRole === 'teacher' || urlRole === 'student') ? urlRole === 'teacher' : computedRole === 'teacher';
        const secs = Math.floor((sessionDurationMinutes || 0.5) * 60);
        const endKey = `class_end_ts_${sessionReadyKey}`;

        // Determine or create authoritative end timestamp
        let endTs: number | null = null;
        try {
          const existing = typeof window !== 'undefined' ? localStorage.getItem(endKey) : null;
          if (existing) {
            const parsed = Number(existing || 0);
            if (!Number.isNaN(parsed) && parsed > Date.now()) endTs = parsed;
          }
        } catch (e) { /* ignore */ }

        // If no local endTs, check authoritative server session store
        if (!endTs) {
          try {
            const resp = await fetch(`/api/classroom/session?uuid=${encodeURIComponent(sessionReadyKey)}`);
            if (resp.ok) {
              const j = await resp.json();
              const sEnd = j?.endTs;
              if (typeof sEnd === 'number' && sEnd > Date.now()) {
                endTs = sEnd;
                try { localStorage.setItem(endKey, String(endTs)); } catch (e) {}
              }
            }
          } catch (e) { /* ignore fetch errors */ }
        }

        if (!endTs && isTeacher) {
          endTs = Date.now() + secs * 1000;
          try { localStorage.setItem(endKey, String(endTs)); } catch (e) {}
        }

        // Broadcast class_started with endTs so other tabs can pick it up immediately
        if (isTeacher) {
          const sessionBroadcastName = sessionParam || channelName || `classroom_session_ready_${courseId}`;
          try {
            const bc = new BroadcastChannel(sessionBroadcastName);
            bc.postMessage({ type: 'class_started', timestamp: Date.now(), endTs });
            console.log('已廣播開始上課通知 ->', sessionBroadcastName, 'endTs=', endTs);
            setTimeout(() => { try { bc.close(); } catch (e) {} }, 100);
          } catch (e) {
            console.warn('Failed to broadcast class_started', e);
          }

          // Persist authoritative endTs on server for rejoining clients
          try {
            await fetch('/api/classroom/session', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ uuid: sessionReadyKey, endTs }),
            });
          } catch (e) {
            console.warn('Failed to persist session endTs to server', e);
          }
        }

        // initialize remaining seconds from endTs if available, otherwise fallback to secs
        const initialRemaining = endTs ? Math.max(0, Math.ceil((endTs - Date.now()) / 1000)) : secs;
        setRemainingSeconds(initialRemaining);
        console.log(`開始倒計時, remainingSeconds=${initialRemaining}`);

        timerRef.current = window.setInterval(() => {
          setRemainingSeconds((prev) => {
            if (prev === null) return prev;
            if (prev <= 1) {
              // time's up
              console.log('時間到！自動結束課程並返回等待頁');
              try { if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; } } catch (e) {}
              // trigger endSession
              endSession();
              return 0;
            }
            return prev - 1;
          });
        }, 1000) as unknown as number;
      })();
    } else {
      setRemainingSeconds(null);
    }

    return () => {
      if (timerRef.current) {
        try { window.clearInterval(timerRef.current); } catch (e) {}
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, sessionDurationMinutes]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop camera preview if running
      stopCameraPreview();
      // Stop mic test if running
      stopMicTest();
    };
  }, []);

  const stopCameraPreview = () => {
    try {
      const s = previewStreamRef.current;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
      }
      previewStreamRef.current = null;
      if (localVideoRef.current) {
        try { localVideoRef.current.srcObject = null; } catch (e) {}
      }
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
      previewStreamRef.current = s; // keep stream to stop later
      setTestingMic(true);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(data);
        // compute RMS
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setMicLevel(Math.min(1, rms * 2));
        if (testingMic) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (e) {
      console.warn('startMicTest failed', e);
      alert(t('mic_test_failed'));
    }
  };

  const stopMicTest = () => {
    try {
      const s = previewStreamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = null;
      if (micSourceRef.current) { try { micSourceRef.current.disconnect(); } catch (e) {} micSourceRef.current = null; }
      if (analyserRef.current) { try { analyserRef.current.disconnect(); } catch (e) {} analyserRef.current = null; }
      if (audioContextRef.current) { try { audioContextRef.current.close(); } catch (e) {} audioContextRef.current = null; }
    } catch (e) {
      console.warn('stopMicTest failed', e);
    }
    setTestingMic(false);
    setMicLevel(0);
  };

  // Independent microphone control (works before joining Agora session)
  const toggleMic = async () => {
    if (micTogglePendingRef.current) return;
    micTogglePendingRef.current = true;
    
    // Capture current state at function call time
    const wasEnabled = micEnabled;
    console.log('[toggleMic] START - wasEnabled=', wasEnabled, 'micStreamRef=', micStreamRef.current);
    
    try {
      if (wasEnabled) {
        // Mute microphone
        console.log('[toggleMic] Muting...');
        setMicEnabled(false);
        
        // Then async: ask Agora to mute if joined
        try {
          if (joined && typeof setLocalAudioEnabled === 'function') {
            console.log('[toggleMic] calling setLocalAudioEnabled(false) for Agora');
            await setLocalAudioEnabled(false);
          }
        } catch (e) { console.warn('Failed to mute Agora audio', e); }

        // Also silence any local test stream/tracks
        try {
          if (micStreamRef.current) {
            micStreamRef.current.getAudioTracks().forEach(track => { track.enabled = false; });
          }
          if (testingMic) stopMicTest();
        } catch (e) { console.warn('Failed to silence local mic', e); }
        
        console.log('[toggleMic] Microphone muted - state set to false');
      } else {
        // Unmute microphone
        console.log('[toggleMic] Unmuting...');
        setMicEnabled(true);

        // If already joined and Agora can manage local mic, prefer that
        let agoraSuccess = false;
        if (joined && typeof setLocalAudioEnabled === 'function') {
          try {
            console.log('[toggleMic] joined=true, calling setLocalAudioEnabled(true)');
            // If we have a local test stream open, stop it first so Agora can open the device
            try {
              if (micStreamRef.current) {
                micStreamRef.current.getTracks().forEach(t => t.stop());
                micStreamRef.current = null;
              }
              if (testingMic) stopMicTest();
            } catch (e) { console.warn('Failed to stop local test stream before enabling Agora mic', e); }

            await setLocalAudioEnabled(true, selectedAudioDeviceId ?? undefined);
            console.log('Microphone unmuted via Agora');
            agoraSuccess = true;
          } catch (e) {
            console.warn('setLocalAudioEnabled(true) failed, will try getUserMedia fallback', e);
          }
        }

        // If not joined or Agora failed, ensure we have a local stream for testing
        if (!agoraSuccess) {
          try {
            if (!micStreamRef.current) {
              const constraints: any = { audio: true };
              if (selectedAudioDeviceId && selectedAudioDeviceId !== '') {
                constraints.audio = { deviceId: { ideal: selectedAudioDeviceId } };
              }
              const stream = await navigator.mediaDevices.getUserMedia(constraints);
              micStreamRef.current = stream;

              // Set up audio context for level monitoring
              audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
              const ctx = audioContextRef.current;
              const src = ctx.createMediaStreamSource(stream);
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 256;
              src.connect(analyser);
              analyserRef.current = analyser;
              micSourceRef.current = src;
            }

            // Enable microphone tracks
            micStreamRef.current.getAudioTracks().forEach(track => { track.enabled = true; });
            console.log('Microphone unmuted via getUserMedia');
          } catch (e) {
            console.warn('Failed to unmute microphone via getUserMedia:', e);
            alert(t('mic_start_failed'));
            // State was already set to true above; audio will stay enabled in UI but may not actually work
          }
        }
        console.log('[toggleMic] Microphone unmuted - state set to true');
      }
    } finally {
      micTogglePendingRef.current = false;
      console.log('[toggleMic] END - micTogglePendingRef reset');
    }
  };

  useEffect(() => {
    return () => {
      // cleanup on unmount
      try { stopCameraPreview(); } catch (e) {}
      try { stopMicTest(); } catch (e) {}
      // Stop independent microphone stream
      try {
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach(track => track.stop());
          micStreamRef.current = null;
        }
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="client-classroom">
      {/* Left: Whiteboard (flexible) */}
      <div className="client-left">
        <div className="client-left-inner">
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12 }}>
                {remainingSeconds !== null && (
                  <div style={{ color: 'red', fontWeight: 600 }}>{Math.floor((remainingSeconds || 0) / 60)}:{String((remainingSeconds || 0) % 60).padStart(2, '0')}</div>
                )}
              </div>
          </div>
          <div className="whiteboard-container">
            {useAgoraWhiteboard && agoraRoomData ? (
              <AgoraWhiteboard
                ref={agoraWhiteboardRef}
                roomUuid={agoraRoomData.uuid}
                roomToken={agoraRoomData.roomToken}
                appIdentifier={agoraRoomData.appIdentifier}
                userId={agoraRoomData.userId}
                region={agoraRoomData.region}
                className="w-full h-full"
              />
            ) : (
              <EnhancedWhiteboard 
                channelName={effectiveChannelName}
                room={undefined} // Using canvas fallback instead of Netless SDK
                whiteboardRef={whiteboardRef}
                editable={isTeacher}
                autoFit={true}
                className="flex-1" 
                onPdfSelected={(f) => { setSelectedPdf(f); }}
                pdfFile={selectedPdf}
                micEnabled={micEnabled}
                onToggleMic={toggleMic}
                hasMic={hasAudioInput !== false}
                onLeave={() => leave()}
              />
            )}
          </div>
        </div>
      </div>

      {/* Right: Video previews and controls (fixed width) */}
      <div className="client-right">
        <div className="client-right-inner">
          <div className="video-container">
            <video ref={localVideoRef} autoPlay muted playsInline />
            <div className="video-label">
              {mounted && (urlRole === 'teacher' || computedRole === 'teacher') ? t('teacher_you') : t('student_you')}
            </div>
          </div>

          <div className="video-container">
            <video ref={remoteVideoRef} autoPlay playsInline />
            <div className="video-label">
              {firstRemote ? `${mounted && (urlRole === 'teacher' || computedRole === 'teacher') ? t('student') : t('teacher')}` : (mounted && (urlRole === 'teacher' || computedRole === 'teacher') ? t('student') : t('teacher'))}
            </div>
            {/* Controls moved: mic and leave are shown under the Join button in the controls area. */}
          </div>

          {/* Controls */}
          <div className="client-controls">
            {mounted && (isAdmin || computedRole === 'teacher' || computedRole === 'student') && (
              <>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {permissionGranted && (
                    <button
                      onClick={async () => {
                        try {
                          if (previewingCamera) {
                            // Stop preview stream if present
                            if (previewStreamRef.current) {
                              previewStreamRef.current.getTracks().forEach(t => t.stop());
                              previewStreamRef.current = null;
                            }
                            // If joined and Agora track exists, ask Agora to disable local camera
                            try { if (joined && typeof setLocalVideoEnabled === 'function') await setLocalVideoEnabled(false); } catch (e) { console.warn('Failed to disable Agora camera during preview stop', e); }
                            if (localVideoRef.current) {
                              try { localVideoRef.current.srcObject = null; } catch (e) {}
                            }
                            setPreviewingCamera(false);
                          } else {
                            // If already joined and Agora can manage camera, reuse Agora track
                            if (joined && typeof setLocalVideoEnabled === 'function') {
                              try {
                                await setLocalVideoEnabled(true);
                                setPreviewingCamera(true);
                                return;
                              } catch (e) {
                                console.warn('setLocalVideoEnabled(true) failed, falling back to preview getUserMedia', e);
                              }
                            }
                            await startCameraPreview();
                          }
                        } catch (e) {
                          console.warn('Preview toggle failed', e);
                        }
                      }}
                      style={{
                          flex: 1,
                          minWidth: 0,
                          background: previewingCamera ? '#6b7280' : '#10b981',
                          color: 'white',
                          border: 'none',
                          padding: '8px 12px',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontWeight: 600,
                          textAlign: 'center',
                          transition: 'background-color 0.2s ease'
                        }}
                    >
                      {previewingCamera ? t('camera_off') : t('camera_on')}
                    </button>
                  )}

                  {/* Microphone placed here (swapped with Join) */}
                  <button
                    type="button"
                    onClick={async () => {
                      console.log('Mic button clicked, permissionGranted=', permissionGranted, 'hasAudioInput=', hasAudioInput, 'micEnabled=', micEnabled);
                      try {
                        if (!permissionGranted) {
                          await requestPermissions();
                        }
                      } catch (e) {
                        console.warn('requestPermissions failed', e);
                      }

                      // Re-check available devices after requesting permissions
                      let hasAudio = hasAudioInput;
                      try {
                        if (navigator && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
                          const devs = await navigator.mediaDevices.enumerateDevices();
                          hasAudio = devs.some(d => d.kind === 'audioinput');
                          console.log('enumerateDevices result, hasAudio=', hasAudio, devs);
                        }
                      } catch (e) {
                        console.warn('enumerateDevices failed', e);
                      }

                      if (!hasAudio) {
                        alert(t('microphone_not_found'));
                        return;
                      }

                      console.log('[Mic Button] Before toggleMic, micEnabled=', micEnabled);
                      await toggleMic();
                      console.log('[Mic Button] After toggleMic, micEnabled should be toggled');
                    }}
                    // keep button enabled so user gesture can request permissions
                    disabled={false}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: micEnabled ? '#10b981' : '#6b7280',
                      color: 'white',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontWeight: 600,
                      textAlign: 'center',
                      transition: 'background-color 0.2s ease'
                    }}
                  >
                    {micEnabled ? t('mic_on') : t('mic_off')}
                  </button>

                  {/* New Leave button in the controls row (same as handleLeave) */}
                  <button
                    onClick={() => { try { handleLeave(); } catch (e) { console.error('Leave click error', e); } }}
                    disabled={!joined}
                    style={{
                      display: typeof window !== 'undefined' && window.location.pathname === '/classroom/test' ? 'none' : 'block',
                      background: joined ? '#f44336' : '#ef9a9a',
                      color: 'white',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: 4,
                      cursor: joined ? 'pointer' : 'not-allowed',
                      fontWeight: 600
                    }}
                  >
                    {t('leave')}
                  </button>

                  {/* Mic toggle and Leave placed below the Join button */}
                </div>

                {/* Console Log Viewers for debugging */}
                {typeof window !== 'undefined' && window.location.pathname === '/classroom/test' && (
                  <>
                    <ConsoleLogViewer title={`${(urlRole === 'teacher' || computedRole === 'teacher') ? '老師' : '學生'} Console Log`} />
                    <ConsoleLogViewer title={`${(urlRole === 'teacher' || computedRole === 'teacher') ? '學生' : '老師'} Console Log`} />
                    <NetworkSpeedMonitor title="網路速度監控" />
                  </>
                )}

                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexDirection: 'column', alignItems: 'stretch' }}>
                    {!joined ? (
                      <button
                        onClick={() => {
                          // Stop camera preview if running before joining
                          if (previewingCamera && previewStreamRef.current) {
                            previewStreamRef.current.getTracks().forEach(t => t.stop());
                            previewStreamRef.current = null;
                            if (localVideoRef.current) {
                              localVideoRef.current.srcObject = null;
                            }
                            setPreviewingCamera(false);
                          }
                            if (!canJoin) {
                            // Shouldn't be clickable when disabled, but guard anyway
                            alert(t('waitpage_not_ready'));
                            return;
                          }
                          console.log('[UI] Manual Join button clicked. Channel:', effectiveChannelName);
                          join({ publishAudio: micEnabled, publishVideo: wantPublishVideo, audioDeviceId: selectedAudioDeviceId ?? undefined, videoDeviceId: selectedVideoDeviceId ?? undefined });
                        }}
                        disabled={loading || !canJoin}
                        style={{
                          background: loading || !canJoin ? '#9CA3AF' : '#4CAF50',
                          color: 'white',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: 6,
                          cursor: loading || !canJoin ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                          width: '100%'
                        }}
                        >
                        {loading ? t('joining') : (canJoin ? t('join_start') : t('wait_other_ready'))}
                      </button>
                    ) : (
                      <div style={{ height: 0 }} />
                    )}

                    {/* Moved ready status message below Join button */}
                    <div style={{ marginTop: 8, color: canJoin ? '#10b981' : '#666', fontSize: 13, textAlign: 'center' }}>
                      {canJoin ? t('ready_complete') : t('ready_incomplete')}
                    </div>

                    <button
                      onClick={() => { try { handleLeave(); } catch (e) { console.error('Leave click error', e); } }}
                      disabled={!joined}
                      style={{
                        display: typeof window !== 'undefined' && window.location.pathname === '/classroom/test' ? 'none' : 'block',
                        background: joined ? '#f44336' : '#ef9a9a',
                        color: 'white',
                        border: 'none',
                        padding: '8px 12px',
                        borderRadius: 6,
                        cursor: joined ? 'pointer' : 'not-allowed',
                        fontWeight: 600,
                        width: '100%'
                      }}
                    >
                      {t('leave')}
                    </button>
                  </div>

                {joined && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#ffeb3b', background: 'rgba(255,235,59,0.1)', padding: 4, borderRadius: 4 }}>
                    {t('started_billing')}
                  </div>
                )}
                
                <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
                  <div><strong>{t('join')}</strong>: {t('join_desc')}</div>
                  <div><strong>{t('leave')}</strong>: {t('leave_desc')}</div>
                  <div><strong>{t('end_session')}</strong>: {t('end_session_desc')}</div>
                </div>
                
                {remainingSeconds !== null && (
                  <div style={{ marginTop: 6 }}>
                    <strong>{t('remaining_time')}</strong> {Math.floor((remainingSeconds || 0) / 60)}:{String((remainingSeconds || 0) % 60).padStart(2, '0')}
                  </div>
                )}
              </>
            )}
            {loading && <div style={{ color: '#ccc' }}>{t('joining')}</div>}
            {error && <div style={{ color: 'salmon' }}>{error}</div>}
          </div>
        </div>

      </div>
    </div>
  );
};

export default ClientClassroom;

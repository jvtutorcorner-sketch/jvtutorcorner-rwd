'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useAgoraClassroom } from '@/lib/agora/useAgoraClassroom';
import { getStoredUser, setStoredUser } from '@/lib/mockAuth';
import { COURSES } from '@/data/courses';
import EnhancedWhiteboard from '@/components/EnhancedWhiteboard';
import dynamic from 'next/dynamic';
import { useT } from '@/components/IntlProvider';

// 1. 修改 Import: 指向資料夾 (會自動抓 index.tsx)
import AgoraWhiteboard, { AgoraWhiteboardRef } from '@/components/AgoraWhiteboard';

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), { ssr: false });
const ConsoleLogViewer = dynamic(() => import('@/components/ConsoleLogViewer'), { ssr: false });
const NetworkSpeedMonitor = dynamic(() => import('@/components/NetworkSpeedMonitor'), { ssr: false });

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
  const sessionReadyKey = useMemo(() => 
    sessionParam || channelName || `classroom_session_ready_${courseId}`,
    [sessionParam, channelName, courseId]
  );
  const t = useT();
  
  // Feature Flag: Agora Whiteboard vs Canvas Whiteboard
  // Default to using Agora whiteboard unless explicitly disabled with NEXT_PUBLIC_USE_AGORA_WHITEBOARD='false'
  const useAgoraWhiteboard = process.env.NEXT_PUBLIC_USE_AGORA_WHITEBOARD !== 'false';
  console.log('[ClientClassroom] useAgoraWhiteboard:', useAgoraWhiteboard, 'NEXT_PUBLIC_USE_AGORA_WHITEBOARD:', process.env.NEXT_PUBLIC_USE_AGORA_WHITEBOARD);
  const agoraWhiteboardRef = useRef<AgoraWhiteboardRef>(null);
  const [agoraRoomData, setAgoraRoomData] = useState<{ uuid: string; roomToken: string; appIdentifier: string; region: string; userId: string } | null>(null);
  const [whiteboardState, setWhiteboardState] = useState<any>(null);
  
  // Poll whiteboard state for toolbar display
  // Reduced from 300ms to 1000ms since this is only used for UI display (tool buttons, page info)
  // not for real-time drawing synchronization (which happens via Agora WebSocket)
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        if (agoraWhiteboardRef.current) {
          const state = agoraWhiteboardRef.current.getState();
          if (state) setWhiteboardState(state);
        }
      } catch (e) {
        // Silently ignore errors during polling
      }
    }, 1000); // Poll every 1s - sufficient for UI updates, tool state tracking
    return () => clearInterval(interval);
  }, []); // Run continuously, not dependent on agoraRoomData
  
  // determine courseId from query string (e.g. ?courseId=c1)
  const course = COURSES.find((c) => c.id === courseId) || null;
  
  // Share classroom and media channel via explicit session param when available
  const effectiveChannelName = sessionParam || channelName || `classroom_session_ready_${courseId}`;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    console.log('[ClientClassroom] setMounted called');
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
  // Optimization: ensure unique IDs for multiple anonymous students to avoid cursor/sync collisions
  // Use a ref to keep the ID stable across re-renders for the same component instance
  const userIdRef = useRef<string | null>(null);
  const userId = useMemo(() => {
    if (userIdRef.current) return userIdRef.current;
    
    let id: string;
    if (storedUser?.email) {
      id = storedUser.email;
    } else {
      const base = (urlRole === 'teacher' || computedRole === 'teacher' ? 'teacher' : 'student');
      // For development/anonymous testing, append a small random string if no email is found
      // This allows multiple browser tabs to act as different users
      id = `${base}_${Math.random().toString(36).substring(7)}`;
    }
    userIdRef.current = id;
    return id;
  }, [storedUser?.email, urlRole, computedRole]);

  console.log('[ClientClassroom] userId calculation', { 
    storedUser: !!storedUser, 
    storedUserEmail: storedUser?.email ? '[REDACTED]' : undefined, 
    urlRole, 
    computedRole, 
    userId: '[REDACTED]' 
  });

  // Helper: read-only API call to fetch existing whiteboard uuid for a course or channel
  async function fetchExistingWhiteboardUuid(courseId?: string, channelName?: string) {
    try {
      const body = { courseId, channelName };
      const res = await fetch('/api/whiteboard/uuid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) return null;
      const j = await res.json();
      return j; // {found: true, uuid: '...'} or {found: false}
    } catch (e) {
      console.warn('[ClientClassroom] fetchExistingWhiteboardUuid failed:', e);
      return null;
    }
  }

  // Initialize Agora Whiteboard Room (if feature flag enabled)
  useEffect(() => {
    // Selection of logs to avoid spam
    if (!useAgoraWhiteboard || !mounted || !userId) return;

    // Guard: Prevent multiple initializations or initializing when not ready
    if (agoraRoomData) {
      // console.log('[ClientClassroom] Agora Whiteboard already initialized, skipping.');
      return;
    }

    const initAgoraWhiteboard = async () => {
      console.log('[ClientClassroom] initAgoraWhiteboard function called');
      try {
        const isTeacher = computedRole === 'teacher';
        
        if (isTeacher) {
          // === TEACHER: First lookup existing room via read-only endpoint, create only if not found ===
          console.log('[ClientClassroom] Teacher: Looking up existing whiteboard room (read-only)...');
          let teacherRoomData: any = null;

          try {
            const lookupJson = await fetchExistingWhiteboardUuid(courseId, sessionReadyKey);
            if (lookupJson?.uuid) {
              console.log('[ClientClassroom] Teacher found existing room uuid via read-only API');
              // Request full room credentials (roomToken, etc.) using the canonical uuid
              try {
                const tokenRes = await fetch('/api/whiteboard/room', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId, channelName: sessionReadyKey, courseId, roomUuid: lookupJson.uuid })
                });
                if (tokenRes.ok) {
                  teacherRoomData = await tokenRes.json();
                } else {
                  console.warn('[ClientClassroom] Teacher: failed to fetch room credentials for existing uuid');
                }
              } catch (e) {
                console.warn('[ClientClassroom] Teacher token fetch failed:', e);
              }
            } else if (lookupJson && lookupJson.found === false) {
              console.log('[ClientClassroom] Teacher: No existing room, will create new one');
            }
          } catch (e) {
            console.warn('[ClientClassroom] Teacher lookup failed, will try to create:', e);
          }
          
          // If no existing room found, create one
          if (!teacherRoomData) {
            console.log('[ClientClassroom] Teacher: Creating new whiteboard room...');
            const createBody: any = { userId, channelName: sessionReadyKey, courseId };
            
            try {
              const createRes = await fetch('/api/whiteboard/room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(createBody)
              });
              
              if (createRes.ok) {
                teacherRoomData = await createRes.json();
                console.log('[ClientClassroom] Teacher created new room');
              } else {
                const errorText = await createRes.text();
                console.error('[ClientClassroom] Teacher failed to create room:', createRes.status, errorText);
              }
            } catch (e) {
              console.error('[ClientClassroom] Teacher create API failed:', e);
            }
          }
          
          if (teacherRoomData) {
            setAgoraRoomData(teacherRoomData);
            
            // Broadcast uuid to student(s) via BroadcastChannel
            try {
              const bc = new BroadcastChannel(sessionReadyKey);
              bc.postMessage({
                type: 'whiteboard-uuid-sync',
                uuid: teacherRoomData.uuid,
                roomToken: teacherRoomData.roomToken,
                appIdentifier: teacherRoomData.appIdentifier,
                region: teacherRoomData.region,
                userId: teacherRoomData.userId
              });
              console.log('[ClientClassroom] Teacher broadcasted whiteboard uuid to channel');
              bc.close();
            } catch (bcErr) {
              console.warn('[ClientClassroom] BroadcastChannel failed (may not be supported):', bcErr);
            }
          }
        } else {
          // === STUDENT: Wait for teacher's broadcast, fallback to API if timeout ===
          console.log('[ClientClassroom] Student: Waiting for teacher to broadcast uuid (timeout: 10s)...');
          
          let receivedData: any = null;
          try {
            const bc = new BroadcastChannel(sessionReadyKey);
            receivedData = await new Promise<any>((resolve) => {
              const timer = setTimeout(() => {
                console.log('[ClientClassroom] Student broadcast timeout, will fallback to API');
                bc.close();
                resolve(null);
              }, 10000);
              
              bc.onmessage = (event) => {
                if (event.data?.type === 'whiteboard-uuid-sync') {
                  console.log('[ClientClassroom] Student received uuid from teacher via broadcast');
                  clearTimeout(timer);
                  bc.close();
                  resolve(event.data);
                }
              };
            });
          } catch (bcErr) {
            console.warn('[ClientClassroom] BroadcastChannel not available, fallback to API:', bcErr);
          }
          
          if (receivedData) {
            // Use teacher's room directly
            console.log('[ClientClassroom] Student using teacher\'s room uuid');
            setAgoraRoomData(receivedData);
          } else {
              // Fallback: poll for existing room with lookup-only to avoid creating duplicate
              console.log('[ClientClassroom] Student fallback: polling for existing room via lookupOnly...');
              let found = false;
              let lookupData: any = null;

              // Try multiple times to allow teacher's write to propagate using the read-only endpoint
              for (let i = 0; i < 8; i++) { // 8 * 500ms = 4s
                try {
                  const j = await fetchExistingWhiteboardUuid(courseId, sessionReadyKey);
                  if (j?.uuid) {
                    // Fetch full room credentials for the canonical uuid
                    try {
                      const tokenRes = await fetch('/api/whiteboard/room', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, channelName: sessionReadyKey, courseId, roomUuid: j.uuid })
                      });
                      if (tokenRes.ok) {
                        lookupData = await tokenRes.json();
                        found = true;
                        console.log(`[ClientClassroom] Student lookup attempt ${i + 1}: room found`);
                      } else {
                        console.warn(`[ClientClassroom] Student token fetch failed on attempt ${i + 1}`);
                      }
                    } catch (e) {
                      console.warn(`[ClientClassroom] Student token fetch error on attempt ${i + 1}:`, e);
                    }
                  } else if (j && j.found === false) {
                    console.log(`[ClientClassroom] Student lookup attempt ${i + 1}: room not found yet`);
                  }
                } catch (e) {
                  console.warn(`[ClientClassroom] Student lookup attempt ${i + 1} failed:`, e);
                }
                if (found) break;
                await new Promise(r => setTimeout(r, 500));
              }

              if (found && lookupData) {
                console.log('[ClientClassroom] Student found existing room via lookup, using it');
                setAgoraRoomData(lookupData);
              } else {
                // Still no room found after polling — create new room (teacher may be absent)
                console.log('[ClientClassroom] Student: no existing room found after polling, will create new room');
                const requestBody: any = { userId, channelName: sessionReadyKey, courseId };
                try {
                  const res = await fetch('/api/whiteboard/room', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                  });
                  if (res.ok) {
                    const data = await res.json();
                    console.log('[ClientClassroom] Student created new room via API');
                    setAgoraRoomData(data);
                  } else {
                    const errorText = await res.text();
                    console.error('[ClientClassroom] Student failed to create room:', res.status, errorText);
                  }
                } catch (e) {
                  console.error('[ClientClassroom] Student API create failed:', e);
                }
              }
          }
        }
      } catch (error) {
        console.error('[ClientClassroom] Error initializing Agora Whiteboard:', error);
      }
    };
    
    initAgoraWhiteboard();
  }, [useAgoraWhiteboard, mounted, userId, courseId, sessionReadyKey, computedRole]); // Added courseId back to dependencies for sync stability

  // Load PDF from server if available (synced from wait page)
  // ★ Improved: Clear old PDF when sessionReadyKey changes, then check for new one
  useEffect(() => {
    if (!mounted || !sessionReadyKey) {
      setSelectedPdf(null);
      setShowPdf(false);
      return;
    }
    
    const checkPdf = async () => {
      try {
        // Always use fresh cache-busting timestamp for each check
        const timestamp = Date.now();
        const resp = await fetch(`/api/whiteboard/pdf?uuid=${encodeURIComponent(sessionReadyKey)}&check=true&t=${timestamp}`);
        if (resp.ok) {
           const json = await resp.json();
           if (json.found) {
             console.log('[ClientClassroom] Found existing PDF for session:', sessionReadyKey);
             const fileResp = await fetch(`/api/whiteboard/pdf?uuid=${encodeURIComponent(sessionReadyKey)}&t=${timestamp}`);
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
               setSelectedPdf(null);
               setShowPdf(false);
             }
           } else {
             // No PDF found for this session
             console.log('[ClientClassroom] No PDF found for session:', sessionReadyKey);
             setSelectedPdf(null);
             setShowPdf(false);
           }
        } else {
          console.warn('[ClientClassroom] PDF check failed:', resp.status);
          setSelectedPdf(null);
          setShowPdf(false);
        }
      } catch (e) {
        console.warn('[ClientClassroom] Failed to check for PDF', e);
        setSelectedPdf(null);
        setShowPdf(false);
      }
    };
    
    checkPdf();
  }, [mounted, sessionReadyKey]);

  // ★★★ Auto-insert PDF into Agora Whiteboard when ready ★★★
  useEffect(() => {
    // Only proceed if we have a file, room data, and the whiteboard reference
    if (useAgoraWhiteboard && selectedPdf && agoraRoomData && agoraWhiteboardRef.current) {
         console.log('[ClientClassroom] Attempting to auto-insert PDF into Agora Whiteboard:', selectedPdf.name);
         
         const insert = async () => {
             try {
                // Since selectedPdf is a File object, we need to upload it or make it accessible.
                // However, based on the previous logic, we fetched it from /api/whiteboard/pdf.
                // We can use the URL we fetched from directly if we had it, but here we have the Blob/File.
                // Better approach: Use the URL we know works for the PDF API.
                
                // Construct the URL directly.  
                // NOTE: Fastboard usually expects a public URL or a conversion task result for PPTX.
                // For PDF, simple insertion might require a web-accessible URL or object URL.
                // If the backend /api/whiteboard/pdf streams the file, we can use that URL.
                const pdfUrl = `${window.location.origin}/api/whiteboard/pdf?uuid=${encodeURIComponent(sessionReadyKey)}&t=${Date.now()}`;
                
                console.log('[ClientClassroom] Inserting PDF via URL:', pdfUrl);
                await agoraWhiteboardRef.current?.insertPDF(pdfUrl, selectedPdf.name);
                console.log('[ClientClassroom] PDF inserted successfully');
                
                // Optional: Clear selection so we don't try to insert again? 
                // Alternatively, component logic inside insertPDF could prevent duplicate insertion.
                // For now, we leave it as is, or we could set a flag "inserted".
             } catch (e) {
                 console.error('[ClientClassroom] Failed to insert PDF:', e);
             }
         };
         
         // Give a small delay to ensure the board is fully initialized inside the ref
         setTimeout(insert, 2000);
    }
  }, [useAgoraWhiteboard, selectedPdf, agoraRoomData, sessionReadyKey]);

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
      useAgoraWhiteboard,
      hasAgoraRoomData: !!agoraRoomData,
      hasWhiteboardRef: !!whiteboardRef,
      whiteboardMeta,
      joined
    });
    
    // 為 E2E 測試暴露狀態
    if (typeof window !== 'undefined') {
      (window as any).__classroom_joined = joined;
      (window as any).__classroom_whiteboard_ready = useAgoraWhiteboard ? !!agoraRoomData : !!whiteboardMeta;
      (window as any).__classroom_ready = joined && (useAgoraWhiteboard ? !!agoraRoomData : !!whiteboardMeta);
    }
  }, [whiteboardRef, whiteboardMeta, joined, useAgoraWhiteboard, agoraRoomData]);

  // 跨标签页同步：老師開始上課時通知學生
  useEffect(() => {
    // Use the shared session identifier (same as waiting page) so messages are received across pages
    const sessionBroadcastName = sessionParam || channelName || `classroom_session_ready_${courseId}`;
    console.log('ClientClassroom broadcast channel:', sessionBroadcastName);
    const bc = new BroadcastChannel(sessionBroadcastName);
    
    bc.onmessage = (event) => {
      console.log('[BroadcastChannel] Received message:', event.data);
      // Support clearing whiteboard when another participant requests it
      if (event.data?.type === 'whiteboard_clear') {
        console.log('[BroadcastChannel] Received whiteboard_clear -> clearing local PDF/whiteboard');
        try {
          if (useAgoraWhiteboard) {
            // Prefer clearing PDF content specifically when available
            try { agoraWhiteboardRef.current?.clearPDF(); } catch (e) { /* fallback */ }
            // Also clear drawings on current scene
            try { agoraWhiteboardRef.current?.clearScene(); } catch (e) { /* ignore */ }
          } else {
            // Post to the canvas BroadcastChannel so EnhancedWhiteboard instances will clear
            try {
              const ch = new BroadcastChannel(`whiteboard_${sessionReadyKey}`);
              ch.postMessage({ type: 'clear' });
              ch.close();
            } catch (e) { /* ignore BC errors */ }
          }
        } catch (e) { console.warn('whiteboard_clear handler failed', e); }
        return;
      }

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
      
      // Clean up whiteboard room
      if (useAgoraWhiteboard && agoraRoomData?.uuid) {
        try {
          await fetch('/api/whiteboard/room', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid: agoraRoomData.uuid }),
            keepalive: true,
          });
        } catch (e) { console.warn('Agora whiteboard cleanup failed (ignored)', e); }
      } else if (whiteboardMeta?.uuid) {
        try {
          await fetch('/api/agora/whiteboard/close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid: whiteboardMeta.uuid }),
            keepalive: true,
          });
        } catch (e) { console.warn('canvas whiteboard close request failed (ignored)', e); }
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
              // time's up -> clear whiteboard for both sides, then end session
              console.log('時間到！廣播清空白板並在本地清空');
              try {
                // Broadcast a session-level message so other tabs can respond
                const sessionBroadcastName = sessionParam || channelName || `classroom_session_ready_${courseId}`;
                try {
                  const bc2 = new BroadcastChannel(sessionBroadcastName);
                  bc2.postMessage({ type: 'whiteboard_clear', timestamp: Date.now() });
                  setTimeout(() => { try { bc2.close(); } catch (e) {} }, 50);
                } catch (e) { /* ignore BC failures */ }

                // Also post to the per-whiteboard BroadcastChannel used by EnhancedWhiteboard
                try {
                  const ch = new BroadcastChannel(`whiteboard_${sessionReadyKey}`);
                  ch.postMessage({ type: 'clear' });
                  setTimeout(() => { try { ch.close(); } catch (e) {} }, 50);
                } catch (e) {}

                // Locally clear Agora whiteboard if present
                try { if (useAgoraWhiteboard) agoraWhiteboardRef.current?.clearScene(); } catch (e) {}
              } catch (e) { console.warn('Failed to broadcast/clear whiteboard on timeout', e); }

              try { if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; } } catch (e) {}
              // after short delay, trigger endSession to leave and cleanup
              setTimeout(() => { try { endSession(); } catch (e) { console.warn('endSession failed', e); } }, 800);
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
  
  // Helper functions for color checking
  const isColorActive = (c: number[]) => {
    if (!whiteboardState?.activeColor) return false;
    const active = whiteboardState.activeColor;
    return active[0] === c[0] && active[1] === c[1] && active[2] === c[2];
  };

  return (
    <>
      {/* Status Bar - Above everything */}
      {useAgoraWhiteboard && agoraRoomData && whiteboardState && (
        <div style={{ background: 'rgba(0,0,0,0.7)', color: 'white', fontSize: '11px', padding: '4px 12px', textAlign: 'center' }}>
          <span style={{ color: isTeacher ? '#4ade80' : '#fbbf24', fontWeight: 'bold' }}>{isTeacher ? 'TEACHER' : 'STUDENT'}</span> | {agoraRoomData.region} | {whiteboardState.phase} | {whiteboardState.viewMode} | Course: {courseId} | UUID: {agoraRoomData.uuid}
        </div>
      )}
      
      {/* Teacher Toolbar - Below status bar */}
      {useAgoraWhiteboard && isTeacher && agoraWhiteboardRef.current && whiteboardState && (
        <div style={{ padding: '8px 0', display: 'flex', justifyContent: 'center', background: '#f8f9fa', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'row',
            alignItems: 'center',
            gap: '8px', 
            padding: '8px 16px', 
            backgroundColor: '#ffffff', 
            borderRadius: '12px', 
            boxShadow: '0 4px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingRight: '8px', borderRight: '2px solid #f3f4f6' }}>
              <ToolButton active={whiteboardState.activeTool === 'pencil'} onClick={() => agoraWhiteboardRef.current?.setTool('pencil')} icon="✏️" title="畫筆" />
              <ToolButton active={whiteboardState.activeTool === 'eraser'} onClick={() => agoraWhiteboardRef.current?.setTool('eraser')} icon="🧹" title="橡皮擦" />
              <ToolButton active={whiteboardState.activeTool === 'selector'} onClick={() => agoraWhiteboardRef.current?.setTool('selector')} icon="✋" title="移動畫布" />
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingRight: '8px', borderRight: '2px solid #f3f4f6' }}>
              <ColorDot color="#DC2626" active={isColorActive([220, 38, 38])} onClick={() => agoraWhiteboardRef.current?.setColor([220, 38, 38])} />
              <ColorDot color="#2563EB" active={isColorActive([37, 99, 235])} onClick={() => agoraWhiteboardRef.current?.setColor([37, 99, 235])} />
              <ColorDot color="#000000" active={isColorActive([0, 0, 0])} onClick={() => agoraWhiteboardRef.current?.setColor([0, 0, 0])} />
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ToolButton active={false} onClick={() => agoraWhiteboardRef.current?.clearScene()} icon="🗑️" title="清空畫布" />
              <ToolButton active={false} onClick={() => agoraWhiteboardRef.current?.forceFix()} icon="🎯" title="重置視角" />
            </div>

            {whiteboardState.totalPages > 1 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingLeft: '8px', borderLeft: '2px solid #f3f4f6' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', whiteSpace: 'nowrap' }}>
                  {whiteboardState.currentPage} / {whiteboardState.totalPages}
                </span>
                <button onClick={() => agoraWhiteboardRef.current?.prevPage()} title="上一頁" disabled={whiteboardState.currentPage <= 1} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', background: whiteboardState.currentPage <= 1 ? '#f1f5f9' : 'white', cursor: whiteboardState.currentPage <= 1 ? 'not-allowed' : 'pointer', fontSize: '14px' }}>
                  ◀️
                </button>
                <button onClick={() => agoraWhiteboardRef.current?.nextPage()} title="下一頁" disabled={whiteboardState.currentPage >= whiteboardState.totalPages} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', background: whiteboardState.currentPage >= whiteboardState.totalPages ? '#f1f5f9' : 'white', cursor: whiteboardState.currentPage >= whiteboardState.totalPages ? 'not-allowed' : 'pointer', fontSize: '14px' }}>
                  ▶️
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      
    <div className="client-classroom">
      {/* Left: Whiteboard (flexible) */}
      <div className="client-left" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
        <div className="client-left-inner" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12 }}>
                {remainingSeconds !== null && (
                  <div style={{ color: 'red', fontWeight: 600 }}>{Math.floor((remainingSeconds || 0) / 60)}:{String((remainingSeconds || 0) % 60).padStart(2, '0')}</div>
                )}
              </div>
          </div>
          <div className="whiteboard-container" style={{ width: '100%', flex: 1, position: 'relative', minHeight: '500px', isolation: 'isolate' }}>
            {useAgoraWhiteboard ? (
              agoraRoomData ? (
                <AgoraWhiteboard
                  key={agoraRoomData.uuid}
                  ref={agoraWhiteboardRef}
                  roomUuid={agoraRoomData.uuid}
                  roomToken={agoraRoomData.roomToken}
                  appIdentifier={agoraRoomData.appIdentifier}
                  userId={agoraRoomData.userId}
                  region={agoraRoomData.region}
                  courseId={courseId}
                  className="w-full h-full"

                  // ★★★ 關鍵修復：必須明確傳入 role ★★★
                  role={(urlRole === 'teacher' || computedRole === 'teacher') ? 'teacher' : 'student'}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-50">
                  <div className="text-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-blue-600 mx-auto mb-2" />
                    <div className="text-sm text-slate-600">初始化白板中...</div>
                  </div>
                </div>
              )
            ) : (
              // Legacy whiteboard fallback - rendered only if Agora is disabled
              <EnhancedWhiteboard 
                channelName={effectiveChannelName}
                room={undefined} 
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
            <video ref={localVideoRef} autoPlay muted playsInline style={{ transform: 'scaleX(-1)' }} />
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
    </>
  );
};

// Helper components for toolbar
const ToolButton = ({ active, onClick, icon, title }: any) => {
    const [isPressed, setIsPressed] = React.useState(false);
    const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    const press = () => {
        setIsPressed(true);
    };

    const release = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setIsPressed(false);
        }, 300);
    };
    
    // Explicit click handler to ensure feedback even if mouse events are messy
    const handleClick = (e: any) => {
        // Force press state visually
        setIsPressed(true);
        // Execute actual action
        if (onClick) onClick(e);
        // Schedule release
        release();
    };

    return (
        <button 
            onClick={handleClick}
            onMouseDown={press}
            onMouseUp={release}
            onMouseLeave={release}
            onTouchStart={press}
            onTouchEnd={release}
            title={title}
            style={{ 
                padding: '10px', 
                borderRadius: '12px', 
                background: (active || isPressed) ? '#eff6ff' : 'transparent', 
                border: (active || isPressed) ? '2px solid #000000' : '2px solid transparent', 
                cursor: 'pointer', 
                fontSize: '22px',
                transition: 'all 0.1s ease', // Faster transition for snappier feel
                filter: (active || isPressed) ? 'none' : 'grayscale(100%)',
                opacity: (active || isPressed) ? 1 : 0.5,
                boxShadow: (active || isPressed) ? '0 2px 5px rgba(0, 0, 0, 0.15)' : 'none',
                transform: isPressed ? 'scale(0.95)' : 'scale(1)'
            }}
        >
            {icon}
        </button>
    );
};

const ColorDot = ({ color, active, onClick }: any) => (
    <div 
        onClick={onClick} 
        style={{ 
            width: '28px', 
            height: '28px', 
            borderRadius: '50%', 
            backgroundColor: color,
            border: active ? '3px solid #000000' : '2px solid #d1d5db', 
            boxShadow: active ? '0 0 0 2px white inset, 0 2px 6px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            transform: active ? 'scale(1.15)' : 'scale(1)',
            opacity: active ? 1 : 0.7
        }} 
    />
);

export default ClientClassroom;

'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
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
  const params = useSearchParams();
  const courseId = params?.get('courseId') ?? params?.get('courseid') ?? 'c1';
  const orderId = params?.get('orderId') ?? params?.get('orderid') ?? null;
  const sessionParam = params?.get('session');
  const sessionReadyKey = useMemo(() =>
    sessionParam || channelName || `classroom_session_ready_${courseId}`,
    [sessionParam, channelName, courseId]
  );
  const t = useT();

  const [courseTitle, setCourseTitle] = useState('課程');

  // Fetch course title from API
  useEffect(() => {
    if (!courseId) return;
    fetch(`/api/courses/${encodeURIComponent(courseId)}`)
      .then(r => r.json())
      .then(j => {
        if (j.ok && j.course?.title) {
          setCourseTitle(j.course.title);
        } else {
          // Fallback to bundled data
          const b = COURSES.find(c => c.id === courseId);
          if (b?.title) setCourseTitle(b.title);
        }
      })
      .catch(() => {
        // Safe fallback
        const b = COURSES.find(c => c.id === courseId);
        if (b?.title) setCourseTitle(b.title);
      });
  }, [courseId]);

  // ★ Helper function to get user display name based on login info
  const getDisplayName = (user: any, role?: 'teacher' | 'student', suffix?: string): string => {
    if (!user) {
      // 如果没有用户信息，根据角色显示
      if (suffix === 'you') {
        return role === 'teacher' ? `${t('teacher')} (你)` : `${t('student')} (你)`;
      }
      return role === 'teacher' ? t('teacher') : t('student');
    }

    // 优先级：lastName + firstName → displayName → role
    const fullName = `${user.lastName || ''} ${user.firstName || ''}`.trim();
    if (fullName) return fullName;
    if (user.displayName) return user.displayName;

    // Fallback to role
    if (suffix === 'you') {
      return role === 'teacher' ? `${t('teacher')} (你)` : `${t('student')} (你)`;
    }
    return role === 'teacher' ? t('teacher') : t('student');
  };

  // Feature Flag: Agora Whiteboard vs Canvas Whiteboard
  // Default to using Agora whiteboard unless explicitly disabled with NEXT_PUBLIC_USE_AGORA_WHITEBOARD='false'
  const useAgoraWhiteboard = process.env.NEXT_PUBLIC_USE_AGORA_WHITEBOARD !== 'false';

  const agoraWhiteboardRef = useRef<AgoraWhiteboardRef>(null);
  const [agoraRoomData, setAgoraRoomData] = useState<{ uuid: string; roomToken: string; appIdentifier: string; region: string; userId: string } | null>(null);
  const [whiteboardState, setWhiteboardState] = useState<any>(null);
  const [whiteboardError, setWhiteboardError] = useState<string | null>(null);
  const [joinAttemptCount, setJoinAttemptCount] = useState(0);
  const lastJoinTimeRef = useRef<number>(0);

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
  const [isRoleOccupied, setIsRoleOccupied] = useState(false);
  const endTsRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    console.log('[ClientClassroom] setMounted called');
  }, []);

  // Track mobile viewport to adjust whiteboard container height for small screens
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const check = () => setIsMobileViewport(window.innerWidth <= 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // When viewport changes (mobile <-> desktop) or orientation changes, nudge whiteboard to recalc layout
  useEffect(() => {
    if (!agoraWhiteboardRef.current) return;
    // give layout a moment to settle
    const id = window.setTimeout(() => {
      try {
        // forceFix is exposed by BoardImpl to reset camera/viewport
        agoraWhiteboardRef.current?.forceFix();
      } catch (e) {
        console.warn('[ClientClassroom] forceFix failed', e);
      }
    }, 250);
    // call again after keyboard/toolbar animations
    const id2 = window.setTimeout(() => {
      try { agoraWhiteboardRef.current?.forceFix(); } catch (e) { }
    }, 900);
    return () => { try { window.clearTimeout(id); window.clearTimeout(id2); } catch (e) { } };
  }, [isMobileViewport]);

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

  const agoraConfig = useMemo(() => ({
    channelName: effectiveChannelName,
    role: (urlRole === 'teacher' || urlRole === 'student') ? (urlRole as Role) : computedRole,
    isOneOnOne: true, // 启用1对1优化
    defaultQuality: 'high' as const // 默认高质量
  }), [effectiveChannelName, urlRole, computedRole]);

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
  } = useAgoraClassroom(agoraConfig);

  useEffect(() => {
    if (isRoleOccupied && joined && typeof leave === 'function') {
      console.warn('[ClientClassroom] Role occupied by another connection! Leaving Agora to prevent ghost connections.');
      leave();
    }
  }, [isRoleOccupied, joined, leave]);

  const isTeacher = (urlRole === 'teacher' || computedRole === 'teacher');

  const isTestPath = typeof window !== 'undefined' && window.location.pathname === '/classroom/test';

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

  const [isEnding, setIsEnding] = useState(false);

  // Create a unique per-tab ID to distinguish multiple tabs opened by the same logged-in user
  const tabId = useMemo(() => {
    if (typeof window === 'undefined') return 'ssr';
    let id = sessionStorage.getItem('classroom_tab_id');
    if (!id) {
      id = Math.random().toString(36).substring(2, 10);
      sessionStorage.setItem('classroom_tab_id', id);
    }
    return id;
  }, []);

  const userId = useMemo(() => {
    if (userIdRef.current) return userIdRef.current;

    let id: string;
    if (storedUser?.email) {
      // tabId suffix ensures unique cursor identity in Agora whiteboard when same user opens multiple tabs
      id = `${storedUser.email}_${tabId}`;
    } else {
      const base = (urlRole === 'teacher' || computedRole === 'teacher' ? 'teacher' : 'student');
      id = `${base}_${tabId}`;
    }
    userIdRef.current = id;
    return id;
  }, [storedUser?.email, urlRole, computedRole, tabId]);

  // presenceId: plain identity (no tabId) used for the classroom ready/presence API
  // Must match what the wait page writes so isRoleTaken works correctly
  const presenceId = useMemo(() => {
    return storedUser?.email || null;
  }, [storedUser?.email]);

  const firstRemote = useMemo(() => {
    if (!remoteUsers || remoteUsers.length === 0) return null;
    // Prefer a remote user whose uid does not match the local user identifier
    const localId = storedUser?.email || userId || null;
    const others = remoteUsers.filter((u: any) => String(u.uid) !== String(localId));
    // Use the last joined user (to match the video that actually plays)
    return others.length > 0 ? others[others.length - 1] : remoteUsers[remoteUsers.length - 1];
  }, [remoteUsers, storedUser?.email, userId]);

  // Remote name resolution for test path: cache + single fetch per uid
  const [remoteName, setRemoteName] = useState<string | null>(null);
  const remoteNameCacheRef = useRef<Record<string, string>>({});
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isTestPath = window.location.pathname === '/classroom/test';
    const r = firstRemote;
    if (!r) {
      setRemoteName(null);
      return;
    }

    // In Agora, uid is just a number (e.g. 1 or 1234). It's NOT an email!
    // Try to look up the participant's real email/identity from localStorage's sync
    try {
      const raw = localStorage.getItem(sessionReadyKey);
      if (raw) {
        const arr = JSON.parse(raw) as Array<any>;
        const oppositeRole = isTeacher ? 'student' : 'teacher';
        const oppositeUser = arr.find(p => p.role === oppositeRole && p.present);

        if (oppositeUser) {
          const idToFetch = oppositeUser.email || oppositeUser.userId;
          if (idToFetch && idToFetch.includes('@')) {
            const cleanEmail = idToFetch.split('_')[0]; // Remove tab ID suffix if present
            if (remoteNameCacheRef.current[cleanEmail]) {
              setRemoteName(remoteNameCacheRef.current[cleanEmail]);
              return;
            }
            fetch(`/api/profile?email=${encodeURIComponent(cleanEmail)}`)
              .then(res => res.ok ? res.json() : null)
              .then(j => {
                const name = j?.profile ? `${j.profile.lastName || ''} ${j.profile.firstName || ''}`.trim() || j.profile.nickname || cleanEmail : cleanEmail;
                remoteNameCacheRef.current[cleanEmail] = name;
                setRemoteName(name);
              }).catch(() => {
                remoteNameCacheRef.current[cleanEmail] = cleanEmail;
                setRemoteName(cleanEmail);
              });
            return;
          } else {
            // Anonymous or random string
            setRemoteName(oppositeUser.userId || oppositeRole);
            return;
          }
        }
      }
    } catch (e) { }

    // Fallback if nothing found
    setRemoteName(isTeacher ? 'Student' : 'Teacher');
  }, [firstRemote, isTeacher, sessionReadyKey]);

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
        const finalRole = (urlRole === 'teacher' || urlRole === 'student') ? (urlRole as Role) : computedRole;
        const isTeacher = finalRole === 'teacher';

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
                  body: JSON.stringify({ userId, channelName: sessionReadyKey, courseId, orderId, roomUuid: lookupJson.uuid })
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
            const createBody: any = { userId, channelName: sessionReadyKey, courseId, orderId };

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
                      body: JSON.stringify({ userId, channelName: sessionReadyKey, courseId, orderId, roomUuid: j.uuid })
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
              const requestBody: any = { userId, channelName: sessionReadyKey, courseId, orderId };
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
                  if (process.env.NODE_ENV !== 'production') {
                    try {
                      const errorData = JSON.parse(errorText);
                      setWhiteboardError(errorData.error || errorData.message || 'Failed to create whiteboard room');
                    } catch {
                      setWhiteboardError(`Failed to create whiteboard room: ${errorText}`);
                    }
                  }
                }
              } catch (e) {
                console.error('[ClientClassroom] Student API create failed:', e);
                if (process.env.NODE_ENV !== 'production') {
                  setWhiteboardError(`Failed to create whiteboard room: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('[ClientClassroom] Error initializing Agora Whiteboard:', error);
        if (process.env.NODE_ENV !== 'production') {
          setWhiteboardError(`Failed to initialize whiteboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
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

    const fetchPdfForSession = async () => {
      const maxRetries = 8;
      // Initial delay to give DynamoDB time to sync from upload
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('[ClientClassroom] === PDF FETCH START ===');
      console.log('[ClientClassroom] Session Key:', sessionReadyKey);
      console.log('[ClientClassroom] Course ID:', courseId);
      console.log('[ClientClassroom] Is Test Path:', isTestPath);

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout per request
        try {
          const retryDelay = Math.min(500 * Math.pow(1.5, attempt - 1), 3000);
          const timestamp = Date.now();
          console.log(`[ClientClassroom] Checking for PDF metadata (attempt ${attempt}/${maxRetries})... UUID: ${sessionReadyKey}`);

          const resp = await fetch(`/api/whiteboard/pdf?uuid=${encodeURIComponent(sessionReadyKey)}&check=true&t=${timestamp}`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!resp.ok) {
            console.warn(`[ClientClassroom] PDF metadata check failed (attempt ${attempt}/${maxRetries}): status ${resp.status}`);
            if (attempt === maxRetries) {
              console.error('[ClientClassroom] Max retries reached for PDF metadata');
              return;
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }

          const json = await resp.json();
          if (!json.found) {
            // It's normal for a room to not have a PDF
            if (attempt === maxRetries) {
              console.info('[ClientClassroom] No PDF found after all retries (which is normal if no PDF was uploaded)');
              setSelectedPdf(null);
              setShowPdf(false);
              return;
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }

          console.log('[ClientClassroom] ✓ PDF metadata found!', json.meta);

          // Now fetch the actual file
          const fileTimeoutId = setTimeout(() => controller.abort(), 20000); // longer timeout for file download
          const fileResp = await fetch(`/api/whiteboard/pdf?uuid=${encodeURIComponent(sessionReadyKey)}&t=${timestamp}`, {
            signal: controller.signal
          });
          clearTimeout(fileTimeoutId);

          if (!fileResp.ok) {
            console.error('[ClientClassroom] PDF file download failed:', fileResp.status);
            return;
          }

          const blob = await fileResp.blob();
          const fileName = json.meta?.name || 'course.pdf';
          const fileType = json.meta?.type || 'application/pdf';
          const file = new File([blob], fileName, { type: fileType });

          console.log('[ClientClassroom] ✓ PDF loaded successfully:', fileName, 'size:', blob.size);
          setSelectedPdf(file);
          setShowPdf(true);
          return; // Success!

        } catch (e: any) {
          clearTimeout(timeoutId);
          const isAbort = e.name === 'AbortError';
          // Downgrade warning since it's normal to not find a PDF immediately
          if (attempt === maxRetries) {
            console.log('[ClientClassroom] Stopped polling for PDF (none found or network error).');
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    };

    fetchPdfForSession();

    // Subscribe to server-sent events to react to PDF uploads while inside classroom
    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/whiteboard/stream?uuid=${encodeURIComponent(sessionReadyKey)}`);
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data || '{}');
          if (data?.type === 'pdf-uploaded' || data?.type === 'pdf-set') {
            console.log('[ClientClassroom] Received pdf-upload event, refetching PDF for session');
            fetchPdfForSession();
          } else if (data?.type === 'class_ended') {
            console.log('[ClientClassroom] Received class_ended via SSE, exiting...');
            handleLeave();
          }
        } catch (e) { /* ignore parse errors */ }
      };
      es.onerror = (err) => {
        try { es?.close(); } catch (e) { }
        es = null;
      };
    } catch (e) {
      es = null;
    }

    return () => {
      try { if (es) es.close(); } catch (e) { }
    };
  }, [mounted, sessionReadyKey]);

  // Track if PDF has been auto-inserted to avoid duplicates
  const pdfInsertedRef = useRef<string | null>(null);

  // ★★★ Auto-insert PDF into Agora Whiteboard when ready ★★★
  useEffect(() => {
    // Only proceed if we are a teacher, have a file, room data, and the whiteboard reference
    if (isTeacher && useAgoraWhiteboard && selectedPdf && agoraRoomData && agoraWhiteboardRef.current) {
      // Avoid double insertion if same PDF and same session
      const pdfIdentifier = `${sessionReadyKey}_${selectedPdf.name}_${selectedPdf.size}`;
      if (pdfInsertedRef.current === pdfIdentifier) return;

      console.log('[ClientClassroom] PDF auto-insert condition met:', selectedPdf.name);

      const insert = async () => {
        // Second check inside async to handle race conditions
        if (!agoraWhiteboardRef.current || pdfInsertedRef.current === pdfIdentifier) return;

        try {
          const pdfUrl = `${window.location.origin}/api/whiteboard/pdf?uuid=${encodeURIComponent(sessionReadyKey)}&t=${Date.now()}`;

          console.log('[ClientClassroom] Attempting to auto-insert PDF:', selectedPdf.name, 'URL:', pdfUrl);
          await agoraWhiteboardRef.current.insertPDF(pdfUrl, selectedPdf.name);
          console.log('[ClientClassroom] PDF auto-insert request sent');
          pdfInsertedRef.current = pdfIdentifier;
        } catch (e) {
          console.error('[ClientClassroom] Failed to auto-insert PDF:', e);
        }
      };

      // Give board time to connect and become writable
      const timer = setTimeout(insert, 3000);
      return () => clearTimeout(timer);
    }
  }, [useAgoraWhiteboard, selectedPdf, agoraRoomData, sessionReadyKey, isTeacher]);

  // session countdown - default to 5 minutes
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState<number>(5); // 5 minutes
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const remainingSecondsRef = useRef<number | null>(null);
  useEffect(() => {
    remainingSecondsRef.current = remainingSeconds;
  }, [remainingSeconds]);

  const [orderRemainingSeconds, setOrderRemainingSeconds] = useState<number | null>(null);
  const [orderFetchComplete, setOrderFetchComplete] = useState<boolean>(false);

  // Fetch order remainingSeconds for authoritative timer duration
  useEffect(() => {
    const fetchOrderTime = async () => {
      try {
        if (orderId) {
          // If we have an explicit orderId, fetch that specific order
          const r = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
          const j = await r.json();
          if (j.ok && j.order) {
            let sec = null;
            if (typeof j.order.remainingSeconds === 'number') {
              sec = j.order.remainingSeconds;
            } else if (typeof j.order.durationMinutes === 'number') {
              sec = j.order.durationMinutes * 60;
            }
            if (sec !== null) {
              console.log('[ClientClassroom] Order remainingSeconds fetched by orderId:', sec);
              setOrderRemainingSeconds(sec);
              setSessionDurationMinutes(Math.ceil(sec / 60));
            }
          }
        } else if (courseId) {
          // Fallback: fetch recent active order by courseId
          // If the user is a student, we filter by userId to get their specific order.
          // If the user is a teacher (testing or entering without orderId), we retrieve the latest order for the course.
          let queryUrl = `/api/orders?courseId=${encodeURIComponent(courseId)}`;
          if (storedUser?.role === 'user' && storedUser?.email) {
            queryUrl += `&userId=${encodeURIComponent(storedUser.email)}`;
          }

          const r = await fetch(queryUrl);
          const j = await r.json();
          if (j.ok && j.data && j.data.length > 0) {
            // Sort to ensure we get the most recent order for this course
            const sortedOrders = j.data.sort((a: any, b: any) => {
              const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return timeB - timeA;
            });
            const activeOrder = sortedOrders[0];

            let sec = null;
            if (typeof activeOrder.remainingSeconds === 'number') {
              sec = activeOrder.remainingSeconds;
            } else if (typeof activeOrder.durationMinutes === 'number') {
              sec = activeOrder.durationMinutes * 60;
            }

            if (sec !== null) {
              console.log('[ClientClassroom] Order remainingSeconds fetched by courseId:', sec);
              setOrderRemainingSeconds(sec);
              setSessionDurationMinutes(Math.ceil(sec / 60));
            }
          }
        }
      } catch (e) {
        console.warn('[ClientClassroom] failed to fetch order seconds', e);
      } finally {
        setOrderFetchComplete(true);
      }
    };

    fetchOrderTime();
  }, [orderId, courseId, storedUser?.email]);

  const timerRef = useRef<number | null>(null);
  // Delay before countdown starts (5 seconds)
  const INITIAL_COUNTDOWN_DELAY_MS = 5 * 1000;
  const [fullyInitialized, setFullyInitialized] = useState(false);
  const [classFullyLoadedAt, setClassFullyLoadedAt] = useState<number | null>(null);
  const [bootSteps, setBootSteps] = useState<Array<{ name: string; done: boolean }>>([
    { name: 'Initializing Agora connection', done: false },
    { name: 'Preparing whiteboard', done: false },
    { name: 'Syncing session state', done: false },
  ]);

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
      console.log('[ClientClassroom] Restoring saved devices from localStorage:', { audio: sa, video: sv });
      if (sa) setSelectedAudioDeviceId(sa);
      if (sv) setSelectedVideoDeviceId(sv);
    } catch (e) {
      console.warn('[ClientClassroom] Failed to restore device selections:', e);
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save device selections to localStorage when they change
  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !selectedAudioDeviceId || !selectedVideoDeviceId) return;
      console.log('[ClientClassroom] Saving device selections to localStorage:', { audio: selectedAudioDeviceId, video: selectedVideoDeviceId });
      window.localStorage.setItem('tutor_selected_audio', selectedAudioDeviceId);
      window.localStorage.setItem('tutor_selected_video', selectedVideoDeviceId);
    } catch (e) {
      console.warn('[ClientClassroom] Failed to save device selections:', e);
    }
  }, [selectedAudioDeviceId, selectedVideoDeviceId]);

  // (Auto-join logic removed to prevent INVALID_OPERATION AgoraRTCError: Client already in connecting/connected state)

  // pre-join waiting / readiness state (require same course + order)
  const [ready, setReady] = useState(false);
  const [canJoin, setCanJoin] = useState(false);
  // Prevent duplicate tabs logic removed
  // State variables kept for now to avoid extensive refactoring, but they do nothing
  const [duplicateDetected, setDuplicateDetected] = useState(false);
  const [duplicateOverride, setDuplicateOverride] = useState(false);

  // Camera preview and mic test
  const previewStreamRef = useRef<MediaStream | null>(null);
  const [previewingCamera, setPreviewingCamera] = useState(false);
  const [testingMic, setTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const [penColor, setPenColor] = useState<string>('#000000');

  // Debug modals for test path (start minimized)
  // Only visible when URL contains ?debugMode=1 (engineers only, hidden from teachers/students)
  const isDevMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugMode') === '1';
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [showControlModal, setShowControlModal] = useState(false);

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

  // Track boot step progress: update when agoraRoomData or whiteboardMeta become available
  useEffect(() => {
    // Only update if state actually changed to avoid infinite loops
    setBootSteps((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        let done = s.done;
        if (s.name === 'Initializing Agora connection') {
          done = !!agoraRoomData;
        } else if (s.name === 'Preparing whiteboard') {
          done = useAgoraWhiteboard ? !!agoraRoomData && !!agoraWhiteboardRef.current : !!whiteboardMeta;
        } else if (s.name === 'Syncing session state') {
          done = !!sessionReadyKey;
        }

        if (done !== s.done) {
          changed = true;
          return { ...s, done };
        }
        return s;
      });

      return changed ? next : prev;
    });

    const agoraReady = useAgoraWhiteboard ? !!agoraRoomData && !!agoraWhiteboardRef.current : !!whiteboardMeta;
    const allDone = agoraReady && !!sessionReadyKey;
    if (allDone && joined && !fullyInitialized) {
      setFullyInitialized(true);
      setClassFullyLoadedAt(Date.now());
      console.log('[ClientClassroom] Fully initialized at', Date.now());
    }
    if (!allDone && fullyInitialized) {
      setFullyInitialized(false);
      setClassFullyLoadedAt(null);
    }
  }, [agoraRoomData, whiteboardMeta, sessionReadyKey, joined, whiteboardState]);

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
      // ⚠️ IMPORTANT: This should ONLY be triggered by:
      //   1. Countdown timer completion (倒計時結束)
      //   2. Manual clear canvas button (手動清除)
      // ❌ DO NOT trigger this when teacher joins or any other event
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
          } catch (e) { }
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
      try { bc.close(); } catch (e) { }
    };
  }, [courseId, orderId, joined, loading, micEnabled, wantPublishVideo, join, sessionParam, channelName]);

  // 🚀 自動加入/恢復機制 (Auto-join / Re-join)
  // 處理學生自動進入已開始的課堂，以及老師重新整理頁面後恢復通話
  useEffect(() => {
    if (!mounted || joined || loading || !sessionReadyKey || isEnding) return;

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
          if (joinAttemptCount >= 3) {
            console.warn('[AutoJoin] Too many failures, stopping auto-join for 10s');
            // Reset count after 10s to allow manual retry or delayed retry
            setTimeout(() => setJoinAttemptCount(0), 10000);
            return;
          }

          if (isRoleOccupied) {
            console.log('[AutoJoin] Aborting auto-join because role is occupied');
            return;
          }

          const now = Date.now();
          if (now - lastJoinTimeRef.current < 5000) return; // Throttle joins to every 5s
          lastJoinTimeRef.current = now;

          console.log(`[AutoJoin] ${roleName} 檢測到進行中會話，正在自動加入... (Attempt ${joinAttemptCount + 1})`);
          setJoinAttemptCount(prev => prev + 1);
          join({
            publishAudio: micEnabled,
            publishVideo: wantPublishVideo,
            audioDeviceId: selectedAudioDeviceId ?? undefined,
            videoDeviceId: selectedVideoDeviceId ?? undefined
          });
          return;
        }

        // 2. 只有當雙方都在教室內 (canJoin=true 或 qResp 返回雙方都 present) 才觸發啟動
        if (!isRoleOccupied && (canJoin || bothPresent || forceJoin)) {
          if (joinAttemptCount >= 3) {
            console.warn('[AutoJoin] Too many failures, stopping auto-join for 10s');
            setTimeout(() => setJoinAttemptCount(0), 10000);
            return;
          }

          const now = Date.now();
          if (now - lastJoinTimeRef.current < 3000) return;
          lastJoinTimeRef.current = now;

          if ((bothPresent && !canJoin) || forceJoin) setCanJoin(true);
          console.log(`[AutoJoin] Attempting auto-join...`, {
            roleName,
            attempt: joinAttemptCount + 1,
            publishAudio: micEnabled,
            publishVideo: wantPublishVideo,
            audioDeviceId: selectedAudioDeviceId,
            videoDeviceId: selectedVideoDeviceId
          });
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
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          console.warn('[ClientClassroom] mediaDevices.enumerateDevices not available');
          return;
        }
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!mountedFlag) return;
        const ais = list.filter((d) => d.kind === 'audioinput');
        const vis = list.filter((d) => d.kind === 'videoinput');
        console.log('[ClientClassroom] Devices enumerated:', { audioCount: ais.length, videoCount: vis.length, devices: list.map(d => ({ kind: d.kind, label: d.label || '(no label)', deviceId: d.deviceId })) });
        setAudioInputs(ais);
        setVideoInputs(vis);

        // Auto-select first device if not already selected
        if (!selectedAudioDeviceId && ais.length) {
          console.log('[ClientClassroom] Auto-selecting first audio device:', ais[0].deviceId);
          setSelectedAudioDeviceId(ais[0].deviceId);
        }
        if (!selectedVideoDeviceId && vis.length) {
          console.log('[ClientClassroom] Auto-selecting first video device:', vis[0].deviceId);
          setSelectedVideoDeviceId(vis[0].deviceId);
        }
      } catch (e) {
        console.error('[ClientClassroom] Error enumerating devices:', e);
      }
    };

    updateDevices();
    navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener('devicechange', updateDevices);

    return () => {
      mountedFlag = false;
      try { navigator.mediaDevices && navigator.mediaDevices.removeEventListener && navigator.mediaDevices.removeEventListener('devicechange', updateDevices); } catch (e) { }
    };
  }, [selectedAudioDeviceId, selectedVideoDeviceId]);

  // Auto-request permissions on mount to populate device list
  useEffect(() => {
    if (!mounted) return;
    let ignore = false;
    console.log('[ClientClassroom] Attempting to request media permissions on mount...');
    (async () => {
      try {
        // Check if we already have permission by trying to get a minimal stream
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (!ignore) {
          console.log('[ClientClassroom] ✓ Permissions granted and stream obtained');
          setPermissionGranted(true);
          // Stop the stream immediately
          stream.getTracks().forEach(t => t.stop());
          // Re-enumerate to get device labels
          const list = await navigator.mediaDevices.enumerateDevices();
          const audioDevices = list.filter((d) => d.kind === 'audioinput');
          const videoDevices = list.filter((d) => d.kind === 'videoinput');
          console.log('[ClientClassroom] ✓ Re-enumerated after permission:', { audio: audioDevices.length, video: videoDevices.length });
          setAudioInputs(audioDevices);
          setVideoInputs(videoDevices);
          setHasAudioInput(audioDevices.length > 0);
          setHasVideoInput(videoDevices.length > 0);
          // Auto-select if not already selected
          if (!selectedAudioDeviceId && audioDevices.length) {
            console.log('[ClientClassroom] Auto-selecting first audio:', audioDevices[0].deviceId);
            setSelectedAudioDeviceId(audioDevices[0].deviceId);
          }
          if (!selectedVideoDeviceId && videoDevices.length) {
            console.log('[ClientClassroom] Auto-selecting first video:', videoDevices[0].deviceId);
            setSelectedVideoDeviceId(videoDevices[0].deviceId);
          }
        }
      } catch (e) {
        // Permission denied or not yet granted - that's ok, user can click Request Permissions
        if (!ignore) {
          console.warn('[ClientClassroom] Permission request failed (this is normal on first load):', (e as any)?.message ?? e);
          setPermissionGranted(false);
        }
      }
    })();
    return () => { ignore = true; };
  }, [mounted, selectedAudioDeviceId, selectedVideoDeviceId]);

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
          } catch (e) { }
        };
      }
    } catch (e) { }

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
        } catch (e) { }
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
      try { es?.close(); } catch (e) { }
    };
  }, [sessionReadyKey]);

  // Report current user as ready to the server when entering the classroom page
  // This ensures cross-device synchronization works even if localStorage is not shared.
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!mounted || !sessionReadyKey) return;

    const reportReady = async () => {
      const roleName = (urlRole === 'teacher' || computedRole === 'teacher') ? 'teacher' : 'student';
      // Use plain email (no tabId) for presence API — must match what wait page writes
      const localUserId = presenceId || roleName;

      // Client-side duplicate detection removed (it was self-triggering).
      // We rely solely on the useOneTimeEntry hook for lockouts now.

      // Update local storage first to ensure local consistency (will skip if no change)
      markReady(true);

      try {
        const r = await fetch(`/api/classroom/ready?uuid=${encodeURIComponent(sessionReadyKey)}`, { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        const parts = j.participants || [];

        // Enforce 1-on-1 limit: block if a DIFFERENT user with same role is present
        const isOccupied = parts.some((p: any) => p.role === roleName && p.userId !== localUserId && p.present);
        if (isOccupied && !isDevMode) {
          setIsRoleOccupied(true);
          return; // Block entry, don't report as ready
        }

        const selfEntry = parts.find((p: any) => p.role === roleName && p.userId === localUserId);

        // Ensure server marks us present
        if (!selfEntry || !selfEntry.present) {
          await fetch('/api/classroom/ready', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              uuid: sessionReadyKey,
              role: roleName,
              userId: localUserId,
              action: 'ready',
              present: true
            }),
          });
          if (!reportedRef.current) {
            console.log(`[ClientClassroom] Reported ${roleName} as PRESENT to server`);
          }
        }

        // Always mark as having reported properly once we've synced once
        if (!reportedRef.current) {
          reportedRef.current = true;
        }

        // Check if session has been ended/cleared on server
        try {
          const sessionResp = await fetch(`/api/classroom/session?uuid=${encodeURIComponent(sessionReadyKey)}`, { cache: 'no-store' });
          if (sessionResp.ok) {
            const sessionData = await sessionResp.json();
            const serverEndTs = typeof sessionData.endTs === 'number' ? sessionData.endTs : null;

            // 1. Exit if session ended on server (and we aren't the teacher who just ended it)
            // Safety: Only kick out if we actually have a session previously (endTsRef.current !== null).
            // This avoids kicking out students who enter before the session is initialized on the server.
            if (sessionData.endTs === null && endTsRef.current !== null) {
              const isTeacher = (urlRole === 'teacher' || computedRole === 'teacher');
              if (!isTeacher) {
                console.log('[ClientClassroom] Session ended on server, student exiting via heartbeat check...');
                handleLeave();
                return; // Stop processing further state changes once we've triggered exit
              }
            }

            // 2. Sync timer if server has a different endTs
            if (serverEndTs && (!endTsRef.current || Math.abs(endTsRef.current - serverEndTs) > 2000)) {
              console.log('[Timer] Heartbeat syncing endTs from server:', serverEndTs);
              endTsRef.current = serverEndTs;
              const endKey = `class_end_ts_${sessionReadyKey}`;
              try { localStorage.setItem(endKey, String(serverEndTs)); } catch (e) { }
            }

            // 3. Clear timer if server session is cleared
            if (serverEndTs === null && endTsRef.current !== null) {
              console.log('[Timer] Heartbeat detected cleared session on server');
              endTsRef.current = null;
              const endKey = `class_end_ts_${sessionReadyKey}`;
              try { localStorage.removeItem(endKey); } catch (e) { }
            }
          }
        } catch (e) { }
      } catch (e) {
        console.warn('[ClientClassroom] Failed to report ready to server', e);
      }
    };

    reportReady();

    // Periodic heartbeat to keep the ready status alive while on this page
    // Reduced interval to 10s for better responsiveness in session sync
    const interval = setInterval(() => {
      console.log(`[ClientClassroom] Heartbeat pulse for ${sessionReadyKey}...`);
      reportReady();
    }, 10000);
    return () => {
      clearInterval(interval);
      reportedRef.current = false;
      // Optional: Mark as not present when leaving the page (best-effort)
      const roleName = (urlRole === 'teacher' || computedRole === 'teacher') ? 'teacher' : 'student';
      const localUserId = presenceId || roleName; // plain email, no tabId
      const params = new URLSearchParams();
      params.append('uuid', sessionReadyKey);

      // Use sendBeacon for more reliable delivery during unload
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ uuid: sessionReadyKey, role: roleName, userId: localUserId, action: 'ready', present: false })], { type: 'application/json' });
        navigator.sendBeacon('/api/classroom/ready', blob);
      }
    };
  }, [mounted, sessionReadyKey, urlRole, computedRole, storedUser?.email, duplicateOverride]);

  // Persistent listener for session termination (BroadcastChannel for same-browser sync)
  useEffect(() => {
    if (!mounted || !sessionReadyKey) return;

    let bc: BroadcastChannel | null = null;
    try {
      const sessionBroadcastName = sessionParam || channelName || `classroom_session_ready_${courseId}`;
      bc = new BroadcastChannel(sessionBroadcastName);
      bc.onmessage = (event) => {
        if (event.data?.type === 'class_ended') {
          console.log('[ClientClassroom] Received class_ended via BroadcastChannel, exiting...');
          handleLeave();
        } else if (event.data?.type === 'class_started' && event.data?.endTs) {
          console.log('[ClientClassroom] Received class_started via BroadcastChannel, syncing endTs:', event.data.endTs);
          endTsRef.current = event.data.endTs;
          const endKey = `class_end_ts_${sessionReadyKey}`;
          try { localStorage.setItem(endKey, String(event.data.endTs)); } catch (e) { }
        }
      };
    } catch (e) {
      console.warn('Persistent BroadcastChannel listener failed:', e);
    }

    return () => {
      try { bc?.close(); } catch (e) { }
    };
  }, [mounted, sessionReadyKey, courseId, sessionParam, channelName]);

  const endSession = async () => {
    try {
      // 1. Broadcast end session notice
      const sessionBroadcastName = sessionParam || channelName || `classroom_session_ready_${courseId}`;
      try {
        const bc = new BroadcastChannel(sessionBroadcastName);
        bc.postMessage({ type: 'class_ended', timestamp: Date.now() });
        console.log('已廣播結束上課通知 ->', sessionBroadcastName);
        setTimeout(() => { try { bc.close(); } catch (e) { } }, 100);
      } catch (e) {
        console.warn('BroadcastChannel endSession failed', e);
      }

      // 1.5 Explicitly save remaining time before destroying the session
      // This is necessary because clearing the session breaks the user-counting in markReady(false)
      if (orderId && remainingSecondsRef.current !== null) {
        console.log('[ClientClassroom] endSession triggered. Saving remaining time to db:', remainingSecondsRef.current);
        try {
          fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ remainingSeconds: remainingSecondsRef.current }),
            keepalive: true
          }).catch(e => console.warn('[ClientClassroom] endSession save time failed', e));
        } catch (e) { }
      }

      // 2. Clear authoritative server session IMMEDIATELY so students exit.
      // We do this before waiting for any slow Agora SDK calls.
      setIsEnding(true);
      try {
        const endKey = `class_end_ts_${sessionReadyKey}`;
        localStorage.removeItem(endKey);
        localStorage.removeItem(sessionReadyKey);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        try {
          await fetch('/api/classroom/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ uuid: sessionReadyKey, action: 'clear' }),
            keepalive: true,
            signal: controller.signal
          });
          console.log('[ClientClassroom] Server session cleared');
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (e) {
        console.warn('Failed to clear server session', e);
      }

      // ensure we formally mark them as not present to trigger time saving locally
      markReady(false);

      // 3. Start Whiteboard Cleanup asynchronously (don't block)
      try { (window as any).__wbRoom = null; } catch (e) { }

      // 3.5 Delete PDF from S3
      if (isTeacher) { // redundant check but safe
        try {
          const deletePdfUrl = `/api/whiteboard/pdf?uuid=${encodeURIComponent(sessionReadyKey)}${orderId ? `&orderId=${encodeURIComponent(orderId)}` : ''}`;
          fetch(deletePdfUrl, {
            method: 'DELETE',
            keepalive: true
          }).catch(e => console.warn('PDF deletion failed', e));
        } catch (e) { }
      }

      if (useAgoraWhiteboard && agoraRoomData?.uuid) {
        fetch('/api/whiteboard/room', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uuid: agoraRoomData.uuid }),
          keepalive: true,
        }).catch(e => console.warn('Agora whiteboard cleanup failed (ignored)', e));
      } else if (whiteboardMeta?.uuid) {
        fetch('/api/agora/whiteboard/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uuid: whiteboardMeta.uuid }),
          keepalive: true,
        }).catch(e => console.warn('canvas whiteboard close request failed (ignored)', e));
      }

      // 4. Leave Agora with a timeout to prevent hanging UI
      try {
        console.log('[ClientClassroom] Leaving Agora...');
        await Promise.race([
          leave(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Agora leave timeout')), 1500))
        ]);
        console.log('[ClientClassroom] Agora leave complete');
      } catch (e) {
        console.warn('[ClientClassroom] Agora leave timed out or failed', e);
      }

    } catch (e) {
      console.warn('end session failed', e);
    } finally {
      // 5. Always redirect to wait page, regardless of errors
      const currentRole = (urlRole === 'teacher' || urlRole === 'student') ? urlRole : computedRole;
      const waitPageUrl = `/classroom/wait?courseId=${courseId}${orderId ? `&orderId=${orderId}` : ''}&role=${currentRole}`;
      setTimeout(() => {
        window.location.href = waitPageUrl;
      }, 50);
    }
  };

  const handleLeave = async () => {
    if (isEnding) return;
    setIsEnding(true);
    try {
      console.log('handleLeave called');

      // ensure we formally mark them as not present to trigger time saving
      markReady(false);

      // Leave Agora with a timeout to prevent hanging UI
      try {
        await Promise.race([
          leave(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Agora leave timeout')), 1500))
        ]);
        console.log('leave() completed');
      } catch (e) {
        console.warn('leave failed or timed out', e);
      }

    } catch (e) {
      console.warn('handleLeave top-level error', e);
    } finally {
      // Return to wait page based on role
      const currentRole = (urlRole === 'teacher' || urlRole === 'student') ? urlRole : computedRole;
      const waitPageUrl = `/classroom/wait?courseId=${courseId}${orderId ? `&orderId=${orderId}` : ''}&role=${currentRole}`;
      console.log('navigating to:', waitPageUrl);

      // small delay to let localstorage/fetch propagate before full navigation
      setTimeout(() => {
        window.location.href = waitPageUrl;
      }, 50);
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

      // Check if state actually changed before updating
      const existingEntry = arr.find((p) => p.role === roleName && (p.userId === userId || p.email === user?.email));
      const hasChanged = flag ? (!existingEntry || !existingEntry.present) : (existingEntry && existingEntry.present);

      // Only update if state actually changed
      if (!hasChanged) {
        return; // No change needed, avoid unnecessary updates
      }

      // remove existing entry for this role/userId
      const filtered = arr.filter((p) => !(p.role === roleName && (p.userId === userId || p.email === user?.email)));
      if (flag) {
        filtered.push({ role: roleName, userId, email: user?.email, present: true }); // We are in classroom, so mark as present
      } else {
        // We are marking this user as NOT present (leaving the room)
        // If they are the very last person to leave, save the remaining time to the DB.
        const activeUsersCount = filtered.filter(p => p.present).length;
        if (activeUsersCount === 0 && orderId && remainingSecondsRef.current !== null) {
          console.log('[ClientClassroom] Both users have left. Saving remaining time to db:', remainingSecondsRef.current);
          try {
            // Using keepalive since this might be fired on window unload
            fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ remainingSeconds: remainingSecondsRef.current }),
              keepalive: true
            }).catch(e => console.warn('[Timer] deduct session failed', e));
          } catch (e) { }
        }
      }
      localStorage.setItem(sessionReadyKey, JSON.stringify(filtered));
      try { window.dispatchEvent(new StorageEvent('storage', { key: sessionReadyKey, newValue: JSON.stringify(filtered) })); } catch (e) { }
      // notify other tabs via BroadcastChannel
      try {
        const bc = new BroadcastChannel(sessionReadyKey);
        bc.postMessage({ type: 'ready-updated' });
        bc.close();
      } catch (e) { }
    } catch (e) {
      console.warn('markReady failed', e);
    }
  };

  useEffect(() => {
    // This effect is intentionally left empty. The original logic that cleared
    // the "ready" status on unmount has been moved to the `useEffect` that
    // handles the `joined` state change. This prevents a user leaving the
    // classroom from affecting the state of the waiting room.
    return () => { };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The 'beforeunload' logic that modified the ready list has also been removed
  // to prevent race conditions and incorrect state changes for the wait page.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // This effect is intentionally left empty.
    return () => { };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReadyKey, urlRole, computedRole]);

  // start/stop countdown when `joined` changes
  useEffect(() => {
    // clear existing timer
    if (timerRef.current) {
      try { window.clearInterval(timerRef.current); } catch (e) { }
      timerRef.current = null;
    }

    // Only start countdown when joined AND fully initialized and order fetch is complete
    if (joined && fullyInitialized && orderFetchComplete) {
      const isTeacher = (urlRole === 'teacher' || urlRole === 'student') ? urlRole === 'teacher' : computedRole === 'teacher';
      // Use order's remainingSeconds if available, else fallback to course duration
      const secs = orderRemainingSeconds ?? Math.floor((sessionDurationMinutes || 10) * 60);

      // Fallback: set initial value immediately before any async calls ensure non-null
      setRemainingSeconds((prev) => prev !== null ? prev : secs);

      (async () => {
        console.log('[Timer] Starting initialization logic...', { isTeacher, secs });
        const endKey = `class_end_ts_${sessionReadyKey}`;

        // Determine or create authoritative end timestamp
        let endTs: number | null = endTsRef.current;
        try {
          const existing = typeof window !== 'undefined' ? localStorage.getItem(endKey) : null;
          if (existing) {
            const parsed = Number(existing || 0);
            if (!Number.isNaN(parsed) && parsed > Date.now()) {
              endTs = parsed;
              endTsRef.current = endTs;
              console.log('[Timer] Found existing endTs in localStorage:', endTs);
            }
          }
        } catch (e) { /* ignore */ }

        // If no local endTs, check authoritative server session store
        if (!endTs) {
          try {
            console.log('[Timer] Checking server for session data...');
            const resp = await fetch(`/api/classroom/session?uuid=${encodeURIComponent(sessionReadyKey)}`);
            if (resp.ok) {
              const j = await resp.json();
              const sEnd = j?.endTs;
              if (typeof sEnd === 'number' && sEnd > Date.now()) {
                endTs = sEnd;
                endTsRef.current = endTs;
                console.log('[Timer] Found endTs from server:', endTs);
                try { localStorage.setItem(endKey, String(endTs)); } catch (e) { }
              }
            }
          } catch (e) { console.warn('[Timer] Fetch session failed:', e); }
        }

        // If no endTs, initialize one. Both teacher and student can initialize to ensure timer starts.
        if (!endTs) {
          const now = Date.now();
          // The end time is calculated from the moment both joined+whiteboard are ready
          // We add a small buffer for the initial delay
          const bufferSecs = Math.ceil(INITIAL_COUNTDOWN_DELAY_MS / 1000);
          endTs = now + (secs + bufferSecs) * 1000;
          endTsRef.current = endTs;

          console.log('[Timer] Initializing new authoritative endTs:', endTs);
          try { localStorage.setItem(endKey, String(endTs)); } catch (e) { }

          // Broadcast class_started with endTs so other tabs/users sync
          const sessionBroadcastName = sessionParam || channelName || `classroom_session_ready_${courseId}`;
          try {
            const bc = new BroadcastChannel(sessionBroadcastName);
            bc.postMessage({ type: 'class_started', timestamp: now, endTs });
            setTimeout(() => { try { bc.close(); } catch (e) { } }, 100);
          } catch (e) { }

          // Persist to server session store
          try {
            await fetch('/api/classroom/session', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ uuid: sessionReadyKey, endTs }),
            });
          } catch (e) { }
        }

        // Start countdown calculation
        const updateRemaining = () => {
          const now = Date.now();
          let finalRemaining: number;

          // Always use the latest endTsRef value if available
          const currentEndTs = endTsRef.current;

          if (currentEndTs) {
            finalRemaining = Math.max(0, Math.ceil((currentEndTs - now) / 1000));
          } else {
            // Student who hasn't received endTs yet - show a waiting value
            finalRemaining = secs;
          }

          setRemainingSeconds(finalRemaining);
          return finalRemaining;
        };

        const initialVal = updateRemaining();
        console.log(`[Timer] Countdown started at: ${initialVal}s`);

        timerRef.current = window.setInterval(() => {
          const currentRemaining = updateRemaining();

          if (currentRemaining <= 0) {
            console.log('[Timer] Time is up! Clearing whiteboard as part of session cleanup.');
            if (timerRef.current) {
              window.clearInterval(timerRef.current);
              timerRef.current = null;
            }

            // ✅ TIMING POINT 1: Countdown timer completion
            // Cleanup and end session - broadcast whiteboard_clear to all participants
            try {
              const sessionBroadcastName = sessionParam || channelName || `classroom_session_ready_${courseId}`;
              const bc2 = new BroadcastChannel(sessionBroadcastName);
              bc2.postMessage({ type: 'whiteboard_clear', timestamp: Date.now() });
              setTimeout(() => { try { bc2.close(); } catch (e) { } }, 50);

              if (useAgoraWhiteboard) agoraWhiteboardRef.current?.clearPDF();
            } catch (e) { }

            // Deduct session and remaining minutes from order exactly once when time is up
            if (isTeacher && orderId) {
              try {
                fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'deduct' }),
                  keepalive: true,
                }).catch(e => console.warn('[Timer] deduct session failed', e));
              } catch (e) { }
            }

            setTimeout(() => endSession(), 1000);
          }
        }, 1000) as unknown as number;
      })();
    } else {
      setRemainingSeconds(null);
    }

    return () => {
      if (timerRef.current) {
        try { window.clearInterval(timerRef.current); } catch (e) { }
        timerRef.current = null;
      }
    };
  }, [joined, sessionDurationMinutes, fullyInitialized, classFullyLoadedAt, orderFetchComplete, orderRemainingSeconds]);

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
        try { localVideoRef.current.srcObject = null; } catch (e) { }
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
      if (micSourceRef.current) { try { micSourceRef.current.disconnect(); } catch (e) { } micSourceRef.current = null; }
      if (analyserRef.current) { try { analyserRef.current.disconnect(); } catch (e) { } analyserRef.current = null; }
      if (audioContextRef.current) { try { audioContextRef.current.close(); } catch (e) { } audioContextRef.current = null; }
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
      try { stopCameraPreview(); } catch (e) { }
      try { stopMicTest(); } catch (e) { }
      // Stop independent microphone stream
      try {
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach(track => track.stop());
          micStreamRef.current = null;
        }
      } catch (e) { }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper functions for color checking
  const isColorActive = (c: number[]) => {
    if (!whiteboardState?.activeColor) return false;
    const active = whiteboardState.activeColor;
    return active[0] === c[0] && active[1] === c[1] && active[2] === c[2];
  };

  if (isRoleOccupied) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f5f5f5', textAlign: 'center', padding: 20 }}>
        <div style={{ padding: 40, background: 'white', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxWidth: 500 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
          <h2 style={{ color: '#d32f2f', marginBottom: 16 }}>教室已滿</h2>
          <p style={{ fontSize: 16, color: '#666', marginBottom: 24, lineHeight: 1.5 }}>
            此教室已經有一位同角色的使用者。為了確保一對一教學，您無法同時進入。
          </p>
          <button
            onClick={() => window.location.href = (urlRole === 'teacher' || computedRole === 'teacher') ? '/teacher_courses' : '/student_courses'}
            style={{ padding: '12px 24px', background: '#1976d2', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer', fontWeight: 600 }}
          >
            返回課程列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Error Display - Only show in development mode */}
      {process.env.NODE_ENV !== 'production' && whiteboardError && (
        <div style={{
          background: '#fee2e2',
          color: '#dc2626',
          fontSize: '14px',
          padding: '12px 16px',
          textAlign: 'center',
          borderBottom: '1px solid #fecaca',
          fontWeight: '500'
        }}>
          <strong>錯誤：</strong>{whiteboardError}
        </div>
      )}

      {/* Course Title (only on /classroom/test) */}
      {isTestPath && (
        <div style={{ background: '#fff', color: '#111827', fontSize: '18px', padding: '10px 12px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid #e5e7eb' }}>
          {courseTitle}
        </div>
      )}

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
              {/* ✅ TIMING POINT 2: Manual trigger by teacher */}
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

      {/* Duplicate detected modal removed entirely */}

      {/* Debug Modal - Top Right (Engineers only, hidden with ?debugMode=1) */}
      {isTestPath && isDevMode && showDebugModal && (
        <div style={{
          position: 'fixed',
          right: 16,
          top: 16,
          background: 'rgba(15, 23, 42, 0.95)',
          color: 'white',
          padding: '16px',
          borderRadius: 12,
          zIndex: 99999,
          fontSize: 13,
          lineHeight: 1.5,
          minWidth: 280,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#60a5fa' }}>🔍 DEBUG INFO</div>
            <button
              onClick={() => setShowDebugModal(false)}
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: 'none',
                color: '#fca5a5',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                width: 24,
                height: 24,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >×</button>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>joined:</span>
              <span style={{ fontWeight: 600, color: joined ? '#34d399' : '#fbbf24' }}>{String(joined)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>fullyInitialized:</span>
              <span style={{ fontWeight: 600, color: fullyInitialized ? '#34d399' : '#fbbf24' }}>{String(fullyInitialized)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>agoraRoomData:</span>
              <span style={{ fontWeight: 600, color: agoraRoomData ? '#34d399' : '#ef4444' }}>{agoraRoomData ? 'yes' : 'no'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>whiteboardRef:</span>
              <span style={{ fontWeight: 600, color: agoraWhiteboardRef.current ? '#34d399' : '#ef4444' }}>{agoraWhiteboardRef.current ? 'yes' : 'no'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>remainingSeconds:</span>
              <span style={{ fontWeight: 600, color: remainingSeconds === null ? '#ef4444' : '#34d399' }}>{remainingSeconds === null ? 'null' : remainingSeconds}</span>
            </div>
            <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ opacity: 0.5, fontSize: 11, marginBottom: 4 }}>Session Key:</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', color: '#94a3b8' }}>{String(sessionReadyKey)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Control Modal - Bottom Right (Engineers only, hidden with ?debugMode=1) */}
      {isTestPath && isDevMode && showControlModal && (
        <div style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          background: 'rgba(15, 23, 42, 0.95)',
          color: 'white',
          padding: '16px',
          borderRadius: 12,
          zIndex: 99999,
          fontSize: 13,
          lineHeight: 1.5,
          minWidth: 280,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#a78bfa' }}>⚙️ TEST CONTROLS</div>
            <button
              onClick={() => setShowControlModal(false)}
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: 'none',
                color: '#fca5a5',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                width: 24,
                height: 24,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >×</button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <button
              onClick={() => setShowDebugModal(true)}
              style={{
                background: showDebugModal ? 'rgba(96, 165, 250, 0.2)' : 'rgba(96, 165, 250, 0.4)',
                border: '1px solid rgba(96, 165, 250, 0.3)',
                color: '#93c5fd',
                padding: '8px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
            >
              {showDebugModal ? '✓ Debug Visible' : 'Show Debug'}
            </button>
            <div style={{ padding: '8px 12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, fontSize: 11 }}>
              <div style={{ opacity: 0.6, marginBottom: 4 }}>Role:</div>
              <div style={{ fontWeight: 600, color: '#60a5fa' }}>{isTeacher ? 'Teacher' : 'Student'}</div>
            </div>
            <div style={{ padding: '8px 12px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: 8, fontSize: 11 }}>
              <div style={{ opacity: 0.6, marginBottom: 4 }}>Remote Users:</div>
              <div style={{ fontWeight: 600, color: '#c084fc' }}>{remoteUsers.length}</div>
            </div>
            {error && (
              <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8, fontSize: 11 }}>
                <div style={{ opacity: 0.6, marginBottom: 4 }}>Error:</div>
                <div style={{ fontWeight: 600, color: '#f87171' }}>{error}</div>
              </div>
            )}
          </div>
        </div>
      )}



      <div className="client-classroom">
        {/* Left: Whiteboard (flexible) */}
        <div className="client-left" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
          <div className="client-left-inner" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'nowrap', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                {remainingSeconds !== null && (
                  <div style={{ color: 'red', fontWeight: 600, whiteSpace: 'nowrap' }}>{Math.floor((remainingSeconds || 0) / 60)}:{String((remainingSeconds || 0) % 60).padStart(2, '0')}</div>
                )}
              </div>
              {/* Toggle buttons for test page - only visible to engineers with ?debugMode=1 */}
              {isTestPath && isDevMode && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {!showDebugModal && (
                    <button
                      onClick={() => setShowDebugModal(true)}
                      style={{
                        background: 'rgba(59, 130, 246, 0.9)',
                        border: 'none',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: 12,
                        padding: '4px 8px',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                        transition: 'all 0.2s',
                        fontWeight: 600,
                        whiteSpace: 'nowrap'
                      }}
                      title="Show Debug Info"
                    >
                      🔍 Debug
                    </button>
                  )}
                  {!showControlModal && (
                    <button
                      onClick={() => setShowControlModal(true)}
                      style={{
                        background: 'rgba(168, 85, 247, 0.9)',
                        border: 'none',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: 12,
                        padding: '4px 8px',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        boxShadow: '0 2px 8px rgba(168, 85, 247, 0.3)',
                        transition: 'all 0.2s',
                        fontWeight: 600,
                        whiteSpace: 'nowrap'
                      }}
                      title="Show Test Controls"
                    >
                      ⚙️ Controls
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Whiteboard container - improved for mobile viewport with dvh */}
            <div className="whiteboard-container" style={{ width: '100%', flex: isMobileViewport ? 'none' : 1, position: 'relative', height: isMobileViewport ? 'auto' : '100%', minHeight: isMobileViewport ? '320px' : '500px', isolation: 'isolate' }}>
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
              {/* Boot-style overlay while not fullyInitialized */}
              {joined && !fullyInitialized && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,8,10,0.85)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
                  <div style={{ width: 520, padding: 24 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 14, marginBottom: 12 }}>systemd [classroom@{effectiveChannelName}] booting...</div>
                    <div style={{ background: '#0b1220', padding: 12, borderRadius: 6, maxHeight: 240, overflow: 'auto', fontFamily: 'monospace', fontSize: 13 }}>
                      {bootSteps.map((s, idx) => (
                        <div key={s.name} style={{ color: s.done ? '#90ee90' : '#888', marginBottom: 6 }}>
                          {s.done ? '●' : '○'} {s.name}
                        </div>
                      ))}
                      <div style={{ marginTop: 8, color: '#aaa', fontSize: 12 }}>Waiting for all services to be ready. Countdown will start after full load + 1 hour.</div>
                    </div>
                  </div>
                </div>
              )}

              {isEnding && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', color: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 40, height: 40, border: '4px solid #f3f3f3', borderTop: '4px solid #d32f2f', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
                    <div style={{ fontWeight: 600 }}>正在結束課程並保存進度...</div>
                    <style>{`
                      @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                      }
                    `}</style>
                  </div>
                </div>
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
                {mounted ? getDisplayName(storedUser, isTeacher ? 'teacher' : 'student', 'you') : '載入中...'}
              </div>
            </div>

            <div className="video-container">
              <video ref={remoteVideoRef} autoPlay playsInline />
              <div className="video-label">
                {!firstRemote
                  ? '等待連接...'
                  : (remoteName || getDisplayName(null, isTeacher ? 'student' : 'teacher'))
                }
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
                                try { localVideoRef.current.srcObject = null; } catch (e) { }
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
                      disabled={!joined || isEnding}
                      style={{
                        display: isTestPath ? 'none' : 'block',
                        background: (joined && !isEnding) ? '#f44336' : '#ef9a9a',
                        color: 'white',
                        border: 'none',
                        padding: '8px 12px',
                        borderRadius: 4,
                        cursor: (joined && !isEnding) ? 'pointer' : 'not-allowed',
                        fontWeight: 600
                      }}
                    >
                      {t('leave')}
                    </button>

                    {/* Mic toggle and Leave placed below the Join button */}
                  </div>

                  {/* Console Log Viewers for debugging */}
                  {typeof window !== 'undefined' && window.location.pathname !== '/classroom/test' && (
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
                    {!isTestPath && (
                      <div style={{ marginTop: 8, color: canJoin ? '#10b981' : '#666', fontSize: 13, textAlign: 'center' }}>
                        {canJoin ? t('ready_complete') : t('ready_incomplete')}
                      </div>
                    )}

                    <button
                      onClick={() => { try { handleLeave(); } catch (e) { console.error('Leave click error', e); } }}
                      disabled={!joined || isEnding}
                      style={{
                        display: isTestPath ? 'none' : 'block',
                        background: (joined && !isEnding) ? '#f44336' : '#ef9a9a',
                        color: 'white',
                        border: 'none',
                        padding: '8px 12px',
                        borderRadius: 6,
                        cursor: (joined && !isEnding) ? 'pointer' : 'not-allowed',
                        fontWeight: 600,
                        width: '100%'
                      }}
                    >
                      {t('leave')}
                    </button>

                    {isTeacher && (
                      <button
                        onClick={() => { if (window.confirm(t('confirm_end_session') || '確定要結束課程嗎？')) endSession(); }}
                        disabled={!joined || isEnding}
                        style={{
                          marginTop: 8,
                          background: (joined && !isEnding) ? '#d32f2f' : '#ef9a9a',
                          color: 'white',
                          border: 'none',
                          padding: '8px 12px',
                          borderRadius: 6,
                          cursor: (joined && !isEnding) ? 'pointer' : 'not-allowed',
                          fontWeight: 600,
                          width: '100%'
                        }}
                      >
                        {t('end_session')}
                      </button>
                    )}
                  </div>

                  {typeof window !== 'undefined' && window.location.pathname !== '/classroom/test' && (
                    <>
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
                    </>
                  )}

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

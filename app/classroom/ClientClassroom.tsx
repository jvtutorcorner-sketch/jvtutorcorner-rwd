'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useAgoraClassroom } from '@/lib/agora/useAgoraClassroom';
import { getStoredUser, setStoredUser } from '@/lib/mockAuth';
import { COURSES } from '@/data/courses';
import EnhancedWhiteboard from '@/components/EnhancedWhiteboard';
import dynamic from 'next/dynamic';

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), { ssr: false });

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
  // determine courseId from query string (e.g. ?courseId=c1)
  const courseId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('courseId') ?? 'c1' : 'c1';
  const orderId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('orderId') ?? null : null;
  const course = COURSES.find((c) => c.id === courseId) || null;
  
  // Use courseId + orderId as channel name to ensure same classroom
  const effectiveChannelName = channelName || `course_${courseId}_${orderId || 'default'}`;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // determine role from stored user + course mapping
  const storedUser = typeof window !== 'undefined' ? getStoredUser() : null;
  // allow overriding role via URL parameter `role=teacher|student` for testing
  const urlRole = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('role') : null;
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
    whiteboardRoom,
    whiteboardMeta,
    join,
    leave,
    checkDevices,
    // 新增：视频控制
    currentQuality,
    isLowLatencyMode,
    setVideoQuality,
    setLowLatencyMode,
  } = useAgoraClassroom({
    channelName: effectiveChannelName,
    role: (urlRole === 'teacher' || urlRole === 'student') ? (urlRole as Role) : computedRole,
    isOneOnOne: true, // 启用1对1优化
    defaultQuality: 'high' // 默认高质量
  });

  const firstRemote = useMemo(() => remoteUsers?.[0] ?? null, [remoteUsers]);

  const [hasAudioInput, setHasAudioInput] = useState<boolean | null>(null);
  const [hasVideoInput, setHasVideoInput] = useState<boolean | null>(null);
  const [wantPublishAudio, setWantPublishAudio] = useState(true);
  const [wantPublishVideo, setWantPublishVideo] = useState(true);
  // PDF viewer state
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [showPdf, setShowPdf] = useState(false);
  // session countdown - 改为30秒测试
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState<number>(0.5); // 0.5分钟 = 30秒
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

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

  const sessionReadyKey = `classroom_session_ready_${courseId}_${orderId ?? 'noorder'}`;

  // Camera preview and mic test
  const previewStreamRef = useRef<MediaStream | null>(null);
  const [previewingCamera, setPreviewingCamera] = useState(false);
  const [testingMic, setTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const pendingToolRef = useRef<string | null>(null);
  const [penColor, setPenColor] = useState<string>('#000000');
  const pendingColorRef = useRef<string | null>(null);

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
      hasWhiteboardRoom: !!whiteboardRoom,
      hasWhiteboardRef: !!whiteboardRef,
      whiteboardMeta,
      joined
    });
  }, [whiteboardRoom, whiteboardRef, whiteboardMeta, joined]);

  // 跨标签页同步：老师开始上课时通知学生
  useEffect(() => {
    const sessionKey = `classroom_session_${courseId}_${orderId ?? 'noorder'}`;
    const bc = new BroadcastChannel(sessionKey);
    
    bc.onmessage = (event) => {
      if (event.data?.type === 'class_started' && !joined && !loading) {
        console.log('收到開始上課通知，自動加入...');
        // 学生端自动加入
        join({ publishAudio: wantPublishAudio, publishVideo: wantPublishVideo });
      } else if (event.data?.type === 'class_ended') {
        console.log('收到結束上課通知');
        // 如果已经在课堂中，自动离开并返回等待页
        if (joined) {
          endSession();
        }
      }
    };
    
    return () => {
      bc.close();
    };
  }, [courseId, orderId, joined, loading, wantPublishAudio, wantPublishVideo, join]);

  useEffect(() => {
    let mountedFlag = true;
    (async () => {
      if (checkDevices) {
        const d = await checkDevices();
        if (!mountedFlag) return;
        setHasAudioInput(Boolean(d.hasAudioInput));
        setHasVideoInput(Boolean(d.hasVideoInput));
        // default wants
        setWantPublishAudio(Boolean(d.hasAudioInput));
        setWantPublishVideo(Boolean(d.hasVideoInput));
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
      alert('權限已授予！現在可以選擇麥克風和攝影機。');
    } catch (e) {
      console.warn('Permission request failed', e);
      alert('無法取得權限，請確認瀏覽器設定允許存取麥克風和攝影機。');
    }
  };

  // readiness management using localStorage to coordinate between teacher/student tabs
  useEffect(() => {
    if (!orderId) {
      setCanJoin(false);
      return;
    }

    const readReady = () => {
      try {
        const raw = localStorage.getItem(sessionReadyKey);
        const arr = raw ? JSON.parse(raw) as Array<{ role: string; email?: string }> : [];
        const hasTeacher = arr.some((p) => p.role === 'teacher');
        const hasStudent = arr.some((p) => p.role === 'student');
        setCanJoin(hasTeacher && hasStudent);
      } catch (e) {
        setCanJoin(false);
      }
    };

    readReady();

    const onStorage = (ev: StorageEvent) => {
      if (ev.key === sessionReadyKey) readReady();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, courseId]);

  const endSession = async () => {
    try {
      // 广播结束上课通知
      const sessionKey = `classroom_session_${courseId}_${orderId ?? 'noorder'}`;
      const bc = new BroadcastChannel(sessionKey);
      bc.postMessage({ type: 'class_ended', timestamp: Date.now() });
      console.log('已廣播結束上課通知');
      setTimeout(() => bc.close(), 100);
      
      await leave();
      try { (window as any).__wbRoom = null; } catch (e) {}
      if (whiteboardMeta?.uuid) {
        try {
          await fetch('/api/agora/whiteboard/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uuid: whiteboardMeta.uuid }) });
        } catch (e) { console.warn('whiteboard close request failed', e); }
      }
      
      // 返回到等待页面，保持相应的 role 参数
      const currentRole = (urlRole === 'teacher' || urlRole === 'student') ? urlRole : computedRole;
      const waitPageUrl = `/classroom/wait?courseId=${courseId}${orderId ? `&orderId=${orderId}` : ''}&role=${currentRole}`;
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
      alert('無法啟動相機預覽，請確認已授予權限且相機未被其他應用程式使用。');
      setPreviewingCamera(false);
    }
  };

  const markReady = (flag: boolean) => {
    setReady(flag);
    try {
      const raw = localStorage.getItem(sessionReadyKey);
      const arr = raw ? JSON.parse(raw) as Array<{ role: string; email?: string }> : [];
      const email = (getStoredUser && typeof getStoredUser === 'function') ? (getStoredUser()?.email ?? undefined) : undefined;
      const roleName = (urlRole === 'teacher' || computedRole === 'teacher') ? 'teacher' : 'student';
      // remove existing entry for this role/email
      const filtered = arr.filter((p) => !(p.role === roleName && p.email === email));
      if (flag) {
        filtered.push({ role: roleName, email });
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
    // cleanup own ready mark on unmount
    return () => {
      try {
        const raw = localStorage.getItem(sessionReadyKey);
        const arr = raw ? JSON.parse(raw) as Array<{ role: string; email?: string }> : [];
        const email = (getStoredUser && typeof getStoredUser === 'function') ? (getStoredUser()?.email ?? undefined) : undefined;
        const roleName = (urlRole === 'teacher' || computedRole === 'teacher') ? 'teacher' : 'student';
        const filtered = arr.filter((p) => !(p.role === roleName && p.email === email));
        localStorage.setItem(sessionReadyKey, JSON.stringify(filtered));
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // start/stop countdown when `joined` changes
  useEffect(() => {
    // clear existing timer
    if (timerRef.current) {
      try { window.clearInterval(timerRef.current); } catch (e) {}
      timerRef.current = null;
    }

    if (joined) {
      // 老师开始上课时，广播通知学生
      const isTeacher = (urlRole === 'teacher' || urlRole === 'student') ? urlRole === 'teacher' : computedRole === 'teacher';
      if (isTeacher) {
        const sessionKey = `classroom_session_${courseId}_${orderId ?? 'noorder'}`;
        const bc = new BroadcastChannel(sessionKey);
        bc.postMessage({ type: 'class_started', timestamp: Date.now() });
        console.log('已廣播開始上課通知');
        setTimeout(() => bc.close(), 100);
      }
      
      // initialize remaining seconds - 30秒倒计时
      const secs = Math.floor((sessionDurationMinutes || 0.5) * 60);
      setRemainingSeconds(secs);
      console.log(`開始 ${secs} 秒倒計時`);
      
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
      alert('無法啟動麥克風測試，請確認已授予權限。');
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

  useEffect(() => {
    return () => {
      // cleanup on unmount
      try { stopCameraPreview(); } catch (e) {}
      try { stopMicTest(); } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // helper to robustly set whiteboard tool across SDK versions
  const setWhiteboardTool = (tool: string): boolean => {
    const room: any = whiteboardRoom;
    // if no room yet, try to call global helper if present and queue the tool
    if (!room) {
      try {
        const g = (window as any).__wb_setTool;
        if (typeof g === 'function') {
          try { g(tool); } catch (e) { console.warn('global __wb_setTool failed', e); }
        }
      } catch {}
      pendingToolRef.current = tool;
      console.info('Whiteboard not ready; queued tool:', tool);
      return false;
    }
    try {
      const strokeColor = hexToRgbArray(penColor);
      const methods = Object.keys(room).filter((k) => typeof room[k] === 'function');
      console.debug('Attempting setWhiteboardTool, room methods count:', methods.length);

      // Map generic tool names to Netless/SDK appliance names when known
      const toolMapping: Record<string, string> = {
        pencil: 'pencil',
        eraser: 'eraser',
        rectangle: 'rectangle',
        circle: 'ellipse',
        line: 'straight',
        text: 'text',
        select: 'selector'
      };
      const mapped = toolMapping[tool] || tool;

      let applied = false;

      // Preferred canonical call: setMemberState with appliance name, attributes and writable flag
      if (typeof room.setMemberState === 'function') {
        try {
          room.setMemberState({
            currentApplianceName: mapped,
            currentApplianceAttributes: { strokeColor },
            isWritable: true
          });
          applied = true;
        } catch (e) {
          // try variants
          try { room.setMemberState({ applianceName: mapped, strokeColor, isWritable: true }); applied = true; } catch (e) {}
          try { room.setMemberState({ currentApplianceName: mapped }); applied = true; } catch (e) {}
        }
      }

      // fallback methods
      const fallbacks: Array<() => any> = [
        () => room.setAppliance && room.setAppliance(mapped),
        () => room.setTool && room.setTool(mapped),
        () => room.changeAppliance && room.changeAppliance(mapped),
        () => (window as any).__wb_setTool && (window as any).__wb_setTool(mapped),
      ];
      for (const fn of fallbacks) {
        try {
          const r = fn();
          if (r !== undefined) applied = true;
        } catch (e) {}
      }

      // ensure writable if available
      try {
        if (typeof room.setWritable === 'function') { room.setWritable(true); applied = true; }
        if (typeof room.enableWrite === 'function') { room.enableWrite(true); applied = true; }
        if (typeof room.setMemberState === 'function') {
          try { room.setMemberState({ isWritable: true }); applied = true; } catch (e) {}
        }
      } catch (e) {}

      if (!applied) {
        console.warn('setWhiteboardTool: no known API applied for tool', tool, 'mapped->', mapped, 'available methods:', methods.slice(0,50));
      } else {
        console.info('setWhiteboardTool applied:', tool, 'mapped->', mapped);
      }

      if (applied) return true;

      // if tool is pencil, also ensure current pen color is applied
      if (tool === 'pencil' && penColor) {
        try { setWhiteboardColor(penColor); } catch (e) {}
      }
    } catch (e) {
      console.warn('setWhiteboardTool overall failure', e);
    }
    return false;
  };

  const setWhiteboardColor = (color: string) => {
    const room: any = whiteboardRoom;
    const strokeColor = hexToRgbArray(color);
    // if no room yet, try global helper and queue
    if (!room) {
      try {
        const g = (window as any).__wb_setColor;
        if (typeof g === 'function') {
          try { g(color); } catch (e) { console.warn('global __wb_setColor failed', e); }
        }
      } catch {}
      pendingColorRef.current = color;
      console.info('Whiteboard not ready; queued color:', color);
      return;
    }

    try {
      const attempts: Array<() => any> = [
        () => room.setMemberState && room.setMemberState({ strokeColor }),
        () => room.setMemberState && room.setMemberState({ strokeColor, isWritable: true }),
        () => room.setMemberState && room.setMemberState({ currentApplianceAttributes: { strokeColor } }),
        () => room.setStrokeColor && room.setStrokeColor(strokeColor),
        () => room.setAttribute && room.setAttribute('strokeColor', strokeColor),
        () => (window as any).__wb_setColor && (window as any).__wb_setColor(strokeColor),
      ];

      for (const fn of attempts) {
        try { fn(); } catch (e) { /* ignore */ }
      }
      console.info('setWhiteboardColor attempted:', color, strokeColor);
    } catch (e) {
      console.warn('setWhiteboardColor overall failure', e);
    }
  };

  const listWhiteboardMethods = () => {
    try {
      if (!whiteboardRoom) {
        console.info('No whiteboard room');
        return;
      }
      const methods = Object.keys(whiteboardRoom).filter((k) => typeof (whiteboardRoom as any)[k] === 'function');
      console.info('Whiteboard room methods:', methods);
      // also expose to window for manual inspection
      try { (window as any).__wb_methods = methods; } catch {}
    } catch (e) {
      console.warn('listWhiteboardMethods failed', e);
    }
  };

  // if a tool or color was queued before the whiteboard was ready, apply them once room becomes available
  useEffect(() => {
    const t = pendingToolRef.current;
    const c = pendingColorRef.current;
    if (whiteboardRoom && (t || c)) {
      // small delay to allow any post-init plumbing
      setTimeout(() => {
        try {
          if (t) {
            try {
              const ok = setWhiteboardTool(t);
              if (ok) pendingToolRef.current = null;
            } catch (e) { console.warn('applying pending tool failed', e); }
          }
        } catch (e) {
          console.warn('applying pending tool failed', e);
        }
        try {
          if (c) setWhiteboardColor(c);
        } catch (e) {
          console.warn('applying pending color failed', e);
        }
        pendingToolRef.current = null;
        pendingColorRef.current = null;
      }, 50);
    }
  }, [whiteboardRoom]);

  // Retry applying queued tool after bind — poll briefly until element bound
  useEffect(() => {
    if (!whiteboardRoom || !pendingToolRef.current) return;
    let attempts = 0;
    const iv = setInterval(() => {
      attempts += 1;
      try {
        if (!pendingToolRef.current) return;
        const ok = setWhiteboardTool(pendingToolRef.current as string);
        if (ok || attempts > 20) {
          pendingToolRef.current = null;
          clearInterval(iv);
        }
      } catch (e) {
        console.warn('retry setWhiteboardTool failed', e);
      }
      if (attempts > 20) clearInterval(iv);
    }, 100);
    return () => clearInterval(iv);
  }, [whiteboardRoom]);

  return (
    <div className="client-classroom" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* Left: Whiteboard (flexible) */}
      <div className="client-left" style={{ flex: 1, minWidth: 560, display: 'flex', justifyContent: 'center' }}>
        <div className="client-left-inner" style={{ width: '100%', maxWidth: 1000 }}>
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12 }}>
                {remainingSeconds !== null && (
                  <div style={{ color: 'red', fontWeight: 600 }}>{Math.floor((remainingSeconds || 0) / 60)}:{String((remainingSeconds || 0) % 60).padStart(2, '0')}</div>
                )}
              </div>
          </div>
          <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            <EnhancedWhiteboard 
              room={whiteboardRoom}
              whiteboardRef={whiteboardRef}
              width={900} 
              height={640} 
              className="flex-1" 
              onPdfSelected={(f) => { setSelectedPdf(f); }}
              pdfFile={selectedPdf}
              micEnabled={wantPublishAudio}
              onToggleMic={() => setWantPublishAudio((s) => !s)}
              hasMic={hasAudioInput !== false}
              onLeave={() => leave()}
            />
          </div>
        </div>
      </div>

      {/* Right: Video previews and controls (fixed width) */}
      <div className="client-right" style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        

        <div style={{ background: '#111', padding: 12, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 320, height: 200, background: '#000', borderRadius: 6, overflow: 'hidden' }}>
              <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ color: '#fff', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>{mounted && (urlRole === 'teacher' || computedRole === 'teacher') ? 'Teacher' : 'Student'}</span>
              <span style={{ background: permissionGranted ? '#4caf50' : '#ff9800', color: 'white', padding: '2px 8px', borderRadius: 3, fontSize: 11 }}>{permissionGranted ? '✓ 權限已授予' : '⚠ 請求權限'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 320, height: 200, background: '#000', borderRadius: 6, overflow: 'hidden' }}>
              <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ color: '#fff', fontSize: 12 }}>{firstRemote ? `${mounted && (urlRole === 'teacher' || computedRole === 'teacher') ? 'Student' : 'Teacher'} ${firstRemote.uid}` : (mounted && (urlRole === 'teacher' || computedRole === 'teacher') ? 'Student' : 'Teacher')}</div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mounted && (isAdmin || computedRole === 'teacher' || computedRole === 'student') && (
              <>

                <div style={{ display: 'flex', gap: 8 }}>
                  {(() => {
                    console.log('Rendering button section, joined:', joined, 'loading:', loading);
                    return null;
                  })()}
                  {!joined ? (
                    <button
                      onClick={() => join({ publishAudio: wantPublishAudio, publishVideo: wantPublishVideo })}
                      disabled={loading}
                      style={{
                        background: loading ? '#9CA3AF' : '#4CAF50',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: 4,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontWeight: 600
                      }}
                    >
                      {loading ? '加入中...' : '🚀 Join (開始上課)'}
                    </button>
                  ) : (
                    <>
                      {(() => {
                        console.log('Rendering Leave button, joined:', joined);
                        return null;
                      })()}
                      <button
                        onClick={() => {
                          console.log('Leave button clicked, joined:', joined);
                          try {
                            handleLeave();
                          } catch (e) {
                            console.error('Button click error:', e);
                          }
                        }}
                        style={{
                          background: '#f44336',
                          color: 'white',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        Leave (離開)
                      </button>
                    </>
                  )}
                </div>
                
                {joined && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#ffeb3b', background: 'rgba(255,235,59,0.1)', padding: 4, borderRadius: 4 }}>
                    ⏱ 已開始計費 | Agora 按分鐘收費
                  </div>
                )}
                
                <div style={{ marginTop: 6, fontSize: 12, color: '#c7c7c7' }}>
                  <div><strong>Join</strong>: 開始視訊通話和白板協作（此時開始計費）</div>
                  <div><strong>Leave</strong>: 只離開目前這個瀏覽器分頁或裝置；不會影響其他參與者。</div>
                  <div><strong>End Session</strong>: 正式結束課堂，關閉白板並使所有參與者離開（只有老師可執行）。</div>
                </div>
                
                {remainingSeconds !== null && (
                  <div style={{ marginTop: 6 }}>
                    <strong>剩餘時間：</strong> {Math.floor((remainingSeconds || 0) / 60)}:{String((remainingSeconds || 0) % 60).padStart(2, '0')}
                  </div>
                )}
              </>
            )}
            {loading && <div style={{ color: '#ccc' }}>Joining...</div>}
            {error && <div style={{ color: 'salmon' }}>{error}</div>}
          </div>
        </div>

      </div>
    </div>
  );
};

export default ClientClassroom;

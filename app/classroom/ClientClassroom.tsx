'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useAgoraClassroom } from '@/lib/agora/useAgoraClassroom';
import { getStoredUser, setStoredUser } from '@/lib/mockAuth';
import { COURSES } from '@/data/courses';
import EnhancedWhiteboard from '@/components/EnhancedWhiteboard';
import VideoControls from '@/components/VideoControls';

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

const ClientClassroom: React.FC<{ channelName?: string }> = ({ channelName = 'test' }) => {
  // determine courseId from query string (e.g. ?courseId=c1)
  const courseId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('courseId') ?? 'c1' : 'c1';
  const orderId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('orderId') ?? null : null;
  const course = COURSES.find((c) => c.id === courseId) || null;

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
    channelName,
    role: (urlRole === 'teacher' || urlRole === 'student') ? (urlRole as Role) : computedRole,
    isOneOnOne: true, // 启用1对1优化
    defaultQuality: 'high' // 默认高质量
  });

  const firstRemote = useMemo(() => remoteUsers?.[0] ?? null, [remoteUsers]);

  const [hasAudioInput, setHasAudioInput] = useState<boolean | null>(null);
  const [hasVideoInput, setHasVideoInput] = useState<boolean | null>(null);
  const [wantPublishAudio, setWantPublishAudio] = useState(true);
  const [wantPublishVideo, setWantPublishVideo] = useState(true);
  // session countdown
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState<number>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(`course_session_duration_${courseId}`) : null;
      if (raw) return Number(raw);
    } catch (e) {}
    return (course as any)?.sessionDurationMinutes ?? 50;
  });
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  // Device lists and selections (Google Meet-like UI)
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(null);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

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
      await leave();
      try { (window as any).__wbRoom = null; } catch (e) {}
      if (whiteboardMeta?.uuid) {
        try {
          await fetch('/api/agora/whiteboard/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uuid: whiteboardMeta.uuid }) });
        } catch (e) { console.warn('whiteboard close request failed', e); }
      }
      alert('Session ended locally; server close requested.');
    } catch (e) {
      console.warn('end session failed', e);
      alert('End session attempt failed; check console');
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
      // initialize remaining seconds
      const secs = (sessionDurationMinutes || 50) * 60;
      setRemainingSeconds(secs);
      timerRef.current = window.setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev === null) return prev;
          if (prev <= 1) {
            // time's up
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

  useEffect(() => {
    if (!whiteboardRoom || !whiteboardRef.current) return;
    try {
      whiteboardRoom.bindHtmlElement(whiteboardRef.current);
      if (typeof whiteboardRoom.refreshViewSize === 'function') {
        whiteboardRoom.refreshViewSize();
      }
      if (typeof whiteboardRoom.setViewMode === 'function') {
        try { whiteboardRoom.setViewMode('Freedom'); } catch {}
      }
      if (typeof whiteboardRoom.disableDeviceInputs === 'function') {
        try { whiteboardRoom.disableDeviceInputs(false); } catch {}
      }
      if (typeof whiteboardRoom.disableOperations === 'function') {
        try { whiteboardRoom.disableOperations(false); } catch {}
      }
    } catch (err) {
      console.warn('Failed to bind whiteboard element', err);
    }
  }, [whiteboardRoom]);

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* Left: Whiteboard (flexible) */}
      <div style={{ flex: 1, minWidth: 560, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 1000 }}>
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div>Whiteboard</div>
                {remainingSeconds !== null && (
                  <div style={{ color: 'red', fontWeight: 600, marginLeft: 8 }}>{Math.floor((remainingSeconds || 0) / 60)}:{String((remainingSeconds || 0) % 60).padStart(2, '0')}</div>
                )}
              </div>
          </div>
          <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            <EnhancedWhiteboard room={whiteboardRoom} width={900} height={640} className="flex-1" />
          </div>
        </div>
      </div>

      {/* Right: Video previews and controls (fixed width) */}
      <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {mounted && (
              <button onClick={() => { try { const su = getStoredUser() || { email: 'dev@local', plan: 'pro' }; const updated = { ...su, role: 'admin', displayName: su.displayName ?? 'Dev Admin' } as any; setStoredUser(updated); window.location.reload(); } catch (e) { try { const raw = localStorage.getItem('tutor_mock_user'); const parsed = raw ? JSON.parse(raw) : { email: 'dev@local', plan: 'pro' }; parsed.role = 'admin'; parsed.displayName = parsed.displayName || 'Dev Admin'; localStorage.setItem('tutor_mock_user', JSON.stringify(parsed)); window.location.reload(); } catch {} } }} style={{ marginRight: 8 }}>Dev: Make admin</button>
            )}
            {mounted && (
              <>
                <button onClick={() => { try { const url = `${window.location.origin}/classroom?courseId=${encodeURIComponent(courseId)}`; window.open(url, '_blank', 'noopener'); } catch (e) { console.warn('open classroom link failed', e); } }} style={{ marginRight: 6 }}>Open Classroom Link</button>
                <button onClick={async () => { try { const url = `${window.location.origin}/classroom?courseId=${encodeURIComponent(courseId)}`; await navigator.clipboard.writeText(url); alert('課堂連結已複製到剪貼簿'); } catch (e) { try { const url = `${window.location.origin}/classroom?courseId=${encodeURIComponent(courseId)}`; (window as any).prompt('Copy this link', url); } catch {} } }} >Copy Link</button>
              </>
            )}
          </div>
        </div>

        <div style={{ background: '#111', padding: 12, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 320, height: 200, background: '#000', borderRadius: 6, overflow: 'hidden' }}>
              <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ color: '#fff', fontSize: 12 }}>{(urlRole === 'teacher' || computedRole === 'teacher') ? 'Teacher' : 'Student'}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 320, height: 200, background: '#000', borderRadius: 6, overflow: 'hidden' }}>
              <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ color: '#fff', fontSize: 12 }}>{firstRemote ? `${(urlRole === 'teacher' || computedRole === 'teacher') ? 'Student' : 'Teacher'} ${firstRemote.uid}` : ((urlRole === 'teacher' || computedRole === 'teacher') ? 'Student' : 'Teacher')}</div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mounted && (isAdmin || computedRole === 'teacher' || computedRole === 'student') && (
              <>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 12, color: '#ccc' }}>Mic:</label>
                  <select value={selectedAudioDeviceId ?? ''} onChange={(e) => setSelectedAudioDeviceId(e.target.value || null)} style={{ fontSize: 12 }}>
                    {audioInputs.length === 0 && <option value="">(no microphones)</option>}
                    {audioInputs.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>))}
                  </select>
                  <button onClick={() => { testingMic ? stopMicTest() : startMicTest(); }}>{testingMic ? 'Stop Mic Test' : 'Test Mic'}</button>
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 12, color: '#ccc' }}>Cam:</label>
                  <select value={selectedVideoDeviceId ?? ''} onChange={(e) => setSelectedVideoDeviceId(e.target.value || null)} style={{ fontSize: 12 }}>
                    {videoInputs.length === 0 && <option value="">(no cameras)</option>}
                    {videoInputs.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>))}
                  </select>
                  <button onClick={() => { previewingCamera ? stopCameraPreview() : startCameraPreview(); }}>{previewingCamera ? 'Stop Preview' : 'Preview Camera'}</button>
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button onClick={requestPermissions} style={{ background: permissionGranted ? '#4caf50' : '#ff9800', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4 }}>{permissionGranted ? '✓ 權限已授予' : '⚠ 請求權限'}</button>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ fontSize: 12, color: '#ccc' }}>Mic</label>
                  <button onClick={() => setWantPublishAudio((s) => !s)} disabled={hasAudioInput === false}>{wantPublishAudio ? 'On' : 'Off'}</button>
                  <label style={{ fontSize: 12, color: '#ccc', marginLeft: 8 }}>Cam</label>
                  <button onClick={() => setWantPublishVideo((s) => !s)} disabled={hasVideoInput === false}>{wantPublishVideo ? 'On' : 'Off'}</button>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  {(() => {
                    const joinDisabled = loading || joined || !canJoin;
                    return (
                      <button
                        onClick={() => join({ publishAudio: wantPublishAudio, publishVideo: wantPublishVideo })}
                        disabled={joinDisabled}
                        style={{
                          background: joinDisabled ? '#9CA3AF' : undefined,
                          color: joinDisabled ? 'white' : undefined,
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: 4,
                          cursor: joinDisabled ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Join
                      </button>
                    );
                  })()}
                  <button onClick={() => leave()} disabled={!joined}>Leave</button>
                  <button
                    onClick={endSession}
                    disabled={!(isAdmin || computedRole === 'teacher')}
                    style={{
                      background: !(isAdmin || computedRole === 'teacher') ? '#9CA3AF' : undefined,
                      color: !(isAdmin || computedRole === 'teacher') ? 'white' : undefined,
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: 4,
                      cursor: !(isAdmin || computedRole === 'teacher') ? 'not-allowed' : 'pointer'
                    }}
                  >
                    End Session
                  </button>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: '#c7c7c7' }}>
                  <div><strong>Leave</strong>: 只離開目前這個瀏覽器分頁或裝置；不會影響其他參與者。</div>
                  <div><strong>End Session</strong>: 向伺服器請求正式結束課堂，可能會關閉白板並使所有參與者離開（只有授課者或管理員可執行）。</div>
                  {remainingSeconds !== null && (
                    <div style={{ marginTop: 6 }}>
                      <strong>剩餘時間：</strong> {Math.floor((remainingSeconds || 0) / 60)}:{String((remainingSeconds || 0) % 60).padStart(2, '0')}
                    </div>
                  )}
                </div>
              </>
            )}
            {loading && <div style={{ color: '#ccc' }}>Joining...</div>}
            {error && <div style={{ color: 'salmon' }}>{error}</div>}
          </div>
        </div>

        {/* Video quality controls */}
        <VideoControls currentQuality={currentQuality} isLowLatencyMode={isLowLatencyMode} onQualityChange={setVideoQuality} onLowLatencyToggle={setLowLatencyMode} hasVideo={hasVideoInput === true} />
      </div>
    </div>
  );
};

export default ClientClassroom;

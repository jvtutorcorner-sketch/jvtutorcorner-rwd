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
  const course = COURSES.find((c) => c.id === courseId) || null;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // determine role from stored user + course mapping
  const storedUser = typeof window !== 'undefined' ? getStoredUser() : null;
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
    role: computedRole,
    isOneOnOne: true, // 启用1对1优化
    defaultQuality: 'high' // 默认高质量
  });

  const firstRemote = useMemo(() => remoteUsers?.[0] ?? null, [remoteUsers]);

  const [hasAudioInput, setHasAudioInput] = useState<boolean | null>(null);
  const [hasVideoInput, setHasVideoInput] = useState<boolean | null>(null);
  const [wantPublishAudio, setWantPublishAudio] = useState(true);
  const [wantPublishVideo, setWantPublishVideo] = useState(true);

  // Device lists and selections (Google Meet-like UI)
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(null);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

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
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ marginBottom: 12 }}>
          {/* Dev helper: mark current stored user as admin for testing Join button */}
          {mounted && (
            <button
              onClick={() => {
                try {
                  const su = getStoredUser() || { email: 'dev@local', plan: 'pro' };
                  const updated = { ...su, role: 'admin', displayName: su.displayName ?? 'Dev Admin' } as any;
                  setStoredUser(updated);
                  // reload so UI reflects role change
                  window.location.reload();
                } catch (e) {
                  // fallback: directly set localStorage
                  try {
                    const raw = localStorage.getItem('tutor_mock_user');
                    const parsed = raw ? JSON.parse(raw) : { email: 'dev@local', plan: 'pro' };
                    parsed.role = 'admin';
                    parsed.displayName = parsed.displayName || 'Dev Admin';
                    localStorage.setItem('tutor_mock_user', JSON.stringify(parsed));
                    window.location.reload();
                  } catch {}
                }
              }}
              style={{ marginLeft: 12 }}
            >
              Dev: Make admin
            </button>
          )}
          {/* Open / copy classroom link for testing */}
          {mounted && (
            <>
              <button
                onClick={() => {
                  try {
                    const url = `${window.location.origin}/classroom?courseId=${encodeURIComponent(courseId)}`;
                    window.open(url, '_blank', 'noopener');
                  } catch (e) {
                    console.warn('open classroom link failed', e);
                  }
                }}
                style={{ marginLeft: 8 }}
              >
                Open Classroom Link
              </button>
              <button
                onClick={async () => {
                  try {
                    const url = `${window.location.origin}/classroom?courseId=${encodeURIComponent(courseId)}`;
                    await navigator.clipboard.writeText(url);
                    alert('課堂連結已複製到剪貼簿');
                  } catch (e) {
                    try {
                      const url = `${window.location.origin}/classroom?courseId=${encodeURIComponent(courseId)}`;
                      (window as any).prompt('Copy this link', url);
                    } catch {}
                  }
                }}
                style={{ marginLeft: 8 }}
              >
                Copy Link
              </button>
            </>
          )}

          {/* Only show join/leave controls to teachers or admin users for testing (render only after mount to avoid hydration mismatch) */}
          {mounted && (isAdmin || computedRole === 'teacher') && (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <label style={{ fontSize: 12, color: '#666' }}>Microphone:</label>
                  <select
                    value={selectedAudioDeviceId ?? ''}
                    onChange={(e) => setSelectedAudioDeviceId(e.target.value || null)}
                    style={{ fontSize: 12 }}
                  >
                    {audioInputs.length === 0 && <option value="">(no microphones)</option>}
                    {audioInputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>
                    ))}
                  </select>
                  <button onClick={() => { testingMic ? stopMicTest() : startMicTest(); }} style={{ marginLeft: 6 }}>
                    {testingMic ? 'Stop Mic Test' : 'Test Mic'}
                  </button>
                  <div style={{ width: 80, height: 8, background: '#222', borderRadius: 4, overflow: 'hidden', marginLeft: 6 }}>
                    <div style={{ width: `${Math.round(micLevel * 100)}%`, height: '100%', background: micLevel > 0.6 ? '#e44' : '#3c3', transition: 'width 100ms linear' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <label style={{ fontSize: 12, color: '#666' }}>Camera:</label>
                  <select
                    value={selectedVideoDeviceId ?? ''}
                    onChange={(e) => setSelectedVideoDeviceId(e.target.value || null)}
                    style={{ fontSize: 12 }}
                  >
                    {videoInputs.length === 0 && <option value="">(no cameras)</option>}
                    {videoInputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>
                    ))}
                  </select>
                  <button onClick={() => { previewingCamera ? stopCameraPreview() : startCameraPreview(); }} style={{ marginLeft: 6 }}>
                    {previewingCamera ? 'Stop Preview' : 'Preview Camera'}
                  </button>
                </div>

                <div style={{ marginLeft: 8 }}>
                  <button 
                    onClick={requestPermissions}
                    style={{
                      background: permissionGranted ? '#4caf50' : '#ff9800',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: 4,
                      cursor: 'pointer'
                    }}
                  >
                    {permissionGranted ? '✓ 權限已授予' : '⚠ 請求權限'}
                  </button>
                </div>
              </div>
              <span style={{ marginLeft: 12, marginRight: 8 }}>
                <label style={{ fontSize: 12, color: '#666' }}>Mic:</label>
                <button
                  onClick={() => setWantPublishAudio((s) => !s)}
                  disabled={hasAudioInput === false}
                  style={{ marginLeft: 6 }}
                >
                  {wantPublishAudio ? 'On' : 'Off'}
                </button>
              </span>

              <span style={{ marginRight: 8 }}>
                <label style={{ fontSize: 12, color: '#666' }}>Cam:</label>
                <button
                  onClick={() => setWantPublishVideo((s) => !s)}
                  disabled={hasVideoInput === false}
                  style={{ marginLeft: 6 }}
                >
                  {wantPublishVideo ? 'On' : 'Off'}
                </button>
              </span>

              <button onClick={() => join({ publishAudio: wantPublishAudio, publishVideo: wantPublishVideo })} disabled={loading || joined} style={{ marginLeft: 8 }}>
                Join
              </button>
              <button onClick={() => leave()} disabled={!joined} style={{ marginLeft: 8 }}>
                Leave
              </button>
              <button
                onClick={async () => {
                  try {
                    // attempt local cleanup
                    await leave();
                    // clear debug global
                    try { (window as any).__wbRoom = null; } catch {}
                    // ask server to close whiteboard room if known
                    if (whiteboardMeta?.uuid) {
                      await fetch('/api/agora/whiteboard/close', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ uuid: whiteboardMeta.uuid }),
                      });
                    }
                    alert('Session ended locally; server close requested.');
                  } catch (e) {
                    console.warn('end session failed', e);
                    alert('End session attempt failed; check console');
                  }
                }}
                style={{ marginLeft: 8 }}
              >
                End Session
              </button>
            </>
          )}
          {loading && <span style={{ marginLeft: 12 }}>Joining...</span>}
          {error && <span style={{ marginLeft: 12, color: 'red' }}>{error}</span>}
        </div>

        <div style={{ position: 'relative', height: 360, background: '#111', marginRight: 16 }}>
          <div style={{ position: 'absolute', left: 12, top: 12 }}>
            <div style={{ width: 320, height: 240, background: '#000' }}>
              <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ color: '#fff', fontSize: 12, marginTop: 6 }}>Local</div>
          </div>

          <div style={{ position: 'absolute', right: 12, top: 12 }}>
            <div style={{ width: 320, height: 240, background: '#000' }}>
              <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ color: '#fff', fontSize: 12, marginTop: 6 }}>{firstRemote ? `Remote ${firstRemote.uid}` : 'Remote'}</div>
          </div>
        </div>

        {/* 视频控制面板 */}
        <VideoControls
          currentQuality={currentQuality}
          isLowLatencyMode={isLowLatencyMode}
          onQualityChange={setVideoQuality}
          onLowLatencyToggle={setLowLatencyMode}
          hasVideo={hasVideoInput === true}
        />
      </div>

      <div style={{ width: 640 }}>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div>Whiteboard</div>
          {/* Simple toolbar: always show Pencil/Eraser (queue if room missing) */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => {
                setWhiteboardTool('pencil');
              }}
            >
              Pencil
            </button>

            {/* color picker for pencil (default black) */}
            <input
              aria-label="Pen color"
              type="color"
              value={penColor}
              onChange={(e) => {
                const v = e.target.value;
                setPenColor(v);
                setWhiteboardColor(v);
              }}
              style={{ width: 40, height: 28, padding: 0, border: 'none', background: 'transparent' }}
            />

            <button
              onClick={() => {
                setWhiteboardTool('eraser');
              }}
            >
              Eraser
            </button>

            {/* Additional controls shown when room exists */}
            {whiteboardRoom && (
              <>
                <button
                  onClick={() => {
                    try {
                      const r: any = whiteboardRoom;
                      if (typeof r.undo === 'function') {
                        r.undo();
                        return;
                      }
                      if (typeof r.undoStep === 'function') { r.undoStep(); return; }
                      if (typeof r.undoLocal === 'function') { r.undoLocal(); return; }
                      console.warn('No undo API found on whiteboard room');
                    } catch (e) {
                      console.warn('undo failed', e);
                    }
                  }}
                >
                  Undo
                </button>
                <button
                  onClick={() => {
                    try {
                      const r: any = whiteboardRoom;
                      if (typeof r.redo === 'function') { r.redo(); return; }
                      if (typeof r.redoStep === 'function') { r.redoStep(); return; }
                      if (typeof r.redoLocal === 'function') { r.redoLocal(); return; }
                      console.warn('No redo API found on whiteboard room');
                    } catch (e) {
                      console.warn('redo failed', e);
                    }
                  }}
                >
                  Redo
                </button>
                <button
                  onClick={() => {
                    try {
                      const r: any = whiteboardRoom;
                      if (typeof r.cleanCurrentAppliance === 'function') { r.cleanCurrentAppliance(); return; }
                      if (typeof r.removeAllAttachments === 'function') { r.removeAllAttachments(); return; }
                      if (typeof r.clear === 'function') { r.clear(); return; }
                      if (typeof r.removeAll === 'function') { r.removeAll(); return; }
                      console.warn('No clear API found on whiteboard room');
                    } catch (e) {
                      console.warn('clear failed', e);
                    }
                  }}
                >
                  Clear
                </button>
                <button onClick={() => listWhiteboardMethods()}>List Methods</button>
              </>
            )}
          </div>
        </div>
        <EnhancedWhiteboard
          room={whiteboardRoom}
          width={800}
          height={680}
          className="flex-1"
        />
      </div>
    </div>
  );
};

export default ClientClassroom;

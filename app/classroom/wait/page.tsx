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

  const sessionReadyKey = `classroom_session_ready_${courseId}_${orderId ?? 'noorder'}`;
  const [participants, setParticipants] = useState<Array<{ role: string; email?: string }>>([]);
  const [ready, setReady] = useState(false);
  const [roomUuid, setRoomUuid] = useState<string | null>(null);
  const [currentQuality, setCurrentQuality] = useState<VideoQuality>('high');
  const [isLowLatencyMode, setIsLowLatencyMode] = useState(false);
  const pollRef = useRef<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setCourseId(params.get('courseId') ?? 'c1');
    setOrderId(params.get('orderId') ?? null);
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
    try {
      const raw = localStorage.getItem(sessionReadyKey);
      console.log('readReady called:', { sessionReadyKey, raw, role, email: storedUserState?.email, time: new Date().toISOString() });
      const arr = raw ? JSON.parse(raw) as Array<{ role: string; email?: string }> : [];
      setParticipants(arr);
      const email = storedUserState?.email;
      const selfMarked = role ? arr.some((p) => p.role === role && p.email === email) : false;
      console.log('readReady parsed:', { arr, email, selfMarked });
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
    
    try {
      const channel = new BroadcastChannel(sessionReadyKey);
      bcRef.current = channel;
      
      channel.onmessage = (ev) => {
        console.log('BroadcastChannel message received:', ev.data, 'key:', sessionReadyKey, new Date().toISOString());
        // Force immediate re-read from localStorage
        setTimeout(() => {
          const raw = localStorage.getItem(sessionReadyKey);
          console.log('After BC message, localStorage value:', raw);
          // Re-read and parse the ready state
          try {
            const arr = raw ? JSON.parse(raw) as Array<{ role: string; email?: string }> : [];
            setParticipants(arr);
            // Re-check if current user is marked ready
            const currentRole = new URLSearchParams(window.location.search).get('role') as 'teacher' | 'student' | null;
            const email = getStoredUser()?.email;
            const selfMarked = currentRole ? arr.some((p) => p.role === currentRole && p.email === email) : false;
            setReady(selfMarked);
            console.log('After BC, updated state:', { arr, selfMarked, currentRole, email });
          } catch (e) {
            console.error('Failed to parse after BC message:', e);
          }
        }, 10);
      };
      
      // Test that BroadcastChannel is working by sending a test message
      setTimeout(() => {
        console.log('BroadcastChannel test: sending test message');
        channel.postMessage({ type: 'test', timestamp: Date.now() });
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
    
    // Re-enable server-backed SSE for cross-device synchronization
    const syncUuid = sessionReadyKey; // Use sessionReadyKey as UUID for synchronization
    if (syncUuid) {
      // initial fetch to populate state
      fetch(`/api/classroom/ready?uuid=${encodeURIComponent(syncUuid)}`).then((r) => r.json()).then((j) => {
        console.log('Initial server sync:', j);
        setParticipants(j.participants || []);
      }).catch((e) => console.warn('Initial server sync failed:', e));
      
      // clear any existing poll
      if (pollRef.current) { window.clearInterval(pollRef.current!); pollRef.current = null; }
      // close any existing EventSource
      try { esRef.current?.close(); } catch (e) {}
      try {
        const es = new EventSource(`/api/classroom/stream?uuid=${encodeURIComponent(syncUuid)}`);
        es.onopen = () => {
          console.log('SSE connection opened successfully');
          // Clear any polling fallback when SSE reconnects
          if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
        };
        
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            console.log('SSE message received:', data);
            
            // Handle different message types
            if (data.type === 'connected') {
              console.log('SSE connected successfully for uuid:', data.uuid);
            } else if (data.type === 'ping') {
              // Keep-alive ping, ignore
              console.log('SSE ping received');
            } else {
              // Regular data message
              setParticipants(data.participants || []);
            }
          } catch (e) {
            console.warn('SSE message parse error:', e);
          }
        };
        es.onerror = (err) => {
          console.warn('SSE error:', err);
          console.log('SSE readyState:', es.readyState, 'url:', es.url);
          
          // Don't fallback to polling immediately, try to reconnect
          if (es.readyState === EventSource.CLOSED) {
            console.log('SSE connection closed, attempting to reconnect...');
            setTimeout(() => {
              // The EventSource will automatically reconnect, but we can help by re-initializing
              if (pollRef.current) window.clearInterval(pollRef.current);
              pollRef.current = window.setInterval(() => {
                fetch(`/api/classroom/ready?uuid=${encodeURIComponent(syncUuid)}`).then((r) => r.json()).then((j) => {
                  setParticipants(j.participants || []);
                }).catch((e) => console.warn('Polling fallback failed:', e));
              }, 5000) as unknown as number; // Increased to 5 seconds for less frequent polling
            }, 1000);
          }
        };
        esRef.current = es;
      } catch (e) {
        console.warn('EventSource creation failed, falling back to polling:', e);
        // fallback: polling
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = window.setInterval(() => {
          fetch(`/api/classroom/ready?uuid=${encodeURIComponent(syncUuid)}`).then((r) => r.json()).then((j) => {
            setParticipants(j.participants || []);
          }).catch(() => {});
        }, 2000) as unknown as number;
      }
    }

    return () => {
      if (pollRef.current) { window.clearInterval(pollRef.current!); pollRef.current = null; }
      try { esRef.current?.close(); } catch (e) {}
      esRef.current = null;
    };
  }, [sessionReadyKey]);


  const toggleReady = () => {
    try {
      const email = storedUserState?.email;
      console.log('toggleReady called:', { sessionReadyKey, role, email, ready });

      // Re-enable server API for cross-device synchronization
      const syncUuid = sessionReadyKey;
      if (syncUuid) {
        // server-backed: POST ready state to server
        fetch('/api/classroom/ready', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ uuid: syncUuid, role, email, ready: !ready }),
        }).then((r) => r.json()).then((j) => {
          console.log('Server ready update response:', j);
          setParticipants(j.participants || []);
          setReady(!ready);
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
    const raw = localStorage.getItem(sessionReadyKey);
    const arr = raw ? JSON.parse(raw) as Array<{ role: string; email?: string }> : [];
    const email = storedUserState?.email;

    // Check if current user is already in the array
    const existingIndex = role ? arr.findIndex((p) => p.role === role && p.email === email) : -1;

    let filtered: Array<{ role: string; email?: string }>;
    let newReadyState: boolean;

    if (existingIndex >= 0) {
      // User is ready, remove them (toggle off)
      filtered = arr.filter((_, i) => i !== existingIndex);
      newReadyState = false;
    } else {
      // User is not ready, add them (toggle on)
      filtered = [...arr, { role: role!, email }];
      newReadyState = true;
    }

    console.log('toggleReady localStorage:', {
      role,
      email,
      currentReady: ready,
      existingIndex,
      arr,
      filtered,
      newReadyState,
      sessionReadyKey
    });

    localStorage.setItem(sessionReadyKey, JSON.stringify(filtered));
    try { window.dispatchEvent(new StorageEvent('storage', { key: sessionReadyKey, newValue: JSON.stringify(filtered) })); } catch (e) {}
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
    // cleanup on unmount
    return () => {
      try {
        const raw = localStorage.getItem(sessionReadyKey);
        const arr = raw ? JSON.parse(raw) as Array<{ role: string; email?: string }> : [];
        const email = storedUserState?.email;
        const filtered = role ? arr.filter((p) => !(p.role === role && p.email === email)) : arr;
        localStorage.setItem(sessionReadyKey, JSON.stringify(filtered));
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReadyKey, role, storedUserState]);

  const hasTeacher = participants.some((p) => p.role === 'teacher');
  const hasStudent = participants.some((p) => p.role === 'student');
  const canEnter = hasTeacher && hasStudent;

  const enterClassroom = () => {
    const target = `/classroom/test?courseId=${encodeURIComponent(courseId)}${orderId ? `&orderId=${encodeURIComponent(orderId)}` : ''}${role ? `&role=${encodeURIComponent(role)}` : ''}`;
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
    <div style={{ padding: 24 }}>
      <h2>等待進入教室</h2>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600 }}>{course?.title ?? '課程'}</div>
        <div style={{ marginTop: 8 }}>課程 ID: {courseId}</div>
        {orderId && <div>訂單 ID: {orderId}</div>}
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={toggleReady} style={{ padding: '8px 12px', background: ready ? '#4caf50' : '#ff9800', color: 'white', border: 'none', borderRadius: 4 }}>
          {ready ? '已準備，取消準備' : '按我準備'}
        </button>
        <div style={{ color: '#666' }}>
          角色：{role ? (role === 'teacher' ? '授課者 (Teacher)' : '學生 (Student)') : '—'}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ marginBottom: 8 }}>目前狀態：</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
            <div style={{ fontWeight: 600 }}>Teacher</div>
            <div style={{ marginTop: 6 }}>{hasTeacher ? '已就緒' : '等待中'}</div>
          </div>
          <div style={{ padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
            <div style={{ fontWeight: 600 }}>Student</div>
            <div style={{ marginTop: 6 }}>{hasStudent ? '已就緒' : '等待中'}</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <button onClick={enterClassroom} disabled={!canEnter} style={{ padding: '8px 14px', background: canEnter ? '#2563eb' : '#9ca3af', color: 'white', border: 'none', borderRadius: 6 }}>
          進入教室
        </button>
        <div style={{ display: 'inline-flex', gap: 8, marginLeft: 12 }}>
          <button onClick={async () => { try { const url = `${window.location.origin}/classroom?courseId=${encodeURIComponent(courseId)}`; await navigator.clipboard.writeText(url); alert('課堂連結已複製到剪貼簿'); } catch (e) { try { const url = `${window.location.origin}/classroom?courseId=${encodeURIComponent(courseId)}`; (window as any).prompt('Copy this link', url); } catch {} } }} style={{ padding: '8px 12px' }}>Copy Link</button>
        </div>
        <div style={{ marginTop: 8, color: '#666' }}>此頁可在沒有 `orderId` 的情況下使用；系統仍會以 Teacher/Student 雙方都已準備為準。</div>
      </div>
      
      {/* Video / Audio setup: moved from classroom page */}
      <div style={{ marginTop: 20, padding: 12, border: '1px solid #eee', borderRadius: 8, maxWidth: 720 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>視訊設定 (可在進入教室前預覽與選擇裝置)</div>
        <VideoSetup />
      </div>

      {/* Video quality controls */}
      <div style={{ marginTop: 20, maxWidth: 720 }}>
        <VideoControls currentQuality={currentQuality} isLowLatencyMode={isLowLatencyMode} onQualityChange={setCurrentQuality} onLowLatencyToggle={setIsLowLatencyMode} hasVideo={true} />
      </div>
    </div>
  );
}

function VideoSetup() {
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
        // ignore
      }
    };
    updateDevices();
    try { navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener('devicechange', updateDevices); } catch (e) {}
    return () => { mounted = false; try { navigator.mediaDevices && navigator.mediaDevices.removeEventListener && navigator.mediaDevices.removeEventListener('devicechange', updateDevices); } catch (e) {} };
  }, []);

  const requestPermissions = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setPermissionGranted(true);
      // stop instantly
      s.getTracks().forEach((t) => t.stop());
    } catch (e) {
      setPermissionGranted(false);
      alert('請允許相機與麥克風權限，或檢查裝置是否被其他程式佔用。');
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
    } catch (e) {
      console.warn('startCameraPreview failed', e);
      alert('無法啟動相機預覽，請確認已授予權限且相機未被其他應用程式使用。');
      setPreviewingCamera(false);
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

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ width: '100%', maxWidth: 340, background: '#111', padding: 12, borderRadius: 8, color: '#fff' }}>
        <div style={{ width: '100%', height: 200, background: '#000', borderRadius: 6, overflow: 'hidden' }}>
          <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div style={{ marginTop: 8, fontSize: 12 }}>本地預覽</div>
      </div>
      <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#444' }}>麥克風</label>
          <select value={selectedAudioDeviceId ?? ''} onChange={(e) => setSelectedAudioDeviceId(e.target.value || null)} style={{ fontSize: 12 }}>
            {audioInputs.length === 0 && <option value="">(no microphones)</option>}
            {audioInputs.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>))}
          </select>
          <button onClick={() => { testingMic ? stopMicTest() : startMicTest(); }}>{testingMic ? '停止測試' : '測試麥克風'}</button>
          <div style={{ width: 120, height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${micLevel}%`, height: '100%', background: '#4caf50' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#444' }}>攝影機</label>
          <select value={selectedVideoDeviceId ?? ''} onChange={(e) => setSelectedVideoDeviceId(e.target.value || null)} style={{ fontSize: 12 }}>
            {videoInputs.length === 0 && <option value="">(no cameras)</option>}
            {videoInputs.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>))}
          </select>
          <button onClick={() => { previewingCamera ? stopCameraPreview() : startCameraPreview(); }}>{previewingCamera ? '停止預覽' : '預覽攝影機'}</button>
          <button onClick={requestPermissions} style={{ background: permissionGranted ? '#4caf50' : '#ff9800', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 4 }}>{permissionGranted ? '權限已授予' : '請求權限'}</button>
        </div>

        <div style={{ color: '#666', fontSize: 13 }}>選擇完畢後，系統會記住您的裝置偏好並應用於進入教室的設定。</div>
      </div>
    </div>
  );
}

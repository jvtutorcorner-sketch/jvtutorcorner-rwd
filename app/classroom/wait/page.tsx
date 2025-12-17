"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { COURSES } from '@/data/courses';
import { getStoredUser } from '@/lib/mockAuth';

export default function ClassroomWaitPage() {
  const router = useRouter();

  const [courseId, setCourseId] = useState('c1');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [storedUserState, setStoredUserState] = useState<any>(null);
  const [role, setRole] = useState<'teacher' | 'student' | null>(null);

  const course = COURSES.find((c) => c.id === courseId) || null;

  const sessionReadyKey = `classroom_session_ready`;
  const [participants, setParticipants] = useState<Array<{ role: string; email?: string }>>([]);
  const [ready, setReady] = useState(false);
  const [roomUuid, setRoomUuid] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const esRef = useRef<EventSource | null>(null);

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

  const readReady = () => {
    try {
      const raw = localStorage.getItem(sessionReadyKey);
      const arr = raw ? JSON.parse(raw) as Array<{ role: string; email?: string }> : [];
      setParticipants(arr);
      const email = storedUserState?.email;
      const selfMarked = role ? arr.some((p) => p.role === role && p.email === email) : false;
      setReady(selfMarked);
    } catch (e) {
      setParticipants([]);
      setReady(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onStorage = (ev: StorageEvent) => {
      if (!ev.key || ev.key === sessionReadyKey) readReady();
    };
    window.addEventListener('storage', onStorage);

    // if we have a server-backed room uuid, subscribe to SSE (server-push)
    if (roomUuid) {
      // initial fetch to populate state
      fetch(`/api/classroom/ready?uuid=${encodeURIComponent(roomUuid)}`).then((r) => r.json()).then((j) => setParticipants(j.participants || [])).catch(() => {});
      // clear any existing poll
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      // close any existing EventSource
      try { esRef.current?.close(); } catch (e) {}
      try {
        const es = new EventSource(`/api/classroom/stream?uuid=${encodeURIComponent(roomUuid)}`);
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            setParticipants(data.participants || []);
          } catch (e) {}
        };
        es.onerror = (err) => {
          // allow automatic EventSource reconnection; log for debug
          // console.warn('classroom SSE error', err);
        };
        esRef.current = es;
      } catch (e) {
        // fallback: short-polling if EventSource cannot be created
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = window.setInterval(() => {
          fetch(`/api/classroom/ready?uuid=${encodeURIComponent(roomUuid)}`).then((r) => r.json()).then((j) => setParticipants(j.participants || [])).catch(() => {});
        }, 1000) as unknown as number;
      }
    } else {
      // fallback to localStorage/BroadcastChannel behavior
      readReady();
      // BroadcastChannel for more reliable same-origin tab messaging
      let bc: BroadcastChannel | null = null;
      try {
        // @ts-ignore
        bc = new BroadcastChannel('classroom_session_ready');
        bc.onmessage = () => readReady();
      } catch (e) {
        bc = null;
      }
    }

    return () => {
      window.removeEventListener('storage', onStorage);
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      try { esRef.current?.close(); } catch (e) {}
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReadyKey, role, storedUserState, roomUuid]);

  // ensure BroadcastChannel closed when component unmounts
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try { bc = new BroadcastChannel('classroom_session_ready'); } catch (e) { bc = null; }
    return () => { try { bc?.close(); } catch (e) {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const toggleReady = () => {
    try {
      const email = storedUserState?.email;
      if (roomUuid) {
        // server-backed: POST ready state to server
        fetch('/api/classroom/ready', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ uuid: roomUuid, role, email, ready: !ready }),
        }).then((r) => r.json()).then((j) => setParticipants(j.participants || [])).catch((e) => console.warn(e));
        setReady((r) => !r);
      } else {
        const raw = localStorage.getItem(sessionReadyKey);
        const arr = raw ? JSON.parse(raw) as Array<{ role: string; email?: string }> : [];
        const filtered = role ? arr.filter((p) => !(p.role === role && p.email === email)) : arr;
        if (!ready && role) filtered.push({ role, email });
        localStorage.setItem(sessionReadyKey, JSON.stringify(filtered));
        try { window.dispatchEvent(new StorageEvent('storage', { key: sessionReadyKey, newValue: JSON.stringify(filtered) })); } catch (e) {}
        // also notify other tabs via BroadcastChannel when available
        try {
          // @ts-ignore
          const bc = new BroadcastChannel('classroom_session_ready');
          bc.postMessage({ type: 'ready-updated' });
          try { bc.close(); } catch (e) {}
        } catch (e) {}
        readReady();
        setReady((r) => !r);
      }
    } catch (e) {
      console.warn('toggleReady failed', e);
    }
  };

  // ensure we have a whiteboard room UUID to key server readiness (create if needed)
  useEffect(() => {
    if (roomUuid || typeof window === 'undefined') return;
    fetch('/api/netless/room', { method: 'POST', body: JSON.stringify({}) }).then((r) => r.json()).then((j) => {
      if (j && j.uuid) setRoomUuid(j.uuid);
    }).catch(() => {});
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
          <button onClick={() => { try { const url = `${window.location.origin}/classroom?courseId=${encodeURIComponent(courseId)}`; window.open(url, '_blank', 'noopener'); } catch (e) { console.warn('open classroom link failed', e); } }} style={{ padding: '8px 12px' }}>Open Classroom Link</button>
          <button onClick={async () => { try { const url = `${window.location.origin}/classroom?courseId=${encodeURIComponent(courseId)}`; await navigator.clipboard.writeText(url); alert('課堂連結已複製到剪貼簿'); } catch (e) { try { const url = `${window.location.origin}/classroom?courseId=${encodeURIComponent(courseId)}`; (window as any).prompt('Copy this link', url); } catch {} } }} style={{ padding: '8px 12px' }}>Copy Link</button>
        </div>
        <div style={{ marginTop: 8, color: '#666' }}>此頁可在沒有 `orderId` 的情況下使用；系統仍會以 Teacher/Student 雙方都已準備為準。</div>
      </div>
    </div>
  );
}

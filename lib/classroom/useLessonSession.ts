'use client';
// lib/classroom/useLessonSession.ts
//
// Client hook that wires a classroom to the Phase 3a lesson features. It resolves
// the deterministic lesson session (POST /api/lessons/resolve), lets the teacher
// drop markers (POST .../markers + RTM broadcast), and — host only — reports the
// class lifecycle + a 60s heartbeat as system events so the Timeline exists even
// with AI off. Everything is best-effort: a failure here never disrupts the class.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarkerType, SystemEventType } from '@/lib/lessonAI/eventTypes';

export interface RemoteMarker {
  type: MarkerType;
  note?: string;
  at: number;
  self?: boolean;
}

export interface UseLessonSessionOptions {
  courseId: string;
  orderId: string | null;
  isHost: boolean;
  enabled?: boolean;
  /** RTM broadcast (ClientClassroom's rtmSend); receives ('custom', payload). */
  rtmSend?: (type: string, payload: Record<string, unknown>) => void;
}

export interface LessonSessionApi {
  sessionId: string | null;
  ready: boolean;
  recentMarkers: RemoteMarker[];
  sendMarker: (type: MarkerType, note?: string) => Promise<boolean>;
  reportSystemEvent: (type: SystemEventType, payload?: Record<string, unknown>) => void;
  pushRemoteMarker: (m: { type: MarkerType; note?: string; at?: number }) => void;
  endLesson: () => void;
}

const TICK_MS = 60_000;
const FLUSH_MS = 15_000;

export function useLessonSession(opts: UseLessonSessionOptions): LessonSessionApi {
  const { courseId, orderId, isHost, enabled = true, rtmSend } = opts;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recentMarkers, setRecentMarkers] = useState<RemoteMarker[]>([]);

  const sessionIdRef = useRef<string | null>(null);
  const queueRef = useRef<Array<{ eventId: string; type: SystemEventType; clientTs: number; payload?: Record<string, unknown> }>>([]);
  const startedSentRef = useRef(false);

  const uid = () =>
    (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // ── Resolve / claim the lesson session on entry ──────────────────────────────
  useEffect(() => {
    if (!enabled || !courseId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/lessons/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courseId, ...(orderId ? { orderId } : {}) }),
        });
        const j = await res.json().catch(() => null);
        if (!cancelled && res.ok && j?.ok && typeof j.sessionId === 'string') {
          sessionIdRef.current = j.sessionId;
          setSessionId(j.sessionId);
        } else if (!cancelled) {
          console.warn('[useLessonSession] resolve failed', res.status, j?.error);
        }
      } catch (e) {
        if (!cancelled) console.warn('[useLessonSession] resolve error', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, courseId, orderId]);

  // ── System-event queue flush (host only) ─────────────────────────────────────
  const flush = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || queueRef.current.length === 0) return;
    const batch = queueRef.current.splice(0, queueRef.current.length);
    try {
      await fetch(`/api/lessons/${encodeURIComponent(sid)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
    } catch {
      // put them back for the next flush; drop if it grows unbounded
      if (queueRef.current.length < 200) queueRef.current.unshift(...batch);
    }
  }, []);

  const reportSystemEvent = useCallback(
    (type: SystemEventType, payload?: Record<string, unknown>) => {
      if (!isHost) return;
      queueRef.current.push({ eventId: uid(), type, clientTs: Date.now(), payload });
      if (type === 'class_started' || type === 'class_ended') void flush();
    },
    [isHost, flush]
  );

  // class_started once the session is ready; periodic tick; periodic flush.
  useEffect(() => {
    if (!isHost || !sessionId) return;
    if (!startedSentRef.current) {
      startedSentRef.current = true;
      reportSystemEvent('class_started');
    }
    const tick = setInterval(() => reportSystemEvent('tick'), TICK_MS);
    const flusher = setInterval(() => void flush(), FLUSH_MS);
    return () => {
      clearInterval(tick);
      clearInterval(flusher);
    };
  }, [isHost, sessionId, reportSystemEvent, flush]);

  const pushRemoteMarker = useCallback((m: { type: MarkerType; note?: string; at?: number }) => {
    setRecentMarkers((prev) => [...prev.slice(-9), { type: m.type, note: m.note, at: m.at ?? Date.now() }]);
  }, []);

  const sendMarker = useCallback(
    async (type: MarkerType, note?: string): Promise<boolean> => {
      const sid = sessionIdRef.current;
      if (!sid) return false;
      const at = Date.now();
      setRecentMarkers((prev) => [...prev.slice(-9), { type, note, at, self: true }]);
      // Broadcast so the other side sees it live (co-teacher / assistant).
      try {
        rtmSend?.('custom', { marker: { type, note, at } });
      } catch {
        /* ignore */
      }
      try {
        const res = await fetch(`/api/lessons/${encodeURIComponent(sid)}/markers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, note, clientTs: at }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [rtmSend]
  );

  const endLesson = useCallback(() => {
    reportSystemEvent('class_ended');
    void flush();
  }, [reportSystemEvent, flush]);

  return { sessionId, ready: !!sessionId, recentMarkers, sendMarker, reportSystemEvent, pushRemoteMarker, endLesson };
}

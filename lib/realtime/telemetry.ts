'use client';

// Client-side batching for RTC connection telemetry. Buffers events and flushes them to
// POST /api/realtime/telemetry — coalesced on a short timer, and via sendBeacon on
// pagehide so teardown-time events (leave, final session summary) still make it out.
// Fire-and-forget by design: telemetry must never disrupt a call, so every failure is
// swallowed. Used by the SFU provider and the whiteboard RTC block.

export type RtcTelemetryEvent =
  | 'join_ok'
  | 'join_fail'
  | 'ice_state'
  | 'ice_restart'
  | 'ice_degraded'
  | 'rejoin'
  | 'track_repull'
  | 'heartbeat_fail'
  | 'quality_step'
  | 'fallback_agora'
  | 'net_probe'
  | 'session_summary';

interface QueuedEvent {
  event: RtcTelemetryEvent;
  at: number;
  courseSessionId?: string;
  level?: 'INFO' | 'WARN' | 'ERROR';
  data?: Record<string, unknown>;
}

const ENDPOINT = '/api/realtime/telemetry';
const FLUSH_DELAY_MS = 4000;
const MAX_QUEUE = 20;

export class RtcTelemetry {
  private queue: QueuedEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pageHideBound = false;

  constructor(private readonly courseSessionId?: string) {
    if (typeof window !== 'undefined' && !this.pageHideBound) {
      window.addEventListener('pagehide', () => this.flush(true));
      this.pageHideBound = true;
    }
  }

  log(event: RtcTelemetryEvent, data?: Record<string, unknown>, level?: QueuedEvent['level']) {
    this.queue.push({ event, at: Date.now(), courseSessionId: this.courseSessionId, level, data });
    if (this.queue.length >= MAX_QUEUE) {
      this.flush(false);
      return;
    }
    if (!this.timer) this.timer = setTimeout(() => this.flush(false), FLUSH_DELAY_MS);
  }

  /** Send whatever is queued. `useBeacon` for teardown (pagehide / leave). */
  flush(useBeacon: boolean) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0, this.queue.length);
    const payload = JSON.stringify({ events });

    try {
      if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const ok = navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
        if (ok) return;
      }
      void fetch(ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: payload,
        keepalive: useBeacon,
        cache: 'no-store',
      }).catch(() => {});
    } catch {
      /* telemetry never disrupts a call */
    }
  }
}

/** Convenience for one-off contexts that don't hold an instance. */
export function reportRtcEvent(event: RtcTelemetryEvent, data?: Record<string, unknown>, courseSessionId?: string) {
  try {
    const payload = JSON.stringify({ events: [{ event, at: Date.now(), courseSessionId, data }] });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }))) return;
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
      cache: 'no-store',
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

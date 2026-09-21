'use client';

// Fake Cloudflare SFU environment for exercising the real useCloudflareSfuProvider
// self-healing (A2), quality adaptation (A3) and Agora-fallback (A4) wiring in a local
// headless e2e — WITHOUT real Cloudflare credentials or a media server. It replaces
// RTCPeerConnection, navigator.mediaDevices.getUserMedia, navigator.sendBeacon and
// fetch(/api/realtime/*) with controllable fakes. Dev/test only; imported solely by
// app/rtc-harness/page.tsx. The provider code under test is 100% real.

export interface HarnessControls {
  /** Current fake getStats sample the fake pc reports (drives A3). */
  stats: { rttMs: number; packetLoss: number; availableBitrate: number | null; limitation: string; freezes: number };
  /** When true, POST /api/realtime/room (heartbeat) returns 500 (drives heartbeat recovery). */
  failHeartbeat: boolean;
  /** When true, POST /api/realtime/session returns 503 so every (re)join fails (drives A4 give-up). */
  failSession: boolean;
  /** Incremented on every session POST — proves an automatic rejoin actually happened. */
  sessionCount: number;
  /** Set by the provider's onProviderFallback when self-healing is exhausted (A4). */
  fallbackReason: string | null;
  /** Mirrored from provider state for the e2e to read. */
  connectionStatus: string;
  currentQuality: string;
  _pcs: any[];
  lastPc: any | null;
}

const GOOD_STATS = { rttMs: 40, packetLoss: 0, availableBitrate: 2_000_000, limitation: 'none', freezes: 0 };

export function installFakeSfu() {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__fakeSfuInstalled) return;
  w.__fakeSfuInstalled = true;

  const ctrl: HarnessControls = {
    stats: { ...GOOD_STATS },
    failHeartbeat: false,
    failSession: false,
    sessionCount: 0,
    fallbackReason: null,
    connectionStatus: 'idle',
    currentQuality: 'high',
    _pcs: [],
    lastPc: null,
  };
  w.__sfu_harness = ctrl;
  // Make quality adaptation react in ~sub-second so the e2e isn't slow.
  w.__rtc_stats_interval_ms = 300;

  // ── Fake RTCPeerConnection ────────────────────────────────────────────────────
  class FakeRTCPeerConnection {
    connectionState = 'new';
    iceConnectionState = 'new';
    config: any;
    private listeners: Record<string, Array<() => void>> = {};
    private transceivers: any[] = [];

    constructor(cfg: any) {
      this.config = cfg;
      ctrl._pcs.push(this);
      ctrl.lastPc = this;
    }
    addEventListener(type: string, cb: () => void) {
      (this.listeners[type] ||= []).push(cb);
    }
    removeEventListener() {}
    private emit(type: string) {
      (this.listeners[type] || []).forEach((cb) => {
        try {
          cb();
        } catch {}
      });
    }
    private set(state: string) {
      this.connectionState = state;
      this.iceConnectionState = state;
      this.emit('connectionstatechange');
      this.emit('iceconnectionstatechange');
    }
    addTransceiver(track: any) {
      const mid = String(this.transceivers.length);
      const tr = {
        mid: null as string | null,
        _mid: mid,
        sender: {
          track,
          getParameters: () => ({ encodings: [{}] }),
          setParameters: () => Promise.resolve(),
          replaceTrack: (t: any) => {
            tr.sender.track = t;
            return Promise.resolve();
          },
        },
        receiver: { track },
      };
      this.transceivers.push(tr);
      return tr;
    }
    getTransceivers() {
      return this.transceivers;
    }
    createOffer() {
      return Promise.resolve({ type: 'offer', sdp: 'fake-offer' });
    }
    createAnswer() {
      return Promise.resolve({ type: 'answer', sdp: 'fake-answer' });
    }
    setLocalDescription() {
      this.transceivers.forEach((tr) => {
        if (!tr.mid) tr.mid = tr._mid;
      });
      return Promise.resolve();
    }
    setRemoteDescription() {
      // Negotiation done → become connected shortly (unless already torn down).
      setTimeout(() => {
        if (this.connectionState !== 'closed') this.set('connected');
      }, 40);
      return Promise.resolve();
    }
    restartIce() {}
    getStats() {
      const s = ctrl.stats;
      const entries = [
        { type: 'candidate-pair', nominated: true, currentRoundTripTime: (s.rttMs || 0) / 1000, availableOutgoingBitrate: s.availableBitrate ?? 1_000_000 },
        { type: 'outbound-rtp', kind: 'video', qualityLimitationReason: s.limitation || 'none' },
        { type: 'remote-inbound-rtp', kind: 'video', fractionLost: s.packetLoss || 0 },
      ];
      return Promise.resolve({ forEach: (cb: (v: any) => void) => entries.forEach(cb) } as unknown as RTCStatsReport);
    }
    close() {
      this.set('closed');
    }
  }
  w.RTCPeerConnection = FakeRTCPeerConnection as unknown as typeof RTCPeerConnection;

  // ── Fake getUserMedia (no real devices; tracks are never wrapped into MediaStream
  //    because the harness doesn't attach localVideoRef) ─────────────────────────
  const fakeTrack = (kind: string) => ({
    kind,
    enabled: true,
    readyState: 'live',
    stop() {},
    applyConstraints: () => Promise.resolve(),
    addEventListener() {},
    removeEventListener() {},
    onended: null,
  });
  const md: any = navigator.mediaDevices || {};
  md.getUserMedia = (constraints: any) => {
    const tracks: any[] = [];
    if (constraints?.audio) tracks.push(fakeTrack('audio'));
    if (constraints?.video) tracks.push(fakeTrack('video'));
    return Promise.resolve({
      getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
      getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
      getTracks: () => tracks,
    });
  };
  if (!navigator.mediaDevices) (navigator as any).mediaDevices = md;

  // sendBeacon (leave / telemetry) → swallow so it doesn't hit real routes.
  try {
    (navigator as any).sendBeacon = () => true;
  } catch {}

  // ── Fake fetch for /api/realtime/* ─────────────────────────────────────────────
  const realFetch = window.fetch.bind(window);
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (!url.includes('/api/realtime/')) return realFetch(input as any, init);

    if (url.includes('/api/realtime/session')) {
      if (ctrl.failSession) return Promise.resolve(json({ ok: false, reason: 'REALTIME_NOT_CONFIGURED' }, 503));
      ctrl.sessionCount += 1;
      return Promise.resolve(
        json({
          ok: true,
          sessionId: `fake-${ctrl.sessionCount}`,
          courseSessionId: 'cs-harness',
          identity: 'teacher:harness',
          role: 'teacher',
          iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
          iceDegraded: false,
          heartbeatIntervalSec: 2,
        })
      );
    }
    if (url.includes('/api/realtime/room')) {
      // GET = participants list; POST = heartbeat / leave.
      if ((init?.method || 'GET').toUpperCase() === 'GET') {
        return Promise.resolve(json({ ok: true, participants: [] }));
      }
      if (ctrl.failHeartbeat) return Promise.resolve(json({ ok: false }, 500));
      return Promise.resolve(json({ ok: true }));
    }
    if (url.includes('/api/realtime/tracks') || url.includes('/api/realtime/renegotiate')) {
      return Promise.resolve(json({ ok: true, sessionDescription: { type: 'answer', sdp: 'fake-answer' } }));
    }
    if (url.includes('/api/realtime/telemetry')) return Promise.resolve(json({ ok: true, accepted: 0 }));
    return Promise.resolve(json({ ok: true }));
  };
}

'use client';

// Dev/test-only harness for verifying the Cloudflare SFU provider's self-healing (A2),
// quality adaptation (A3) and Agora-fallback (A4) WITHOUT real Cloudflare credentials.
// fakeSfu.ts swaps in a controllable RTCPeerConnection + fetch(/api/realtime/*); this
// page mounts the REAL useCloudflareSfuProvider against them and mirrors its state onto
// window.__sfu_harness so e2e (e2e/whiteboard-demo/sfu_recovery.spec.ts) can drive and
// assert it. Not linked from any nav; renders nothing meaningful in production.

import { useEffect } from 'react';
import { installFakeSfu } from './fakeSfu';
import { useCloudflareSfuProvider } from '@/lib/providers/rtc/useCloudflareSfuProvider';

// Install the fakes before the provider constructs any RTCPeerConnection.
installFakeSfu();

function Harness() {
  const rtc = useCloudflareSfuProvider({
    channelName: 'harness',
    role: 'teacher',
    defaultQuality: 'high',
    onProviderFallback: (reason: string) => {
      const w = window as any;
      if (w.__sfu_harness) w.__sfu_harness.fallbackReason = reason;
    },
  });

  const { join, connectionStatus, currentQuality } = rtc as typeof rtc & { connectionStatus?: string };

  // Auto-join once on mount.
  useEffect(() => {
    void join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror provider state for the e2e.
  useEffect(() => {
    const w = window as any;
    if (w.__sfu_harness) w.__sfu_harness.connectionStatus = connectionStatus ?? 'idle';
  }, [connectionStatus]);
  useEffect(() => {
    const w = window as any;
    if (w.__sfu_harness) w.__sfu_harness.currentQuality = currentQuality;
  }, [currentQuality]);

  return (
    <div style={{ fontFamily: 'monospace', padding: 16 }}>
      <h1 style={{ fontSize: 16 }}>SFU recovery harness (dev/test only)</h1>
      <div data-testid="status">status: {connectionStatus ?? 'idle'}</div>
      <div data-testid="quality">quality: {currentQuality}</div>
      <p style={{ color: '#888', maxWidth: 640 }}>
        Drives the real useCloudflareSfuProvider against a fake SFU. Control via
        window.__sfu_harness and window.__rtc_debug.
      </p>
    </div>
  );
}

export default function RtcHarnessPage() {
  // Guard: this exists only for local/e2e verification.
  if (process.env.NODE_ENV === 'production') {
    return <div>Not available.</div>;
  }
  return <Harness />;
}

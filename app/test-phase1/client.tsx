'use client';

/**
 * Phase 1 Signaling Hook Test Harness (client component)
 *
 * Renders useAwsApigwSignaling and exposes all state as data-testid attributes
 * so Playwright can assert without parsing the UI.
 *
 * Query params:
 *   wsUrl    - WebSocket URL (intercepted by Playwright in tests)
 *   channel  - channelName (default: "test-channel")
 *   userId   - userId (default: "test-user")
 *   enabled  - "false" to start disabled (default: "true")
 */

import { useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAwsApigwSignaling } from '@/lib/providers/signaling/useAwsApigwSignaling';
import type { SignalingMessageType } from '@/lib/providers/types';

export function Phase1SignalingClient() {
  const searchParams = useSearchParams();
  const wsUrl = searchParams.get('wsUrl') ?? undefined;
  const channel = searchParams.get('channel') ?? 'test-channel';
  const userId = searchParams.get('userId') ?? 'test-user';
  const initialEnabled = searchParams.get('enabled') !== 'false';

  const [enabled, setEnabled] = useState(initialEnabled);
  const [lastMessage, setLastMessage] = useState<string>('');
  const [messageLog, setMessageLog] = useState<string[]>([]);
  const [sendResult, setSendResult] = useState<string>('');

  const { connected, connectionState, sendMessage, disconnect } = useAwsApigwSignaling({
    channelName: channel,
    userId,
    enabled,
    _wsUrl: wsUrl,
    onMessage: (msg) => {
      const str = JSON.stringify(msg);
      setLastMessage(str);
      setMessageLog((prev) => [...prev, str]);
    },
  });

  const handleSend = useCallback(async (type: SignalingMessageType) => {
    const ok = await sendMessage(type, { test: true, ts: Date.now() });
    setSendResult(ok ? 'ok' : 'fail');
  }, [sendMessage]);

  return (
    <div style={{ fontFamily: 'monospace', padding: 16 }}>
      <h2>Phase 1 Signaling Test Harness</h2>

      {/* ── State (read by Playwright) ── */}
      <div data-testid="connection-state">{connectionState}</div>
      <div data-testid="connected">{String(connected)}</div>
      <div data-testid="last-message">{lastMessage}</div>
      <div data-testid="send-result">{sendResult}</div>
      <div data-testid="enabled">{String(enabled)}</div>
      <div data-testid="channel">{channel}</div>
      <div data-testid="user-id">{userId}</div>

      {/* Message log (one entry per line, Playwright can count/read them) */}
      <ul data-testid="message-log">
        {messageLog.map((m, i) => (
          <li key={i} data-testid={`message-${i}`}>{m}</li>
        ))}
      </ul>

      {/* ── Controls ── */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button data-testid="btn-enable" onClick={() => setEnabled(true)}>Enable</button>
        <button data-testid="btn-disable" onClick={() => { setEnabled(false); disconnect(); }}>Disable</button>
        <button data-testid="btn-send-ping" onClick={() => handleSend('ping')}>Send ping</button>
        <button data-testid="btn-send-uuid" onClick={() => handleSend('wb-uuid-sync')}>Send wb-uuid-sync</button>
        <button data-testid="btn-send-page" onClick={() => handleSend('page-change')}>Send page-change</button>
        <button data-testid="btn-send-pdf" onClick={() => handleSend('pdf-available')}>Send pdf-available</button>
        <button data-testid="btn-send-ready" onClick={() => handleSend('ready-state-update')}>Send ready-state</button>
        <button data-testid="btn-clear-log" onClick={() => setMessageLog([])}>Clear log</button>
      </div>

      <div style={{ marginTop: 16, color: '#888' }}>
        <div>wsUrl: {wsUrl ?? '(from env)'}</div>
        <div>channel: {channel} | userId: {userId}</div>
      </div>
    </div>
  );
}

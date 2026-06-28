'use client';

/**
 * Phase 1 Alternative: AWS API Gateway WebSocket signaling provider.
 *
 * ACTIVATION (when ready):
 *   1. Deploy an API Gateway WebSocket API in ap-northeast-1 with:
 *      - Lambda authorizer that reads ?token= query param (HMAC-SHA256 signed by /api/signaling/token)
 *      - $connect / $disconnect / sendMessage routes
 *      - Connection registry in DynamoDB (table: jvtutorcorner-signaling-connections)
 *      - Fan-out Lambda: for each connection in the same channelName, call @connections/{connectionId}
 *   2. Set env vars:
 *        NEXT_PUBLIC_SIGNALING_PROVIDER=aws-apigw-ws
 *        NEXT_PUBLIC_AWS_APIGW_WS_URL=wss://XXXXXXXX.execute-api.ap-northeast-1.amazonaws.com/prod
 *   3. Deploy — no other code change needed.
 *
 * COST: ~$2/month at 50 classes/day (vs Agora RTM which is currently near-zero but
 * doesn't scale past Agora's rate limits at high concurrency).
 *
 * MESSAGE FORMAT: identical to Agora RTM — { type, payload, senderId, timestamp, seq? }
 * ClientClassroom.tsx message handlers require zero changes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ISignalingProvider, SignalingProviderOptions, SignalingMessage } from '../types';

const MAX_RETRIES = 5;
const BASE_RETRY_MS = 2000;

export interface AwsApigwSignalingOptions extends SignalingProviderOptions {
  /** Override the WebSocket URL — for testing only (bypasses NEXT_PUBLIC_AWS_APIGW_WS_URL). */
  _wsUrl?: string;
}

export function useAwsApigwSignaling({
  channelName,
  userId,
  enabled = true,
  onMessage,
  onConnectionChange,
  _wsUrl,
}: AwsApigwSignalingOptions): ISignalingProvider {
  const [connectionState, setConnectionState] = useState<ISignalingProvider['connectionState']>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const isDestroyedRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendSeqRef = useRef(0);
  const onMessageRef = useRef(onMessage);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onConnectionChangeRef.current = onConnectionChange; }, [onConnectionChange]);

  const updateState = useCallback((state: ISignalingProvider['connectionState']) => {
    setConnectionState(state);
    if (state !== 'idle') onConnectionChangeRef.current?.(state as any);
  }, []);

  const connect = useCallback(async () => {
    const wsUrl = _wsUrl ?? process.env.NEXT_PUBLIC_AWS_APIGW_WS_URL;
    if (!wsUrl) {
      console.warn('[AwsApigwSignaling] NEXT_PUBLIC_AWS_APIGW_WS_URL is not set — provider inactive.');
      return;
    }

    updateState('connecting');

    // Fetch a short-lived connection token from our Next.js API route.
    let token = '';
    try {
      const res = await fetch('/api/signaling/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName, userId }),
      });
      if (res.ok) {
        const data = await res.json();
        token = data.token ?? '';
      }
    } catch (e) {
      console.warn('[AwsApigwSignaling] Failed to fetch connection token:', e);
    }

    const url = `${wsUrl}?channelName=${encodeURIComponent(channelName)}&userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      updateState('connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg: SignalingMessage = JSON.parse(event.data);
        if (msg?.type) onMessageRef.current?.(msg);
      } catch (e) {
        console.warn('[AwsApigwSignaling] Failed to parse message:', e);
      }
    };

    ws.onerror = () => {
      console.warn('[AwsApigwSignaling] WebSocket error');
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (isDestroyedRef.current) return;
      updateState('disconnected');
      scheduleRetry();
    };
  }, [_wsUrl, channelName, userId, updateState]);

  const scheduleRetry = useCallback(() => {
    if (isDestroyedRef.current) return;
    if (retryCountRef.current >= MAX_RETRIES) {
      updateState('error');
      return;
    }
    const delay = BASE_RETRY_MS * Math.pow(2, retryCountRef.current);
    retryCountRef.current++;
    retryTimerRef.current = setTimeout(() => {
      if (!isDestroyedRef.current) connect();
    }, delay);
  }, [connect, updateState]);

  useEffect(() => {
    if (!enabled) {
      setConnectionState('idle');
      return;
    }
    isDestroyedRef.current = false;
    connect();

    return () => {
      isDestroyedRef.current = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled, connect]);

  const sendMessage = useCallback(async (
    type: ISignalingProvider['sendMessage'] extends (t: infer T, p: any) => any ? T : never,
    payload: Record<string, unknown>,
  ): Promise<boolean> => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      const msg: SignalingMessage = {
        type,
        payload,
        senderId: userId,
        timestamp: Date.now(),
        seq: ++sendSeqRef.current,
      };
      ws.send(JSON.stringify(msg));
      return true;
    } catch (e) {
      console.warn('[AwsApigwSignaling] sendMessage failed:', e);
      return false;
    }
  }, [userId]);

  const disconnect = useCallback(async () => {
    isDestroyedRef.current = true;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    wsRef.current?.close();
    wsRef.current = null;
    setConnectionState('idle');
  }, []);

  return {
    connected: connectionState === 'connected',
    connectionState,
    sendMessage,
    disconnect,
  };
}

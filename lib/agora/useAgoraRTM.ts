'use client';

/**
 * useAgoraRTM.ts
 *
 * React hook for Agora RTM 2.x — provides a reliable messaging channel
 * shared between teacher and student(s) inside a classroom session.
 *
 * PRIMARY USES in /classroom/room:
 *  1. Whiteboard UUID broadcast (replaces broken cross-device BroadcastChannel)
 *  2. classroom/ready presence updates (replaces DynamoDB polling)
 *  3. PDF sync notifications (teacher → students)
 *
 * DESIGN PRINCIPLES:
 *  - Lazy init: only connects when `enabled` is true
 *  - Auto-reconnect on disconnect (up to 5 retries)
 *  - Graceful degradation: if RTM fails, falls back to existing mechanisms
 *  - Channel messages are JSON-encoded { type, payload, senderId, timestamp }
 *
 * AGORA RTM 2.x API:
 *  - AgoraRTM.create(config) → client
 *  - client.login(options)
 *  - client.createStreamChannel(channelName) → channel
 *  - channel.join(options)
 *  - channel.publish(message, options)
 *  - client.on('message', handler)
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RTMMessageType =
  | 'wb-uuid-sync'          // Teacher → Students: whiteboard UUID after room creation
  | 'request-wb-uuid'       // Student → Teacher: request whiteboard UUID re-broadcast
  | 'ready-state-update'    // Any → Any: participant joined/left classroom ready state
  | 'pdf-available'         // Teacher → Students: PDF uploaded, students should fetch
  | 'page-change'           // Teacher → Students: PDF page changed
  | 'ping'                  // keepalive
  | 'custom';               // extensible

export interface RTMMessage {
  type: RTMMessageType;
  payload: Record<string, any>;
  senderId: string;
  timestamp: number;
}

export type RTMMessageHandler = (msg: RTMMessage) => void;

export interface UseAgoraRTMOptions {
  /** Agora channelName to join (same as RTC channelName for easy correlation) */
  channelName: string;
  /** Local user's unique identifier */
  userId: string;
  /** Set to false to skip initialization (e.g., server-side render) */
  enabled?: boolean;
  /** Called when a message is received from other participants */
  onMessage?: RTMMessageHandler;
  /** Called when RTM connection state changes */
  onConnectionChange?: (state: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
}

export interface UseAgoraRTMReturn {
  /** Whether RTM is connected and ready to send/receive */
  connected: boolean;
  /** RTM connection state for UI display */
  connectionState: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
  /**
   * Send a typed message to all other participants in the channel.
   * Returns true on success, false on failure (caller should fall back).
   */
  sendMessage: (type: RTMMessageType, payload: Record<string, any>) => Promise<boolean>;
  /** Manually disconnect (called on component unmount) */
  disconnect: () => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;
// Agora RTM channel names have the same 64-byte limit as RTC
const MAX_CHANNEL_NAME_BYTES = 64;
// Agora RTM 2.x userId: letters, numbers, hyphen, underscore only; max 64 chars
const MAX_RTM_USERID_BYTES = 64;

function truncateChannelName(name: string): string {
  const encoded = new TextEncoder().encode(name);
  if (encoded.length <= MAX_CHANNEL_NAME_BYTES) return name;
  return new TextDecoder().decode(encoded.slice(0, MAX_CHANNEL_NAME_BYTES)).replace(/\uFFFD/g, '');
}

/**
 * Convert any string (e.g. email) into a valid Agora RTM userId.
 * Agora RTM 2.x rules: [a-zA-Z0-9_-], max 64 chars.
 * Strategy: replace illegal chars with '_', then truncate.
 * This is deterministic — same input always yields same output.
 */
export function sanitizeRTMUserId(raw: string): string {
  // Replace any character that is not alphanumeric, hyphen, or underscore
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  // Agora RTM userId max is 64 ASCII chars
  return safe.slice(0, MAX_RTM_USERID_BYTES);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAgoraRTM({
  channelName,
  userId,
  enabled = true,
  onMessage,
  onConnectionChange,
}: UseAgoraRTMOptions): UseAgoraRTMReturn {
  const [connectionState, setConnectionState] = useState<UseAgoraRTMReturn['connectionState']>('idle');

  // Refs avoid stale closures in async callbacks
  const clientRef = useRef<any>(null);
  const retryCountRef = useRef(0);
  const isDestroyedRef = useRef(false);
  const onMessageRef = useRef<RTMMessageHandler | undefined>(onMessage);
  const onConnectionChangeRef = useRef(onConnectionChange);

  // Keep handler refs up-to-date without triggering re-initialisation
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onConnectionChangeRef.current = onConnectionChange; }, [onConnectionChange]);

  const updateState = useCallback((state: UseAgoraRTMReturn['connectionState']) => {
    setConnectionState(state);
    onConnectionChangeRef.current?.(state === 'idle' ? 'disconnected' : state as any);
  }, []);

  // ── Main init ──────────────────────────────────────────────────────────────

  const initRTM = useCallback(async () => {
    if (isDestroyedRef.current) return;
    if (typeof window === 'undefined') return;

    updateState('connecting');

    // Agora RTM 2.x requires userId to be [a-zA-Z0-9_-], max 64 chars.
    // The raw userId from the app may be an email (contains @ and .) — sanitize it.
    // Computed first so it can seed the deterministic jitter below.
    const safeUserId = sanitizeRTMUserId(userId);
    console.log('[useAgoraRTM] Initializing for channel:', channelName, 'safeUserId:', safeUserId);

    // Deterministic hash-based jitter: spreads concurrent RTM logins evenly across
    // a 6000ms window using the userId as a stable seed. Under 9+ concurrent groups,
    // 18 RTM logins fire at startup; Math.random() (0–2000ms) can cluster several in
    // the same second, triggering Agora's 'login too frequent' rate-limit error.
    // Hash-based spread guarantees each user gets a unique slot (~333ms apart for 18 users).
    const _rtmHash = safeUserId.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xffff, 0);
    const rtmJitter = Math.floor((_rtmHash & 0xff) / 256 * 6000);
    await new Promise(resolve => setTimeout(resolve, rtmJitter));
    if (isDestroyedRef.current) return;

    try {
      // 1. Fetch RTM token from our server (pass the sanitized userId so token matches)
      const tokenRes = await fetch(`/api/agora/rtm-token?userId=${encodeURIComponent(safeUserId)}`);
      if (!tokenRes.ok) throw new Error(`RTM token fetch failed: ${tokenRes.status}`);
      const { appId, token } = await tokenRes.json();

      if (isDestroyedRef.current) return;

      // 2. Dynamically import Agora RTM SDK (client-side only)
      const AgoraRTMModule = await import('agora-rtm-sdk');
      const AgoraRTM = (AgoraRTMModule as any).default ?? AgoraRTMModule;

      if (isDestroyedRef.current) return;

      // 3. Create RTM client (RTM 2.x API)
      // IMPORTANT: must pass the sanitized userId — same one used to request the token
      const { RTM } = AgoraRTM;
      const client = new RTM(appId, safeUserId, {
        logLevel: 'error', // suppress verbose RTM logs in production
      });

      // 4. Register message listener BEFORE login
      client.addEventListener('message', (event: any) => {
        try {
          const parsed: RTMMessage = typeof event.message === 'string'
            ? JSON.parse(event.message)
            : event.message;
          onMessageRef.current?.(parsed);
        } catch (e) {
          console.warn('[useAgoraRTM] Failed to parse message:', e);
        }
      });

      client.addEventListener('status', (event: any) => {
        const { newState, reason } = event;
        console.log('[useAgoraRTM] Connection state changed:', newState, reason);
        if ((newState === 'DISCONNECTED' || newState === 'FAILED') && !isDestroyedRef.current) {
          updateState('disconnected');
          scheduleRetry();
        }
      });

      // 5. Login
      await client.login({ token });
      if (isDestroyedRef.current) { client.logout(); return; }

      // 6. Subscribe to channel (RTM 2.x)
      const safeChannelName = truncateChannelName(`wb_${channelName}`);
      await client.subscribe(safeChannelName, { withMessage: true });
      if (isDestroyedRef.current) { client.unsubscribe(safeChannelName); client.logout(); return; }

      clientRef.current = client;
      retryCountRef.current = 0; // reset retry counter on success
      updateState('connected');

      console.log('[useAgoraRTM] ✅ Subscribed to RTM channel:', safeChannelName);

    } catch (err: any) {
      console.error('[useAgoraRTM] Init failed:', err?.message ?? err);
      if (!isDestroyedRef.current) {
        updateState('error');
        scheduleRetry();
      }
    }
  }, [channelName, userId, updateState]);

  const scheduleRetry = useCallback(() => {
    if (isDestroyedRef.current) return;
    if (retryCountRef.current >= MAX_RETRIES) {
      console.warn('[useAgoraRTM] Max retries reached, giving up. Callers will use fallback mechanisms.');
      updateState('error');
      return;
    }
    retryCountRef.current++;
    const delay = RETRY_DELAY_MS * retryCountRef.current;
    console.log(`[useAgoraRTM] Retrying in ${delay}ms (attempt ${retryCountRef.current}/${MAX_RETRIES})`);
    setTimeout(() => { if (!isDestroyedRef.current) initRTM(); }, delay);
  }, [initRTM, updateState]);

  // ── Init on mount ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    isDestroyedRef.current = false;

    initRTM();

    return () => {
      isDestroyedRef.current = true;
      const cl = clientRef.current;
      clientRef.current = null;

      // Clean up asynchronously to avoid blocking unmount
      (async () => {
        if (cl) {
          try { await cl.unsubscribe(truncateChannelName(`wb_${channelName}`)); } catch (e) { /* ignore */ }
          try { await cl.logout(); } catch (e) { /* ignore */ }
        }
      })();
    };
  }, [enabled, channelName, userId]); // re-init if channel or user changes

  // ── Public API ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (
    type: RTMMessageType,
    payload: Record<string, any>,
  ): Promise<boolean> => {
    const client = clientRef.current;
    if (!client) {
      console.warn('[useAgoraRTM] sendMessage called but client not connected');
      return false;
    }

    const safeChannelName = truncateChannelName(`wb_${channelName}`);
    const msg: RTMMessage = {
      type,
      payload,
      senderId: userId,
      timestamp: Date.now(),
    };

    try {
      await client.publish(safeChannelName, JSON.stringify(msg));
      return true;
    } catch (err: any) {
      console.error('[useAgoraRTM] sendMessage failed:', err?.message ?? err);
      return false;
    }
  }, [channelName, userId]);

  const disconnect = useCallback(async () => {
    isDestroyedRef.current = true;
    const cl = clientRef.current;
    clientRef.current = null;
    if (cl) {
      try { await cl.unsubscribe(truncateChannelName(`wb_${channelName}`)); } catch (e) { /* ignore */ }
      try { await cl.logout(); } catch (e) { /* ignore */ }
    }
    updateState('disconnected');
  }, [channelName, updateState]);

  return {
    connected: connectionState === 'connected',
    connectionState,
    sendMessage,
    disconnect,
  };
}

'use client';

/**
 * Thin adapter: wraps the existing useAgoraRTM hook to satisfy ISignalingProvider.
 * Zero behaviour change — all logic stays in lib/agora/useAgoraRTM.ts.
 */

import { useAgoraRTM } from '@/lib/agora/useAgoraRTM';
import type { ISignalingProvider, SignalingProviderOptions } from '../types';

export function useAgoraRTMProvider(opts: SignalingProviderOptions): ISignalingProvider {
  const { connected, connectionState, sendMessage, disconnect } = useAgoraRTM({
    channelName: opts.channelName,
    userId: opts.userId,
    enabled: opts.enabled,
    onMessage: opts.onMessage as any,
    onConnectionChange: opts.onConnectionChange,
  });

  return { connected, connectionState, sendMessage: sendMessage as any, disconnect };
}

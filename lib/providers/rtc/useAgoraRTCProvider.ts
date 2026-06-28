'use client';

/**
 * Thin adapter: wraps useAgoraClassroom to satisfy IRTCProvider.
 * All logic stays in lib/agora/useAgoraClassroom.ts — zero behaviour change.
 */

import { useAgoraClassroom } from '@/lib/agora/useAgoraClassroom';
import type { RTCProviderOptions } from '../types';

// Return type is inferred from useAgoraClassroom so all ref types stay exact.
export function useAgoraRTCProvider(opts: RTCProviderOptions) {
  return useAgoraClassroom(opts);
}

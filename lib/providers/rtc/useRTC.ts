'use client';

/**
 * RTC provider selector.
 *
 * Reads NEXT_PUBLIC_RTC_PROVIDER at build time and returns the appropriate provider.
 * All three sub-hooks are ALWAYS called (React hook rules). Each self-gates via
 * internal enabled logic — inactive providers open zero connections or resources.
 *
 * Default: 'agora' — identical behaviour to before this abstraction.
 *
 * To switch providers, set env var and redeploy (no code change needed):
 *   NEXT_PUBLIC_RTC_PROVIDER=chime    → Phase 2: Amazon Chime SDK
 *   NEXT_PUBLIC_RTC_PROVIDER=livekit  → Phase 3: LiveKit on ECS Fargate
 *   NEXT_PUBLIC_RTC_PROVIDER=cloudflare-sfu → Cloudflare Realtime SFU（見 docs/hybrid-architecture-plan.md §6）
 */

import { useAgoraRTCProvider } from './useAgoraRTCProvider';
import { useChimeProvider } from './useChimeProvider';
import { useLiveKitProvider } from './useLiveKitProvider';
import { useCloudflareSfuProvider } from './useCloudflareSfuProvider';
import type { RTCProviderOptions } from '../types';

const PROVIDER = process.env.NEXT_PUBLIC_RTC_PROVIDER ?? 'agora';

// Return type is inferred as union — TypeScript picks the widest compatible type.
// When PROVIDER='agora' (default), ClientClassroom gets the exact useAgoraClassroom type.
export function useRTC(opts: RTCProviderOptions) {
  // All providers are unconditionally called — only the active one does real work.
  const agora = useAgoraRTCProvider(opts);
  const chime = useChimeProvider(opts);
  const livekit = useLiveKitProvider(opts);
  const cloudflareSfu = useCloudflareSfuProvider(opts);

  if (PROVIDER === 'cloudflare-sfu') return cloudflareSfu;
  if (PROVIDER === 'livekit') return livekit;
  if (PROVIDER === 'chime') return chime;
  return agora;
}

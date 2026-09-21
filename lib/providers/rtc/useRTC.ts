'use client';

/**
 * RTC provider selector.
 *
 * The default provider is read from NEXT_PUBLIC_RTC_PROVIDER at build time, but the
 * *active* provider is a runtime value so we can fall back to Agora without a redeploy:
 *
 *   1. `?rtc=agora` in the URL (per-session manual override / testing)
 *   2. sessionStorage['jv_rtc_override'] (sticky after an automatic fallback)
 *   3. opts.serverForceProvider (kill switch: /api/classroom/ready → forceProvider)
 *   4. NEXT_PUBLIC_RTC_PROVIDER (build-time default)
 *
 * All sub-hooks are ALWAYS called (React hook rules); only the returned one is driven
 * by ClientClassroom (join is only ever called on the returned object), so an inactive
 * provider opens zero connections. When the Cloudflare SFU exhausts its self-healing
 * budget it calls onProviderFallback → we switch the active provider to Agora and make
 * it sticky for the rest of the session.
 */

import { useCallback, useMemo, useState } from 'react';
import { useAgoraRTCProvider } from './useAgoraRTCProvider';
import { useChimeProvider } from './useChimeProvider';
import { useLiveKitProvider } from './useLiveKitProvider';
import { useCloudflareSfuProvider } from './useCloudflareSfuProvider';
import type { RTCProviderOptions } from '../types';

const BUILD_PROVIDER = process.env.NEXT_PUBLIC_RTC_PROVIDER ?? 'agora';
const VALID = new Set(['agora', 'chime', 'livekit', 'cloudflare-sfu']);
const OVERRIDE_KEY = 'jv_rtc_override';

function resolveInitial(serverForceProvider?: string): string {
  if (typeof window !== 'undefined') {
    try {
      const url = new URLSearchParams(window.location.search).get('rtc');
      if (url && VALID.has(url)) return url;
      const stored = window.sessionStorage.getItem(OVERRIDE_KEY);
      if (stored && VALID.has(stored)) return stored;
    } catch {
      /* ignore */
    }
  }
  if (serverForceProvider && VALID.has(serverForceProvider)) return serverForceProvider;
  return BUILD_PROVIDER;
}

export function useRTC(opts: RTCProviderOptions) {
  const [active, setActive] = useState<string>(() => resolveInitial(opts.serverForceProvider));

  // When the SFU gives up, switch to Agora and remember it for this session.
  const handleFallback = useCallback((reason: string) => {
    console.warn('[useRTC] falling back to Agora:', reason);
    try {
      window.sessionStorage.setItem(OVERRIDE_KEY, 'agora');
    } catch {
      /* ignore */
    }
    setActive('agora');
  }, []);

  // Only the SFU provider consumes onProviderFallback; keep other providers' opts clean.
  const sfuOpts = useMemo<RTCProviderOptions>(() => ({ ...opts, onProviderFallback: handleFallback }), [opts, handleFallback]);

  const agora = useAgoraRTCProvider(opts);
  const chime = useChimeProvider(opts);
  const livekit = useLiveKitProvider(opts);
  const cloudflareSfu = useCloudflareSfuProvider(sfuOpts);

  if (active === 'cloudflare-sfu') return cloudflareSfu;
  if (active === 'livekit') return livekit;
  if (active === 'chime') return chime;
  return agora;
}

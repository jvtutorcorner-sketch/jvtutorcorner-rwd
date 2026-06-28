'use client';

/**
 * Signaling provider selector.
 *
 * Reads NEXT_PUBLIC_SIGNALING_PROVIDER at build time (Next.js inlines NEXT_PUBLIC_*
 * env vars) and returns the appropriate provider. Both sub-hooks are ALWAYS called
 * (React hook rules: no conditional hook calls). Each sub-hook self-gates via
 * `enabled` so the inactive one opens zero connections.
 *
 * Default: 'agora-rtm' — identical behaviour to before this abstraction was added.
 */

import { useAgoraRTMProvider } from './useAgoraRTMProvider';
import { useAwsApigwSignaling } from './useAwsApigwSignaling';
import type { ISignalingProvider, SignalingProviderOptions } from '../types';

const PROVIDER = process.env.NEXT_PUBLIC_SIGNALING_PROVIDER ?? 'agora-rtm';

export function useSignaling(opts: SignalingProviderOptions): ISignalingProvider {
  const isAgora = PROVIDER !== 'aws-apigw-ws';

  // Both hooks are unconditionally called — only the active one has enabled=true.
  const agora = useAgoraRTMProvider({ ...opts, enabled: opts.enabled !== false && isAgora });
  const apigw = useAwsApigwSignaling({ ...opts, enabled: opts.enabled !== false && !isAgora });

  return isAgora ? agora : apigw;
}

// lib/media/providers/index.ts
//
// Provider registry. Defaults to the stub; the RunPod adapter is gated (not built
// this pass) and selecting it without an implementation fails loudly rather than
// silently no-op'ing a paid path.

import type { MediaProvider } from './types';
import { stubProvider } from './stub';

export function getMediaProvider(): MediaProvider {
  const name = process.env.MEDIA_PROVIDER || 'stub';
  if (name === 'stub') return stubProvider;
  // 'runpod' etc. — gated. The adapter lands with the real RunPod integration.
  throw new Error(`[media] provider "${name}" is not configured (only "stub" is available in this build)`);
}

export type { MediaProvider } from './types';

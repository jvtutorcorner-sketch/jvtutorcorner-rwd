'use client';

/**
 * Whiteboard provider selector.
 *
 * Default: 'netless' — the Agora/Netless whiteboard managed directly in ClientClassroom.tsx.
 *
 * Note: Unlike the signaling and RTC providers, the whiteboard provider is not yet wired
 * into ClientClassroom.tsx. The whiteboard init logic remains in ClientClassroom.tsx
 * (the initAgoraWhiteboard useEffect at lines ~592-885) until Phase 3b migration.
 * This selector is present for documentation and future wiring.
 *
 * To activate tldraw:
 *   NEXT_PUBLIC_WHITEBOARD_PROVIDER=tldraw
 */

import { useNetlessWhiteboard } from './useNetlessWhiteboard';
import { useTldrawWhiteboard } from './useTldrawWhiteboard';
import type { IWhiteboardProvider, WhiteboardProviderOptions } from '../types';

const PROVIDER = process.env.NEXT_PUBLIC_WHITEBOARD_PROVIDER ?? 'netless';

export function useWhiteboardProvider(opts: WhiteboardProviderOptions): IWhiteboardProvider {
  // Both hooks always called (React hook rules).
  const netless = useNetlessWhiteboard(opts);
  const tldraw = useTldrawWhiteboard(opts);

  return PROVIDER === 'tldraw' ? tldraw : netless;
}

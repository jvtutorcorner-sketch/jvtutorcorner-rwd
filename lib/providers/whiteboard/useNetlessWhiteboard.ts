'use client';

/**
 * Netless (Agora Whiteboard) provider — placeholder for future extraction.
 *
 * The actual implementation lives in ClientClassroom.tsx (lines ~592-885: the
 * initAgoraWhiteboard useEffect). It is deeply intertwined with a dozen state
 * variables (effectiveWhiteboardUuid, sessionReadyKey, computedRole, …).
 *
 * When ready to extract:
 *   1. Move the initAgoraWhiteboard async function + its useEffect into this hook
 *   2. Accept all required deps as parameters via WhiteboardProviderOptions
 *   3. Return IWhiteboardProvider
 *   4. In ClientClassroom.tsx: replace the useEffect block with useWhiteboardProvider()
 *      and map { roomData, boardRef, hasError, hasTimeout } to the existing JSX props
 *
 * Until then, ClientClassroom.tsx manages the Netless whiteboard directly.
 * This file exists to satisfy the IWhiteboardProvider interface and document
 * the migration path.
 */

import { useRef } from 'react';
import type { IWhiteboardProvider, WhiteboardProviderOptions } from '../types';

export function useNetlessWhiteboard(_opts: WhiteboardProviderOptions): IWhiteboardProvider {
  const boardRef = useRef<any>(null);
  return {
    isActive: true,
    roomData: null,
    isMounted: false,
    isReady: false,
    hasError: false,
    hasTimeout: false,
    boardRef,
    initRoom: async () => {},
    retryInit: () => {},
  };
}

'use client';

/**
 * Phase 3b Stub: tldraw + Hocuspocus whiteboard provider.
 *
 * ACTIVATION (when ready, typically bundled with Phase 3 LiveKit migration):
 *   1. Run alongside LiveKit server (same ECS task or separate container):
 *        docker run ueberdosis/hocuspocus:latest
 *        Expose port 1234 (WebSocket)
 *   2. npm install @tldraw/tldraw @hocuspocus/provider yjs pdf.js-dist
 *   3. Implement this hook:
 *        - Connect to Hocuspocus: new HocuspocusProvider({ url, name: channelName, document: new Y.Doc() })
 *        - Render: <Tldraw store={store} /> where store is synced via YjsStore
 *        - PDF: render each page via pdfjsLib to a canvas, export as data-url, insert as tldraw image
 *        - boardRef methods (prevPage, nextPage, etc.) become calls to tldraw editor API
 *   4. Set env vars:
 *        NEXT_PUBLIC_WHITEBOARD_PROVIDER=tldraw
 *        NEXT_PUBLIC_HOCUSPOCUS_URL=ws://your-hocuspocus.example.com
 *   5. Existing S3 PDF upload (/api/whiteboard/pdf, /api/whiteboard/presign) can be kept as-is.
 *
 * COST: Near-zero marginal cost when co-located with LiveKit (shared Fargate task).
 * The Netless whiteboard currently costs ~$18.75/month at 50 classes/day (3% of total).
 */

import { useRef } from 'react';
import type { IWhiteboardProvider, WhiteboardProviderOptions } from '../types';

export function useTldrawWhiteboard(_opts: WhiteboardProviderOptions): IWhiteboardProvider {
  const boardRef = useRef<any>(null);
  return {
    isActive: false,
    roomData: null,
    isMounted: false,
    isReady: false,
    hasError: false,
    hasTimeout: false,
    boardRef,
    initRoom: async () => {
      console.warn('[TldrawWhiteboard] tldraw + Hocuspocus is not yet configured. See lib/providers/whiteboard/useTldrawWhiteboard.ts for activation steps.');
    },
    retryInit: () => {},
  };
}

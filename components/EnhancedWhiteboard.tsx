"use client";

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { getStoredUser } from '@/lib/mockAuth';
import {
  electOfferer,
  encodePointsDelta,
  applyPointsDelta,
  chunkState,
  assembleState,
  mergeStateById,
  CTL_LABEL,
  PTS_LABEL,
  type WbRtcRole,
  type StateChunk,
} from '@/lib/whiteboard/rtcProtocol';

/** Injectable realtime signaling for the whiteboard's WebRTC handshake. When the
 *  classroom provides this, offers/answers/candidates ride the existing RTM/WS
 *  channel instead of the DB-polled mailbox. */
export interface WbRtcSignal {
  send: (kind: string, data: unknown, epoch: string) => void;
  subscribe: (cb: (msg: { kind: string; data: unknown; from?: string; epoch?: string }) => void) => () => void;
  selfId?: string;
}

export interface WhiteboardProps {
  room?: any; // Netless whiteboard room (if provided, use it; otherwise use canvas fallback)
  whiteboardRef?: React.RefObject<HTMLDivElement>; // Ref for Netless whiteboard container
  channelName?: string;
  width?: number;
  height?: number;
  autoFit?: boolean;
  className?: string;
  onPdfSelected?: (file: File | null) => void;
  pdfFile?: File | null; // PDF file to display as background
  micEnabled?: boolean;
  onToggleMic?: () => void;
  hasMic?: boolean;
  onLeave?: () => void;
  editable?: boolean; // whether the current client may draw/interact
  rtcRole?: WbRtcRole; // deterministic role for offerer election (defaults from editable)
  rtcSelfId?: string; // stable cross-tab identity for tie-breaking (e.g. presenceId)
  rtcSignal?: WbRtcSignal | null; // classroom realtime signaling; null → DB-polled mailbox
}

type Stroke = { points: number[]; stroke: string; strokeWidth: number; mode: 'draw' | 'erase'; page?: number; id?: string; timestamp?: number };

export default function EnhancedWhiteboard({ 
  room,
  whiteboardRef,
  channelName,
  width = 800, 
  height = 600, 
  autoFit = true,
  className = '', 
  onPdfSelected, 
  pdfFile,
  micEnabled,
  onToggleMic,
  hasMic,
  onLeave
  , editable = true
  , rtcRole
  , rtcSelfId
  , rtcSignal
}: WhiteboardProps) {
  const bcRef = useRef<BroadcastChannel | null>(null);
  const clientIdRef = useRef<string>(`c_${Math.random().toString(36).slice(2)}`);
  const applyingRemoteRef = useRef(false);
  const verboseLogging = typeof window !== 'undefined' && window.location.pathname === '/classroom/test';
  // Snapshot mode: instead of persisting every stroke/point event, the editing
  // client debounces and pushes ONE full-board snapshot, so the DB holds a single
  // overwritten item per room (like Agora keeps only a scene snapshot) rather than
  // an event stream. Set via NEXT_PUBLIC_WHITEBOARD_SNAPSHOT=1 (build-time).
  const SNAPSHOT_MODE = process.env.NEXT_PUBLIC_WHITEBOARD_SNAPSHOT === '1';
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotAtRef = useRef(0);
  const scheduleSnapshotRef = useRef<() => void>(() => {});
  // WebRTC DataChannel transport (NEXT_PUBLIC_WHITEBOARD_RTC=1): live strokes go
  // peer-to-peer over UDP (SCTP/DTLS) — smooth, sub-50ms, and NEVER touch the DB.
  // Persistence falls back to the snapshot path (late-join / before the channel opens).
  const RTC_MODE = process.env.NEXT_PUBLIC_WHITEBOARD_RTC === '1';
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null); // reliable control channel (wb-ctl) — the "is RTC live?" signal
  const dcPtsRef = useRef<RTCDataChannel | null>(null); // unreliable point-delta channel (wb-pts)
  // How many points of each in-progress stroke we've already sent over wb-pts, so
  // we only ship the new tail (never the whole growing array) on the unreliable path.
  const sentPointsRef = useRef<Map<string, number>>(new Map());
  const rtcSelfIdRef = useRef<string>(rtcSelfId || clientIdRef.current);
  rtcSelfIdRef.current = rtcSelfId || clientIdRef.current;
  const isOffererRef = useRef(false); // only the offerer persists snapshots (single writer)
  
  // REMOVED: Debounced state sync - causes flickering and lag
  // We now only sync state when necessary (undo/redo/clear) to avoid triggering drawAll useEffect

  const logAnomaly = (title: string, info?: any) => {
    try {
      const snapshot = {
        time: Date.now(),
        page: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
        clientId: clientIdRef.current,
        strokesCount: strokes.length,
        recentStrokes: strokes.slice(-10).map((s) => ({ id: (s as any).id, len: s.points.length }))
      };
      console.error(`[WB-ANOMALY] ${title}`, { info, snapshot });
    } catch (e) {
      console.error('[WB-ANOMALY] Failed to log anomaly', e);
    }
  };

  // helper to POST events to server relay
  const postEventToServer = useCallback(async (event: any) => {
    // RTC transport: while the reliable control channel is open, live strokes go
    // P2P over UDP and never hit the DB. In-progress point batches ride the
    // unreliable channel as deltas (fire-and-forget); everything else — including
    // the FINAL stroke-update, which repairs any dropped deltas — rides the
    // reliable channel. (Before the channel opens, fall through to snapshot/DB.)
    if (RTC_MODE) {
      const ctl = dcRef.current;
      const pts = dcPtsRef.current;
      if (ctl && ctl.readyState === 'open') {
        try {
          const ev: any = event;
          if (ev.type === 'stroke-update' && !ev.final && pts && pts.readyState === 'open' && Array.isArray(ev.points)) {
            const from = sentPointsRef.current.get(ev.strokeId) || 0;
            const delta = encodePointsDelta(ev.strokeId, ev.points, from);
            if (delta) {
              pts.send(JSON.stringify(delta));
              sentPointsRef.current.set(ev.strokeId, ev.points.length);
            }
          } else {
            if (ev.type === 'stroke-start' && ev.stroke?.id) {
              sentPointsRef.current.set(ev.stroke.id, ev.stroke.points?.length || 0);
            } else if (ev.type === 'stroke-update' && ev.final) {
              sentPointsRef.current.set(ev.strokeId, ev.points?.length || 0);
            } else if (ev.type === 'clear') {
              sentPointsRef.current.clear();
            }
            ctl.send(JSON.stringify({ ...ev, clientId: clientIdRef.current, t: Date.now() }));
          }
        } catch (e) {
          /* fall through to persistence on send failure */
        }
        // Persistence: only the offerer keeps a debounced snapshot so a refresh /
        // late-join / cold start can recover — DB still holds one item per room.
        if (SNAPSHOT_MODE && isOffererRef.current) scheduleSnapshotRef.current();
        return;
      }
    }
    // Snapshot mode: skip per-event persistence; coalesce into one debounced
    // full-board snapshot write instead (keeps the DB to a single item per room).
    if (SNAPSHOT_MODE) {
      scheduleSnapshotRef.current();
      return;
    }
    try {
      // Use channelName as uuid for consistency with PDF and session
      const uuid = channelName || 'default';
      console.log('[WB POST] Sending event to server:', event.type, 'uuid:', uuid);
      const response = await fetch('/api/whiteboard/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uuid, event: { ...event, clientId: clientIdRef.current } })
      });
      let resultText = null;
      try {
        resultText = await response.text();
        try {
          const parsed = JSON.parse(resultText);
          console.log('[WB POST] Server response (parsed):', parsed);
        } catch (e) {
          console.log('[WB POST] Server response (text):', resultText.slice(0, 1000));
        }
      } catch (e) {
        console.warn('[WB POST] Failed to read server response body', e);
      }
      if (!response.ok) {
        console.error('[WB POST] Non-OK response from /api/whiteboard/event', { status: response.status, bodyPreview: resultText?.slice(0, 200) });
      }
      // ACK mechanism removed: production polling at 500ms interval is sufficient for sync verification
    } catch (e) {
      console.error('[WB POST] Error posting event:', e && (e as Error).stack ? (e as Error).stack : e);
    }
  }, [channelName]);

  // Error display for user feedback
  const [errors, setErrors] = useState<string[]>([]);
  const pushError = useCallback((msg: string) => {
    setErrors((e) => [...e.slice(-9), msg]);
    console.error('[WB ERR]', msg);
  }, []);

  // Removed: ensureServerAckForStroke function and pendingAckRef
  // Production polling at 500ms interval is sufficient for sync verification
  
  // Buffer/high-frequency update batching for stroke-update events
  const pendingUpdatesRef = useRef<Map<string, { points: number[] }>>(new Map());
  const flushTimerRef = useRef<number | null>(null);
  const currentStrokeIdRef = useRef<string | null>(null);
  const FLUSH_INTERVAL = 200; // ms - Reduced frequency to avoid overwhelming server

  const flushPendingUpdates = useCallback(() => {
    try {
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    } catch (e) {}

    const entries = Array.from(pendingUpdatesRef.current.entries());
    if (entries.length === 0) return;
    // send latest update per strokeId
    for (const [strokeId, data] of entries) {
      try {
        postEventToServer({ type: 'stroke-update', strokeId, points: data.points });
      } catch (e) {}
    }
    pendingUpdatesRef.current.clear();
  }, [postEventToServer]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      flushPendingUpdates();
    }, FLUSH_INTERVAL) as unknown as number;
  }, [flushPendingUpdates]);

  const enqueueStrokeUpdate = useCallback((strokeId: string, points: number[]) => {
    pendingUpdatesRef.current.set(strokeId, { points });
    scheduleFlush();
  }, [scheduleFlush]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null); // Background canvas for PDF
  const currentRenderTask = useRef<any>(null); // Track PDF render task
  const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
  const [color, setColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undone, setUndone] = useState<Stroke[]>([]);
  
  // Make undone available in closures/callbacks via Ref to support correct merging
  const undoneRef = useRef<Stroke[]>([]);
  useEffect(() => { undoneRef.current = undone; }, [undone]);
  const isDrawingRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [whiteboardPermissions, setWhiteboardPermissions] = useState<Record<string, string[] | undefined> | null>(null);
  const [currentUserRoleId, setCurrentUserRoleId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const urlRole = params.get('role');
    if (urlRole) return urlRole;
    try {
      const u = getStoredUser();
      return u?.role || null;
    } catch (e) {
      return null;
    }
  });

  // Sync strokesRef with React state for drawAll() to work correctly
  // This is safe because it's not called during high-frequency updates
  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  // REMOVED: Automatic sync effect. We now manually update strokesRef when modifying state.
  // useEffect(() => { strokesRef.current = strokes; }, [strokes]);
  
  // PDF state
  const [pdfLib, setPdfLib] = useState<any | null>(null);
  const [pdf, setPdf] = useState<any | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  // local copy of selected PDF file so remote events can update it
  const [localPdfFile, setLocalPdfFile] = useState<File | null>(pdfFile ?? null);
  const [remotePdfData, setRemotePdfData] = useState<any | null>(null);

  useEffect(() => {
    // if parent passes a pdfFile prop update local copy
    if (pdfFile) setLocalPdfFile(pdfFile);
  }, [pdfFile]);
  const [whiteboardWidth, setWhiteboardWidth] = useState(width);
  const [whiteboardHeight, setWhiteboardHeight] = useState(height);
  const [canvasHeight, setCanvasHeight] = useState(height - 48);
  // Eraser cursor position
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [showCursor, setShowCursor] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const handleToggleRecording = useCallback(async () => {
    try {
      if (isRecording) {
        if (confirm('確定要停止錄影嗎？\n(Stop Recording?)')) {
          setIsRecording(false);
          // In a real implementation, call: await fetch('/api/agora/recording/stop', ...);
          alert('錄影已停止，影片處理中...');
        }
      } else {
        if (confirm('確定要開始錄影嗎？\n(Start Recording?)')) {
          setIsRecording(true);
          // In a real implementation, call: await fetch('/api/agora/recording/start', ...);
        }
      }
    } catch (e) {
      console.error('Recording toggle failed', e);
      setIsRecording(false);
    }
  }, [isRecording]);
  
  // Use Netless whiteboard if room is provided and no PDF is loaded
  const useNetlessWhiteboard = Boolean(room && whiteboardRef && !pdfFile && !localPdfFile);

  // Keep a ref of strokes as the Single Source of Truth for drawing to avoid React render cycles
  // during high-frequency updates. We manually sync this ref.
  const strokesRef = useRef<Stroke[]>(strokes);
  // Map to track how many points have been drawn for each stroke (incremental drawing)
  const lastDrawnPointMapRef = useRef<Map<string, number>>(new Map());
  // Track IDs of strokes that have been confirmed by the server to distinguish "new peer strokes" from "deleted strokes"
  const syncedStrokeIdsRef = useRef<Set<string>>(new Set());

  // Snapshot pusher (SNAPSHOT_MODE): debounced write of the whole current board as
  // a single 'snapshot' event → the server overwrites one item per room. No
  // per-stroke / per-point rows ever hit the DB.
  const pushSnapshot = useCallback(async () => {
    try {
      const uuid = channelName || 'default';
      await fetch('/api/whiteboard/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          uuid,
          event: { type: 'snapshot', strokes: strokesRef.current, pdf: null, clientId: clientIdRef.current },
        }),
      });
    } catch (e) {
      console.warn('[WB SNAPSHOT] push failed', e);
    }
  }, [channelName]);
  // Throttle + trailing edge: fire immediately if it has been >= MAXWAIT since the
  // last snapshot, otherwise ensure exactly one trailing write lands at the window
  // boundary. This bounds peer latency to ~MAXWAIT during continuous drawing while
  // still coalescing bursts (and a final trailing snapshot lands after drawing stops).
  scheduleSnapshotRef.current = () => {
    // In RTC mode the snapshot is only a recovery backstop (live sync is P2P), so
    // write far less often; otherwise it is the live transport and must be prompt.
    const MAXWAIT = RTC_MODE ? 5000 : 1500;
    const fire = () => {
      if (snapshotTimerRef.current) { clearTimeout(snapshotTimerRef.current); snapshotTimerRef.current = null; }
      lastSnapshotAtRef.current = Date.now();
      void pushSnapshot();
    };
    const since = Date.now() - lastSnapshotAtRef.current;
    if (since >= MAXWAIT) { fire(); return; }
    if (!snapshotTimerRef.current) {
      snapshotTimerRef.current = setTimeout(fire, MAXWAIT - since);
    }
  };

  useEffect(() => { setMounted(true); }, []);

  // load current user role and admin settings (permissions)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadSettings = async () => {
      try {
        const res = await fetch('/api/admin/settings');
        const j = await res.json();
        const s = j?.settings || j;
        // settings may contain whiteboardPermissions map at top-level
        const perms = s?.whiteboardPermissions || null;
        setWhiteboardPermissions(perms);
      } catch (e) {
        console.warn('Failed to load admin settings', e);
        setWhiteboardPermissions(null);
      }
    };
    loadSettings();

    const handler = () => { loadSettings(); };
    window.addEventListener('tutor:admin-settings-changed', handler as EventListener);
    return () => { window.removeEventListener('tutor:admin-settings-changed', handler as EventListener); };
  }, []);
  
  // Cleanup render task on unmount
  useEffect(() => {
    return () => {
      if (currentRenderTask.current) {
        try {
          currentRenderTask.current.cancel();
        } catch (e) {
          // Ignore cancellation errors
        }
        currentRenderTask.current = null;
      }
    };
  }, []);

  // Removed: Cleanup pending ack timers useEffect
  // ACK mechanism has been removed in favor of production polling
  
  // Debug: log whiteboard mode
  useEffect(() => {
    console.log('EnhancedWhiteboard mode:', {
      useNetlessWhiteboard,
      hasRoom: !!room,
      hasWhiteboardRef: !!whiteboardRef,
      whiteboardRefCurrent: !!whiteboardRef?.current
    });
  }, [useNetlessWhiteboard, room, whiteboardRef]);
  
  // Ensure room is bound when whiteboardRef becomes available
  useEffect(() => {
    if (room && whiteboardRef?.current) {
      console.log('EnhancedWhiteboard: Attempting to bind room to ref');
      try {
        // Check if already bound
        if (room._displayer?.div === whiteboardRef.current) {
          console.log('EnhancedWhiteboard: Room already bound to this div');
          return;
        }
        
        // Bind the room
        room.bindHtmlElement(whiteboardRef.current);
        console.log('EnhancedWhiteboard: Successfully bound room to whiteboardRef');
        
        // Force refresh
        if (typeof room.refreshViewSize === 'function') {
          room.refreshViewSize();
          console.log('EnhancedWhiteboard: Called refreshViewSize');
        }
      } catch (e) {
        console.error('EnhancedWhiteboard: Failed to bind room:', e);
      }
    }
  }, [room, whiteboardRef]);

  // Load pdfjs library
  useEffect(() => {
    if (!mounted) return;
    (async () => {
      try {
        const { getPdfLib } = await import('@/lib/pdfUtils');
        try {
          const lib = await getPdfLib();
          setPdfLib(lib);
        } catch (innerErr) {
          console.warn('PDF support not available or failed to initialize', innerErr);
          setPdfLib(null);
        }
      } catch (e) {
        console.warn('Failed to load pdfUtils helper', e);
        setPdfLib(null);
      }
    })();
  }, [mounted]);

  // Load PDF from server on mount
  // Load PDF file
  useEffect(() => {
    const activePdfFile = localPdfFile ?? pdfFile;
    
    // Check if we have remote PDF data
    if (!pdfLib) {
      setPdf(null);
      setNumPages(0);
      setCurrentPage(1);
      setWhiteboardWidth(width);
      setWhiteboardHeight(height);
      setCanvasHeight(height - 48);
      return;
    }

    if (remotePdfData && !activePdfFile) {
      // Load PDF from remote data (base64)
      (async () => {
        try {
          const base64Data = remotePdfData.data;
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          const loadingTask = (pdfLib as any).getDocument({ data: bytes });
          const loadedPdf = await loadingTask.promise;
          setPdf(loadedPdf);
          setNumPages(loadedPdf.numPages);
          setCurrentPage(remotePdfData.currentPage || 1);
          
          // Calculate whiteboard size based on PDF
          const page = await loadedPdf.getPage(1);
          const scale = 1.5;
          const viewport = page.getViewport({ scale });
          const logicalWidth = viewport.width;
          const logicalHeight = viewport.height;
          setWhiteboardWidth(logicalWidth);
          setWhiteboardHeight(logicalHeight + 48);
          setCanvasHeight(logicalHeight);
        } catch (e) {
          console.error('Failed to load remote PDF', e);
        }
      })();
      return;
    }

    if (!activePdfFile) {
      setPdf(null);
      setNumPages(0);
      setCurrentPage(1);
      setWhiteboardWidth(width);
      setWhiteboardHeight(height);
      setCanvasHeight(height - 48);
      return;
    }
    
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const loadingTask = (pdfLib as any).getDocument({ data });
        const loadedPdf = await loadingTask.promise;
        setPdf(loadedPdf);
        setNumPages(loadedPdf.numPages);
        setCurrentPage(1);
        // Calculate whiteboard size based on PDF
        const page = await loadedPdf.getPage(1);
        const scale = 1.5;
        const viewport = page.getViewport({ scale });
        const logicalWidth = viewport.width;
        const logicalHeight = viewport.height;
        setWhiteboardWidth(logicalWidth);
        setWhiteboardHeight(logicalHeight + 48);
        setCanvasHeight(logicalHeight);
      } catch (e) {
        console.error('Failed to load PDF', e);
      }
    };
    reader.readAsArrayBuffer(activePdfFile as File);
  }, [pdfLib, pdfFile, localPdfFile, remotePdfData]);

  // Render current PDF page to background canvas
  useEffect(() => {
    if (!pdf || !bgCanvasRef.current || currentPage < 1 || currentPage > numPages) return;

    (async () => {
      try {
        // Cancel any ongoing render task
        if (currentRenderTask.current) {
          try {
            currentRenderTask.current.cancel();
          } catch (e) {
            // Ignore cancellation errors
          }
        }

        const page = await pdf.getPage(currentPage);
        const bgCanvas = bgCanvasRef.current;
        if (!bgCanvas) return;

        const dpr = window.devicePixelRatio || 1;
        const scale = 1.5;
        const renderViewport = page.getViewport({ scale: scale * dpr });

        // Set canvas dimensions (Physical pixels)
        bgCanvas.width = renderViewport.width;
        bgCanvas.height = renderViewport.height;
        
        // Set canvas CSS dimensions (Logical pixels)
        const logicalWidth = renderViewport.width / dpr;
        const logicalHeight = renderViewport.height / dpr;
        
        bgCanvas.style.width = `${logicalWidth}px`;
        bgCanvas.style.height = `${logicalHeight}px`;
        
        // Position at top-left
        bgCanvas.style.left = '0px';
        bgCanvas.style.top = '0px';

        const ctx = bgCanvas.getContext('2d');
        if (!ctx) return;

        const renderTask = page.render({ canvasContext: ctx, viewport: renderViewport });
        currentRenderTask.current = renderTask;
        await renderTask.promise;
        currentRenderTask.current = null;
      } catch (e) {
        console.error('Failed to render PDF page', e);
        currentRenderTask.current = null;
      }
    })();
  }, [pdf, currentPage, numPages]);

  const currentPageRef = useRef(currentPage);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  // expose simple helpers for existing controls that call global __wb_setTool / __wb_setColor
  useEffect(() => {
    if (!mounted) return;
    try {
      (window as any).__wb_methods = ['setTool', 'setColor', 'undo', 'redo', 'clear'];
      (window as any).__wb_setTool = (t: string) => {
        if (t === 'eraser') setTool('eraser');
        else setTool('pencil');
      };
      (window as any).__wb_setColor = (c: string | number[]) => {
        if (Array.isArray(c)) {
          setColor(`#${((1 << 24) + (c[0] << 16) + (c[1] << 8) + c[2]).toString(16).slice(1)}`);
        } else {
          setColor(String(c));
        }
      };
      (window as any).__wb_undo = () => undo();
      (window as any).__wb_redo = () => redo();
      (window as any).__wb_clear = () => clearAll();
      (window as any).__wb_setWidth = (n: number) => { if (Number.isFinite(n) && n > 0) setStrokeWidth(Number(n)); };
      (window as any).__wb_strokeCount = () => strokesRef.current.length; // test hook (late-join / reconnect)
    } catch (e) {
      // ignore
    }
    return () => {
      try {
        delete (window as any).__wb_setTool;
        delete (window as any).__wb_setColor;
        delete (window as any).__wb_methods;
        delete (window as any).__wb_undo;
        delete (window as any).__wb_redo;
        delete (window as any).__wb_clear;
        delete (window as any).__wb_setWidth;
        delete (window as any).__wb_strokeCount;
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const isActionAllowed = useCallback((actionKey: string) => {
    // If editable prop explicitly disabled, deny all actions (respects dynamic plan/role gating)
    if (!editable) return false;
    // If admin settings are not configured, allow by default
    if (!whiteboardPermissions) return true;
    // If settings exist but we couldn't determine role, deny to be safe
    if (!currentUserRoleId) return false;
    const allowed = whiteboardPermissions[actionKey];
    if (!Array.isArray(allowed)) return true;
    return allowed.includes(currentUserRoleId);
  }, [currentUserRoleId, editable, whiteboardPermissions]);


  // Helper for incremental drawing (avoid clearing canvas)
  // CRITICAL: This is the core drawing method used for both pen and eraser.
  // It uses canvas composite operations to layer strokes correctly.
  const drawIncremental = useCallback((stroke: Stroke, startIndex: number) => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    // Only draw if on current page
    if ((stroke.page ?? 1) !== currentPage) return;

    const dpr = window.devicePixelRatio || 1;
    const displayW = el.width / dpr;
    const displayH = el.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    
    // CRITICAL: Eraser uses 'destination-out' to actually remove pixels (not draw white/black)
    // This ensures eraser works transparently and doesn't create colored artifacts
    if (stroke.mode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      // For eraser, strokeStyle doesn't matter (we're removing pixels)
      // but lineWidth determines eraser size
      ctx.lineWidth = stroke.strokeWidth;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.stroke;
      ctx.lineWidth = stroke.strokeWidth;
    }
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    const points = stroke.points;
    if (points.length <= startIndex) {
        ctx.restore();
        return;
    }
    
    let i = startIndex;
    if (startIndex >= 2) {
       // connect from last point
       ctx.moveTo(points[startIndex-2] * displayW, points[startIndex-1] * displayH);
    } else {
       ctx.moveTo(points[0] * displayW, points[1] * displayH);
       i = 2; // start lineTo from 2nd point
    }

    for (; i < points.length; i += 2) {
      ctx.lineTo(points[i] * displayW, points[i + 1] * displayH);
    }
    ctx.stroke();
    ctx.restore();
  }, [currentPage]);

  // Track last drawn stroke count to avoid unnecessary redraws
  const lastDrawnStrokeCountRef = useRef<number>(0);

  // draw all strokes into the canvas (coordinates are normalized 0..1)
  const drawAll = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    const currentStrokes = strokesRef.current;
    const currentCount = currentStrokes.length;
    
    // Skip full redraw ONLY if applying remote updates incrementally
    // This prevents unnecessary redraws while still allowing state-triggered redraws
    if (currentCount === lastDrawnStrokeCountRef.current && lastDrawnPointMapRef.current.size > 0 && applyingRemoteRef.current) {
      console.log('[WB DRAW] Skipping full redraw during incremental remote update');
      return;
    }
    
    lastDrawnStrokeCountRef.current = currentCount;

    const dpr = window.devicePixelRatio || 1;

    // Reset transform and clear full pixel buffer, then scale to CSS pixels
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.scale(dpr, dpr);

    const displayW = el.width / dpr;
    const displayH = el.height / dpr;
    
    // reset incremental map on full redraw
    lastDrawnPointMapRef.current.clear();

    currentStrokes.forEach((s) => {
      // Only draw strokes for current page (default to page 1 for legacy strokes)
      if ((s.page ?? 1) !== currentPage) return;
      
      // Update map so we don't re-draw these incrementally if we get a partial update later
      lastDrawnPointMapRef.current.set((s as any).id, s.points.length);

      if (s.points.length < 2) return;
      
      // CRITICAL: Set composite operation BEFORE setting stroke styles
      ctx.globalCompositeOperation = s.mode === 'erase' ? 'destination-out' : 'source-over';
      
      if (s.mode === 'erase') {
        // For eraser, strokeStyle doesn't matter (removing pixels)
        ctx.lineWidth = s.strokeWidth;
      } else {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = s.strokeWidth;
      }
      
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      // Scale normalized coordinates back to display pixels
      ctx.moveTo(s.points[0] * displayW, s.points[1] * displayH);
      for (let i = 2; i < s.points.length; i += 2) {
        ctx.lineTo(s.points[i] * displayW, s.points[i + 1] * displayH);
      }
      ctx.stroke();
    });
  }, [currentPage]);

  // Attach non-passive touch listeners to prevent page scroll while drawing on mobile
  

  const getPointerPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): { x: number; y: number } => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      const touch = e.touches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    // Return normalized coordinates (0..1)
    return { 
      x: (clientX - rect.left) / rect.width, 
      y: (clientY - rect.top) / rect.height 
    };
  };

  const handlePointerDown = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isActionAllowed('draw')) return;
    isDrawingRef.current = true;
    const pos = getPointerPos(e);
    const timestamp = Date.now();
    const newStroke: Stroke & { id?: string; origin?: string } = { page: currentPage, points: [pos.x, pos.y], stroke: color, strokeWidth, mode: tool === 'eraser' ? 'erase' : 'draw', id: `${clientIdRef.current}_${timestamp}`, timestamp, origin: clientIdRef.current };
    
    // DEBUG: Log created stroke
    console.log('[WB] Creating stroke:', { id: newStroke.id, mode: newStroke.mode, tool, strokeWidth: newStroke.strokeWidth });
    
    // Sync Ref first (Source of Truth)
    strokesRef.current.push(newStroke);
    // OPTIMIZED: Draw locally immediately, NO state sync to avoid triggering drawAll
    drawIncremental(newStroke, 0);
    if (newStroke.id) lastDrawnPointMapRef.current.set(newStroke.id, newStroke.points.length);
    lastDrawnStrokeCountRef.current = strokesRef.current.length;
    
    setUndone([]);
    currentStrokeIdRef.current = newStroke.id as string;
    try {
      if (!useNetlessWhiteboard && bcRef.current) {
        bcRef.current.postMessage({ type: 'stroke-start', stroke: newStroke, clientId: clientIdRef.current });
      }
      // also relay to server for cross-device
      if (!useNetlessWhiteboard) {
        console.log('[WB] Posting stroke-start to server');
        postEventToServer({ type: 'stroke-start', stroke: newStroke });
      }
    } catch (e) { console.error('[WB] Error in handlePointerDown:', e); }
  }, [tool, color, strokeWidth, currentPage, postEventToServer, isActionAllowed, useNetlessWhiteboard]);

  const handlePointerMove = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const pos = getPointerPos(e);
    
    const strokes = strokesRef.current;
    if (strokes.length === 0) return;
    const lastIndex = strokes.length - 1;
    const last = strokes[lastIndex];
    if (!last) return;
    
    // Direct update to Ref
    const oldLength = last.points.length;
    const updated = { ...last, points: last.points.concat([pos.x, pos.y]) };
    strokes[lastIndex] = updated;
    
    // CRITICAL FIX: Draw incrementally immediately for local user
    // This ensures the teacher sees their own drawing in real-time
    const strokeId = (updated as any).id;
    const lastDrawnCount = lastDrawnPointMapRef.current.get(strokeId) || 0;
    if (updated.points.length > lastDrawnCount) {
      drawIncremental(updated, lastDrawnCount);
      lastDrawnPointMapRef.current.set(strokeId, updated.points.length);
    }
    
    // NO state sync here - only ref updates to avoid flickering
    
    try {
        if (!useNetlessWhiteboard && bcRef.current && (last as any).origin !== clientIdRef.current) {
          // don't re-broadcast remote-applied strokes
        } else if (!useNetlessWhiteboard && bcRef.current) {
          bcRef.current.postMessage({ type: 'stroke-update', strokeId: (updated as any).id, points: updated.points, clientId: clientIdRef.current });
        }
        // also post to server
        if (!useNetlessWhiteboard && (last as any).origin === clientIdRef.current) {
          // enqueue high-frequency updates to reduce network/SSE load
          enqueueStrokeUpdate((updated as any).id, updated.points);
        }
    } catch (e) {}
  }, [enqueueStrokeUpdate, useNetlessWhiteboard, drawIncremental]);

  const handlePointerUp = useCallback(() => {
    isDrawingRef.current = false;
    // flush any pending updates for the stroke that just finished
    try {
      const sid = currentStrokeIdRef.current;
      if (sid) {
        // Send the FINAL, complete points over the reliable path (final:true) so any
        // dropped unreliable deltas are repaired on the peer.
        const stroke = strokesRef.current.find((st) => (st as any).id === sid);
        const points = stroke ? stroke.points : pendingUpdatesRef.current.get(sid)?.points;
        if (points) {
          try { postEventToServer({ type: 'stroke-update', strokeId: sid, points, final: true }); } catch (e) {}
        }
        pendingUpdatesRef.current.delete(sid);
      }
    } catch (e) {}
  }, []);

  const undo = useCallback(() => {
    if (!isActionAllowed('undo')) return;
    const strokes = strokesRef.current;
    if (strokes.length === 0) return;
    const last = strokes[strokes.length - 1];
    
    // Sync Ref
    const nextStrokes = strokes.slice(0, -1);
    strokesRef.current = nextStrokes;
    
    // Remove from tracking map
    const strokeId = (last as any).id;
    if (strokeId) {
      lastDrawnPointMapRef.current.delete(strokeId);
    }
    
    // Force full redraw (necessary for erase mode strokes)
    lastDrawnStrokeCountRef.current = 0;
    setStrokes(nextStrokes);
    
    setUndone((u) => [...u, last]);
    
    try { if (!useNetlessWhiteboard && bcRef.current) bcRef.current.postMessage({ type: 'undo', strokeId: (last as any).id, clientId: clientIdRef.current }); } catch (e) {}
    try { if (!useNetlessWhiteboard) postEventToServer({ type: 'undo', strokeId: (last as any).id }); } catch (e) {}
  }, [isActionAllowed, useNetlessWhiteboard, postEventToServer]);

  const redo = useCallback(() => {
    if (!isActionAllowed('redo')) return;
    setUndone((u) => {
      if (u.length === 0) return u;
      const last = u[u.length - 1];
      
      // Sync Ref
      strokesRef.current.push(last);
      
      // Force full redraw
      lastDrawnStrokeCountRef.current = 0;
      setStrokes([...strokesRef.current]);
      
      try { if (!useNetlessWhiteboard && bcRef.current) bcRef.current.postMessage({ type: 'redo', stroke: last, clientId: clientIdRef.current }); } catch (e) {}
      try { if (!useNetlessWhiteboard) postEventToServer({ type: 'redo', stroke: last }); } catch (e) {}
      return u.slice(0, -1);
    });
  }, [isActionAllowed, useNetlessWhiteboard, postEventToServer]);

  const clearAll = useCallback(() => {
    if (!isActionAllowed('clear')) return;
    
    // CRITICAL: Clear all state immediately
    strokesRef.current = [];
    setStrokes([]);
    lastDrawnPointMapRef.current.clear();
    lastDrawnStrokeCountRef.current = 0;
    syncedStrokeIdsRef.current.clear();
    setUndone([]);
    
    // Immediate full canvas clear with proper transform reset
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Reset composite operation to default
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    
    // Broadcast to local tabs
    try { 
      if (!useNetlessWhiteboard && bcRef.current) {
        bcRef.current.postMessage({ type: 'clear', clientId: clientIdRef.current }); 
      }
    } catch (e) { console.error('[WB] BC clear failed:', e); }
    
    // Send to server for persistence (ensures production polling won't restore old state)
    try { 
      if (!useNetlessWhiteboard) {
        postEventToServer({ type: 'clear' }).then(() => {
          console.log('[WB] Clear event persisted to server');
        }).catch((e) => {
          console.error('[WB] Failed to persist clear event:', e);
          pushError('清除同步失敗，請重試');
        });
      }
    } catch (e) { console.error('[WB] Clear server sync failed:', e); }
  }, [isActionAllowed, useNetlessWhiteboard, postEventToServer, pushError]);

  const changePage = useCallback((newPage: number) => {
    // Only teacher can change page
    if (currentUserRoleId !== 'teacher') return;
    if (newPage < 1 || newPage > numPages) return;
    
    setCurrentPage(newPage);
    try { 
      if (!useNetlessWhiteboard && bcRef.current) 
        bcRef.current.postMessage({ type: 'set-page', page: newPage, clientId: clientIdRef.current }); 
    } catch (e) {}
    try { 
      if (!useNetlessWhiteboard) 
        postEventToServer({ type: 'set-page', page: newPage });
    } catch (e) {}
  }, [numPages, currentUserRoleId, useNetlessWhiteboard, postEventToServer]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'eraser') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      setCursorPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setShowCursor(true);
    } else {
      setShowCursor(false);
    }
    handlePointerMove(e);
  }, [tool, handlePointerMove]);

  const handleCanvasMouseEnter = useCallback(() => {
    if (tool === 'eraser') {
      setShowCursor(true);
    }
  }, [tool]);

  const handleCanvasMouseLeave = useCallback(() => {
    setShowCursor(false);
    handlePointerUp();
  }, [handlePointerUp]);

  // Apply a remote whiteboard event to the local canvas. Shared by BroadcastChannel,
  // SSE, and the WebRTC DataChannel so every transport renders identically. `reply`
  // lets a transport answer a 'request-state' back over itself; `opts.mergeById`
  // merges a received full state by stroke id (used for RTC late-join, keeping any
  // local strokes the peer hasn't seen). Kept in a ref so transports stay stable.
  const applyRemoteEvent = (data: any, reply?: (msg: any) => void, opts?: { mergeById?: boolean }) => {
    if (!data || data.clientId === clientIdRef.current) return; // ignore our own
    try {
      if (data.type === 'setColor') {
        try {
          if (data.color) {
            if (Array.isArray(data.color)) {
              const c = data.color as number[];
              setColor(`#${((1 << 24) + (c[0] << 16) + (c[1] << 8) + c[2]).toString(16).slice(1)}`);
            } else {
              setColor(String(data.color));
            }
          }
        } catch (e) {}
        return;
      }
      if (data.type === 'setTool') {
        try { if (data.tool === 'eraser') setTool('eraser'); else setTool('pencil'); } catch (e) {}
        return;
      }
      if (data.type === 'setWidth') {
        try { if (typeof data.width === 'number') setStrokeWidth(Number(data.width)); } catch (e) {}
        return;
      }
      if (data.type === 'set-page') {
        if (typeof data.page === 'number') setCurrentPage(data.page);
        return;
      }
      if (data.type === 'pdf-set') {
        (async () => {
          try {
            const resp = await fetch(data.dataUrl);
            const blob = await resp.blob();
            const file = new File([blob], data.name || 'remote.pdf', { type: blob.type });
            setSelectedFileName(file.name);
            setLocalPdfFile(file);
          } catch (e) {
            console.error('[WB] Failed to apply remote PDF', e);
          }
        })();
        return;
      }
      if (data.type === 'pts') {
        // Unreliable point delta (DataChannel only). Append the new tail; a gap
        // (earlier packet lost) is ignored — the reliable final stroke-update repairs it.
        const idx = strokesRef.current.findIndex((st) => (st as any).id === data.strokeId);
        if (idx >= 0) {
          const stroke = strokesRef.current[idx];
          const res = applyPointsDelta(stroke.points, data);
          if (res.applied) {
            stroke.points = res.points;
            const lastCount = lastDrawnPointMapRef.current.get(data.strokeId) || 0;
            if (res.points.length > lastCount) {
              drawIncremental(stroke, lastCount);
              lastDrawnPointMapRef.current.set(data.strokeId, res.points.length);
            }
          }
        }
        return;
      }
      if (data.type === 'stroke-start') {
        applyingRemoteRef.current = true;
        const stroke = data.stroke;
        const id = data.strokeId || stroke.id;
        if (!strokesRef.current.some(st => (st as any).id === id)) {
          strokesRef.current.push(stroke);
          drawIncremental(stroke, 0);
          if (id) lastDrawnPointMapRef.current.set(id, stroke.points.length);
          lastDrawnStrokeCountRef.current = strokesRef.current.length;
          setStrokes([...strokesRef.current]);
        }
        applyingRemoteRef.current = false;
      } else if (data.type === 'stroke-update') {
        applyingRemoteRef.current = true;
        const strokeId = data.strokeId;
        const points = data.points;
        const malformed = !Array.isArray(points) || points.some((p: any) => typeof p !== 'number' || Number.isNaN(p));
        if (malformed) {
          if (verboseLogging) logAnomaly('received malformed stroke-update (points invalid)', { strokeId, points });
        } else {
          const strokes = strokesRef.current;
          const idx = strokes.findIndex((st) => (st as any).id === strokeId);
          if (idx >= 0) {
            const stroke = strokes[idx];
            stroke.points = points; // final/full points repair any dropped deltas
            const lastCount = lastDrawnPointMapRef.current.get(strokeId) || 0;
            if (points.length > lastCount) {
              drawIncremental(stroke, lastCount);
              lastDrawnPointMapRef.current.set(strokeId, points.length);
            }
          } else if (verboseLogging) {
            logAnomaly('orphaned stroke-update ignored', { strokeId });
          }
        }
        applyingRemoteRef.current = false;
      } else if (data.type === 'undo') {
        applyingRemoteRef.current = true;
        const next = strokesRef.current.filter((st) => (st as any).id !== data.strokeId);
        strokesRef.current = next;
        lastDrawnPointMapRef.current.delete(data.strokeId);
        lastDrawnStrokeCountRef.current = 0;
        setStrokes(next);
        applyingRemoteRef.current = false;
      } else if (data.type === 'redo') {
        applyingRemoteRef.current = true;
        strokesRef.current.push(data.stroke);
        lastDrawnStrokeCountRef.current = 0;
        setStrokes([...strokesRef.current]);
        applyingRemoteRef.current = false;
      } else if (data.type === 'clear') {
        applyingRemoteRef.current = true;
        strokesRef.current = [];
        lastDrawnPointMapRef.current.clear();
        lastDrawnStrokeCountRef.current = 0;
        syncedStrokeIdsRef.current.clear();
        setStrokes([]);
        setUndone([]);
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = 'source-over';
          }
        }
        applyingRemoteRef.current = false;
      } else if (data.type === 'request-state') {
        reply?.({ type: 'state', strokes: strokesRef.current, page: currentPageRef.current, clientId: clientIdRef.current });
      } else if (data.type === 'state') {
        if (typeof data.page === 'number') setCurrentPage(data.page);
        applyingRemoteRef.current = true;
        if (opts?.mergeById && Array.isArray(data.strokes)) {
          // RTC late-join: remote wins per id, keep local-only strokes.
          const merged = mergeStateById(strokesRef.current as any[], data.strokes) as Stroke[];
          strokesRef.current = merged;
          lastDrawnPointMapRef.current.clear();
          lastDrawnStrokeCountRef.current = 0; // force full redraw
          setStrokes(merged);
        } else {
          setStrokes((local) => {
            if (local.length === 0 && Array.isArray(data.strokes)) return data.strokes;
            return local;
          });
        }
        applyingRemoteRef.current = false;
      }
    } catch (e) {
      console.error('[WB apply] Error handling incoming event:', e);
      if (verboseLogging) { pushError('[WB apply] Error handling incoming event'); logAnomaly('apply handler error', e); }
    }
  };
  const applyRemoteEventRef = useRef(applyRemoteEvent);
  applyRemoteEventRef.current = applyRemoteEvent;

  // BroadcastChannel setup for canvas sync (per-page channel)
  useEffect(() => {
    if (useNetlessWhiteboard) return;
    if (typeof window === 'undefined') return;
    try {
      const bcName = `whiteboard_${channelName || 'default'}`;
      const ch = new BroadcastChannel(bcName);
      bcRef.current = ch;
      ch.onmessage = (ev: MessageEvent) => {
        applyRemoteEventRef.current(ev.data, (m) => { try { ch.postMessage(m); } catch (e) {} });
      };

      // ask for state from others (store timer so it can be cleared if channel closes)
      let stateRequestTimer: number | null = null;
      try {
        stateRequestTimer = window.setTimeout(() => {
          try {
            // only attempt post if channel still exists
            if (ch) ch.postMessage({ type: 'request-state', clientId: clientIdRef.current });
          } catch (e) {
            console.error('[WB BC] Failed to request state from channel', e);
          }
        }, 200) as unknown as number;
      } catch (e) {
        // ignore timer setup failures
      }

      return () => {
        try { if (stateRequestTimer) { window.clearTimeout(stateRequestTimer); stateRequestTimer = null; } } catch (e) {}
        try { ch.close(); } catch (e) { console.warn('[WB BC] Error closing channel', e); }
        try { bcRef.current = null; } catch (e) {}
      };
    } catch (e) {
      console.error('[WB BC] BroadcastChannel setup failed:', e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useNetlessWhiteboard, setStrokes, setUndone]);

  // WebRTC DataChannel transport (RTC_MODE): a P2P connection carries live strokes
  // over UDP for Agora-like smoothness, with zero DB writes on the data path.
  // - Deterministic offerer election (teacher offers; tie → lexicographic id) so two
  //   editable peers never both offer.
  // - Two channels: wb-ctl (reliable) for control + final strokes; wb-pts
  //   (unreliable, no retransmit) for in-progress point deltas — lost packets are
  //   never retransmitted, and the reliable final update repairs any gap.
  // - Late-join: on open the peer requests the board, answered as chunked state.
  // - Reconnect: connection failure re-handshakes with exponential backoff.
  // - Signaling: the classroom's realtime channel (rtcSignal) when provided, else a
  //   DB-polled mailbox. ICE (STUN/TURN) from /api/whiteboard/ice; real networks add
  //   Cloudflare TURN (shares the 1TB); localhost uses host candidates.
  useEffect(() => {
    if (!RTC_MODE || useNetlessWhiteboard || typeof window === 'undefined') return;
    const channel = channelName || 'default';
    const selfRole: WbRtcRole = rtcRole ?? (editable ? 'teacher' : 'student');
    const selfId = rtcSelfIdRef.current;
    const forceRelay = process.env.NEXT_PUBLIC_WHITEBOARD_RTC_FORCE_RELAY === '1';
    let stopped = false;
    let gen = 0;
    let active: { pc: RTCPeerConnection; cleanup: () => void } | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;
    // Persist across reconnects so already-processed mailbox messages (old offers /
    // candidates) are never replayed onto a fresh peer connection.
    const seen = new Set<string>();

    const getIce = async (): Promise<RTCIceServer[]> => {
      try {
        const r = await fetch('/api/whiteboard/ice');
        const j = await r.json();
        return Array.isArray(j?.iceServers) ? j.iceServers : [];
      } catch { return []; }
    };

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        backoff = Math.min(30000, backoff * 2);
        start();
      }, backoff);
    };

    const start = async () => {
      if (stopped) return;
      gen += 1;
      const myGen = gen;
      if (active) { try { active.cleanup(); } catch {} active = null; }

      const iceServers = await getIce();
      if (stopped || myGen !== gen) return;
      const pc = new RTCPeerConnection({
        iceServers: iceServers.length ? iceServers : [{ urls: 'stun:stun.cloudflare.com:3478' }],
        ...(forceRelay ? { iceTransportPolicy: 'relay' as RTCIceTransportPolicy } : {}),
      });
      pcRef.current = pc;

      let peerRole: WbRtcRole | null = null;
      let peerId: string | null = null;
      let offering = false;
      let stateChunks: StateChunk[] = [];
      let pollTimer: ReturnType<typeof setTimeout> | null = null;
      let unsub: (() => void) | null = null;

      const send = (kind: string, data: unknown) => {
        if (rtcSignal) { try { rtcSignal.send(kind, data, String(myGen)); } catch {} return; }
        fetch('/api/whiteboard/signal', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ channel, role: selfId, kind, data, epoch: String(myGen), mid: `${selfId}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}` }),
        }).catch(() => {});
      };

      const wireCtl = (dc: RTCDataChannel) => {
        dcRef.current = dc;
        dc.onopen = () => {
          console.log('[WB RTC] datachannel OPEN (role=' + selfRole + ')');
          backoff = 1000;
          try { dc.send(JSON.stringify({ type: 'request-state', clientId: clientIdRef.current })); } catch {}
        };
        dc.onclose = () => { if (dcRef.current === dc) dcRef.current = null; };
        dc.onmessage = (ev) => {
          let data: any;
          try { data = JSON.parse(ev.data); } catch { return; }
          if (data?.type === 'stroke-start' && typeof data.t === 'number') {
            console.log('[WB RTC] stroke synced, latency(ms)=', Date.now() - data.t);
          }
          if (data?.type === 'request-state') {
            const chunks = chunkState(strokesRef.current as unknown[], { sid: `${selfId}-${Date.now()}`, page: currentPageRef.current });
            for (const c of chunks) { try { dc.send(JSON.stringify(c)); } catch {} }
            return;
          }
          if (data?.type === 'state-chunk') {
            stateChunks.push(data);
            const asm = assembleState(stateChunks);
            if (asm) { stateChunks = []; applyRemoteEventRef.current({ type: 'state', strokes: asm.strokes, page: asm.page }, undefined, { mergeById: true }); }
            return;
          }
          applyRemoteEventRef.current(data, (m) => { try { dc.send(JSON.stringify(m)); } catch {} }, { mergeById: true });
        };
      };
      const wirePts = (dc: RTCDataChannel) => {
        dcPtsRef.current = dc;
        dc.onmessage = (ev) => { try { applyRemoteEventRef.current(JSON.parse(ev.data)); } catch {} };
      };

      pc.ondatachannel = (ev) => {
        if (ev.channel.label === CTL_LABEL) wireCtl(ev.channel);
        else if (ev.channel.label === PTS_LABEL) wirePts(ev.channel);
      };
      pc.onicecandidate = (ev) => { if (ev.candidate) send('candidate', ev.candidate.toJSON()); };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'failed') { if (myGen === gen) scheduleReconnect(); }
        else if (st === 'disconnected') {
          setTimeout(() => {
            if (!stopped && myGen === gen && (pc.connectionState === 'disconnected' || pc.connectionState === 'failed')) scheduleReconnect();
          }, 5000);
        }
      };

      const maybeOffer = async () => {
        if (offering || stopped || myGen !== gen) return;
        if (!electOfferer({ selfRole, selfId, peerRole, peerId })) return;
        offering = true;
        isOffererRef.current = true;
        sentPointsRef.current.clear();
        wireCtl(pc.createDataChannel(CTL_LABEL, { ordered: true }));
        wirePts(pc.createDataChannel(PTS_LABEL, { ordered: false, maxRetransmits: 0 }));
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          send('offer', { type: pc.localDescription?.type, sdp: pc.localDescription?.sdp });
        } catch (e) { console.warn('[WB RTC] offer failed', e); }
      };

      const onSignal = async (m: { kind: string; data: any; from?: string; epoch?: string }) => {
        try {
          if (m.kind === 'hello') {
            peerRole = m.data?.role ?? null;
            peerId = m.data?.id ?? m.from ?? null;
            await maybeOffer();
          } else if (m.kind === 'offer') {
            if (offering) return; // glare guard: we already decided to offer
            await pc.setRemoteDescription(m.data);
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            send('answer', { type: pc.localDescription?.type, sdp: pc.localDescription?.sdp });
          } else if (m.kind === 'answer') {
            if (pc.signalingState === 'have-local-offer') await pc.setRemoteDescription(m.data);
          } else if (m.kind === 'candidate') {
            try { await pc.addIceCandidate(m.data); } catch {}
          }
        } catch (e) { console.warn('[WB RTC] signal handle failed', e); }
      };

      if (rtcSignal) {
        unsub = rtcSignal.subscribe((msg) => { void onSignal(msg); });
      } else {
        const poll = async () => {
          if (stopped || myGen !== gen) return;
          try {
            const r = await fetch(`/api/whiteboard/signal?channel=${encodeURIComponent(channel)}`);
            const j = await r.json();
            for (const m of j?.msgs ?? []) {
              if (m.role === selfId || seen.has(m.mid)) continue;
              seen.add(m.mid);
              await onSignal({ kind: m.kind, data: m.data, from: m.role, epoch: m.epoch });
            }
          } catch {}
          if (!stopped && myGen === gen) pollTimer = setTimeout(poll, 300);
        };
        poll();
      }

      // Announce ourselves; the peer's hello triggers offerer election. As a fallback
      // (peer already announced, or its hello was lost), the elected offerer also tries
      // after a short beat — with no peer info only the teacher offers.
      send('hello', { role: selfRole, id: selfId });
      setTimeout(() => { if (!stopped && myGen === gen) void maybeOffer(); }, 800);

      active = {
        pc,
        cleanup: () => {
          try { unsub?.(); } catch {}
          if (pollTimer) clearTimeout(pollTimer);
          try { dcRef.current?.close(); } catch {}
          try { dcPtsRef.current?.close(); } catch {}
          try { pc.close(); } catch {}
          if (pcRef.current === pc) pcRef.current = null;
          dcRef.current = null;
          dcPtsRef.current = null;
        },
      };
    };

    // e2e hook: force a drop to exercise reconnect.
    (window as any).__wb_rtc_debug = { drop: () => { try { active?.pc.close(); } catch {} scheduleReconnect(); } };

    void start();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (active) { try { active.cleanup(); } catch {} active = null; }
      isOffererRef.current = false;
      try { delete (window as any).__wb_rtc_debug; } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RTC_MODE, channelName, useNetlessWhiteboard, rtcRole, rtcSelfId, rtcSignal]);

  // Attach non-passive touch listeners to prevent page scroll while drawing on mobile
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    function onTouchStart(ev: TouchEvent) {
      // only prevent default for single-finger drawing
      if (ev.touches && ev.touches.length === 1) {
        ev.preventDefault();
        const touch = ev.touches[0];
        const simulated: any = { touches: ev.touches, clientX: touch.clientX, clientY: touch.clientY };
        handlePointerDown(simulated as any as React.TouchEvent<HTMLCanvasElement>);
      }
    }

    function onTouchMove(ev: TouchEvent) {
      if (isDrawingRef.current) {
        ev.preventDefault();
        const touch = ev.touches[0];
        const simulated: any = { touches: ev.touches, clientX: touch.clientX, clientY: touch.clientY };
        handlePointerMove(simulated as any as React.TouchEvent<HTMLCanvasElement>);
      }
    }

    function onTouchEnd(ev: TouchEvent) {
      if (isDrawingRef.current) {
        ev.preventDefault();
        handlePointerUp();
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      try {
        el.removeEventListener('touchstart', onTouchStart as any);
        el.removeEventListener('touchmove', onTouchMove as any);
        el.removeEventListener('touchend', onTouchEnd as any);
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlePointerDown, handlePointerMove, handlePointerUp]);

  // Keep canvas pixel size in sync with displayed size (handles rotation and DPR)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Responsive toolbar height: smaller on mobile
    const isMobilePortrait = window.innerWidth <= 768 && window.innerHeight > window.innerWidth;
    const toolbarHeight = isMobilePortrait ? 40 : 48;

    function resizeCanvasToDisplaySize() {
      // if PDF is loaded and autoFit is disabled, keep fixed size
      if (pdf && !autoFit) return;
      const c = canvasRef.current;
      if (!c) return;
      const parent = c.parentElement || c;
      const rect = parent.getBoundingClientRect();
      const displayW = rect.width;
      const displayH = Math.max(32, rect.height - toolbarHeight);

      const dpr = window.devicePixelRatio || 1;
      const pixelW = Math.max(1, Math.round(displayW * dpr));
      const pixelH = Math.max(1, Math.round(displayH * dpr));

      // set CSS size
      c.style.width = `${displayW}px`;
      c.style.height = `${displayH}px`;

      // set drawing buffer size
      if (c.width !== pixelW || c.height !== pixelH) {
        c.width = pixelW;
        c.height = pixelH;
        // apply scaling for DPR before drawing
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.scale(dpr, dpr);
        }
        // redraw strokes at new size
        drawAll();
      }
    }

    // initial resize
    resizeCanvasToDisplaySize();

    const ro = new ResizeObserver(() => {
      resizeCanvasToDisplaySize();
    });
    const parent = canvas.parentElement || canvas;
    try { ro.observe(parent); } catch (e) {}

    window.addEventListener('orientationchange', resizeCanvasToDisplaySize);
    window.addEventListener('resize', resizeCanvasToDisplaySize);

    return () => {
      try { ro.disconnect(); } catch (e) {}
      window.removeEventListener('orientationchange', resizeCanvasToDisplaySize);
      window.removeEventListener('resize', resizeCanvasToDisplaySize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawAll, pdf, autoFit]);

  // redraw when strokes change (but skip if applying remote updates)
  useEffect(() => {
    if (!applyingRemoteRef.current) {
      drawAll();
    }
  }, [strokes, drawAll]);

  // Server-side SSE subscription for cross-device sync
  useEffect(() => {
    if (useNetlessWhiteboard) {
      console.log('[WB SSE] Skipping SSE (using Netless whiteboard)');
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      // Use channelName as uuid for consistency
      const uuid = channelName || 'default';
      // SSE cannot deliver live strokes here: each Next.js route module (event vs
      // stream) has its own memory, so POST /api/whiteboard/event persists to
      // DynamoDB but broadcastToUuid() from other routes reaches a *different*
      // in-memory clients map than the one the SSE stream registered — the stream
      // only ever emits its initial state. DynamoDB is the shared source of truth,
      // so use the /api/whiteboard/state polling path (what production already
      // uses) on localhost/dev too. Opt back into raw SSE only via an explicit flag.
      const host = window.location.hostname;
      const isProduction = host === 'www.jvtutorcorner.com' || host === 'jvtutorcorner.com';
      const forceSse = process.env.NEXT_PUBLIC_WHITEBOARD_TRANSPORT === 'sse';
      const usePolling = !forceSse && (isProduction || host === 'localhost' || host === '127.0.0.1' || host === '[::1]');
      if (usePolling) {
        console.log('[WB POLL] Using DynamoDB-state polling transport (shared source of truth). uuid:', uuid);
        // Adaptive polling: fast while the board is changing or the local user is
        // drawing, easing off when idle. Sync stays near-instant during use but the
        // steady request rate (Lambda + DynamoDB reads) collapses when the board is
        // quiet — the dominant idle case in 1:1 tutoring — so cost no longer grows
        // linearly with wall-clock. `updatedAt` is bumped by every stroke add/append
        // (lib/whiteboardService), so it is an exact change signal.
        let pollTimer: ReturnType<typeof setTimeout> | null = null;
        let stopped = false;
        let intervalMs = 400;
        const ACTIVE_MS = 400;
        const IDLE_MAX_MS = 2500;
        let lastUpdatedAt = 0;
        const fetchAndApply = async (): Promise<boolean> => {
          let changed = false;
          try {
            const resp = await fetch(`/api/whiteboard/state?uuid=${encodeURIComponent(uuid)}`);
              if (!resp.ok) {
                const txt = await resp.text().catch(() => '(no body)');
                console.warn('[WB POLL] /api/whiteboard/state returned non-ok', resp.status, txt.slice(0, 200));
                if (verboseLogging) {
                  pushError(`[WB POLL] /api/whiteboard/state returned non-ok ${resp.status}`);
                  logAnomaly('Production /state returned non-ok', { status: resp.status, bodyPreview: txt?.slice(0,200) });
                }
                return false;
              }
            const j = await resp.json();
            const s = j?.state;
            const upd = Number(s?.updatedAt ?? j?.state?.updatedAt ?? 0);
            if (upd > lastUpdatedAt) { changed = true; lastUpdatedAt = upd; }
            if (s && Array.isArray(s.strokes)) {
              // INTELLIGENT MERGE STRATEGY: Avoid mutual overwrite cycles
              const localStrokes = strokesRef.current;
              const remoteStrokes = s.strokes;
              const isDrawing = isDrawingRef.current;
              
              // Quick check: if counts match, check content changes
              if (localStrokes.length === remoteStrokes.length && !isDrawing) {
                // Same count and not drawing - check if any stroke actually changed
                let hasContentChange = false;
                for (let i = 0; i < localStrokes.length; i++) {
                  const local = localStrokes[i];
                  const remote = remoteStrokes[i];
                  if ((local as any).id !== (remote as any).id || 
                      local.points?.length !== remote.points?.length) {
                    hasContentChange = true;
                    break;
                  }
                }
                if (!hasContentChange) {
                  // No actual changes, skip update to avoid flickering
                  return changed;
                }
              }
              
              // INTELLIGENT MERGE (PREVENTS FLICKERING & SUPPORTS UNDO)
              // CRITICAL: Only apply merge if we're not currently drawing
              // This prevents remote updates from interfering with active local strokes
              if (isDrawing) {
                // Skip merge while drawing to avoid disrupting user experience
                return changed;
              }
              
              // 1. Start with remote strokes (authoritative for others' actions)
              const finalStrokes: any[] = [...remoteStrokes];
              const remoteMap = new Map(remoteStrokes.map((st: any) => [st.id, st]));

              // NEW: Track synced IDs to distinguish "new peer strokes" from "deleted strokes"
              for (const s of remoteStrokes) {
                 if (s.id) syncedStrokeIdsRef.current.add(s.id);
              }
              
              // 2. Remove strokes that we locally UNDID but are still present in remote
              // This prevents undone strokes from flickering back until server proccesses the undo
              const undoneIds = new Set(undoneRef.current.map((u: any) => u.id));
              for (let i = finalStrokes.length - 1; i >= 0; i--) {
                 if (undoneIds.has(finalStrokes[i].id) && finalStrokes[i].origin === clientIdRef.current) {
                     finalStrokes.splice(i, 1);
                 }
              }
              
              // 3. Preserve strokes that haven't synced to remote yet
              // This logic now handles both "My strokes" and "Peer strokes from BC"
              for (const localStroke of localStrokes) {
                 const lid = (localStroke as any).id;
                 if (!lid) continue;
                 
                 const inRemote = remoteMap.has(lid);
                 const isMyStroke = (localStroke as any).origin === clientIdRef.current;
                 const isUndone = undoneIds.has(lid);
                 const wasSynced = syncedStrokeIdsRef.current.has(lid);
                 
                 if (!inRemote && !isUndone) {
                     // Case A: My stroke, pending upload. KEEP.
                     if (isMyStroke) {
                        finalStrokes.push(localStroke);
                     }
                     // Case B: Peer stroke (BC), never seen in remote. Optimistically KEEP.
                     // (If it WAS seen in remote before, and is not there now, it means peer deleted it. DROP).
                     else if (!wasSynced) {
                        finalStrokes.push(localStroke);
                     }
                 }
                 
                 // 4. Update points for existing strokes if local has more data (Incremental update)
                 if (inRemote) {
                     const remoteStroke = remoteMap.get(lid);
                     if (remoteStroke && localStroke.points.length > (remoteStroke as any).points?.length) {
                         const idx = finalStrokes.findIndex((s) => s.id === lid);
                         if (idx !== -1) {
                             finalStrokes[idx] = localStroke;
                         }
                     }
                 }
              }
              
              // Deep comparison: check both structure and content changes
              let hasStructuralChange = finalStrokes.length !== localStrokes.length;
              let strokesWithUpdatedPoints: Array<{stroke: any, oldLength: number}> = [];
              
              if (!hasStructuralChange) {
                // Check for strokes with updated points (incremental drawing candidates)
                for (let i = 0; i < finalStrokes.length; i++) {
                  const finalStroke = finalStrokes[i];
                  const localStroke = localStrokes[i];
                  
                  if (!localStroke || finalStroke.id !== localStroke.id) {
                    hasStructuralChange = true;
                    break;
                  }
                  
                  const finalLen = finalStroke.points?.length || 0;
                  const localLen = localStroke.points?.length || 0;
                  
                  if (finalLen > localLen) {
                    strokesWithUpdatedPoints.push({ stroke: finalStroke, oldLength: localLen });
                  } else if (finalLen < localLen) {
                    hasStructuralChange = true;
                    break;
                  }
                }
              }
              
              // Apply changes efficiently
              if (hasStructuralChange) {
                // Major change: full update needed
                // Log only significant changes (> 3 strokes difference)
                const diff = Math.abs(finalStrokes.length - localStrokes.length);
                if (diff > 3 || verboseLogging) {
                  console.log('[WB POLL] ✓ Structural change detected, full sync:', {
                    local: localStrokes.length,
                    remote: remoteStrokes.length,
                    final: finalStrokes.length
                  });
                }
                
                applyingRemoteRef.current = true;
                strokesRef.current = finalStrokes;
                setStrokes(finalStrokes);
                applyingRemoteRef.current = false;
              } else if (strokesWithUpdatedPoints.length > 0) {
                // Minor change: only points updated, use incremental drawing
                if (verboseLogging) {
                  console.log('[WB POLL] ✓ Incremental update for', strokesWithUpdatedPoints.length, 'strokes');
                }
                
                applyingRemoteRef.current = true;
                
                // Update refs and draw incrementally
                for (const { stroke, oldLength } of strokesWithUpdatedPoints) {
                  const idx = strokesRef.current.findIndex((st: any) => st.id === stroke.id);
                  if (idx >= 0) {
                    const lastDrawnCount = lastDrawnPointMapRef.current.get(stroke.id) || 0;
                    strokesRef.current[idx] = stroke;
                    
                    // Draw only new points
                    const newLen = stroke.points.length;
                    if (newLen > lastDrawnCount) {
                      drawIncremental(stroke, lastDrawnCount);
                      lastDrawnPointMapRef.current.set(stroke.id, newLen);
                    }
                  }
                }
                
                // REMOTE UPDATE: Sync state to ensure visibility
                setStrokes([...strokesRef.current]);
                
                applyingRemoteRef.current = false;
              }
              if (s.pdf) {
                // Sync PDF page if it differs from local
                if (typeof s.pdf.currentPage === 'number' && s.pdf.currentPage !== currentPageRef.current) {
                  console.log('[WB POLL] Syncing PDF page from server:', s.pdf.currentPage);
                  setCurrentPage(s.pdf.currentPage);
                }

                if (s.pdf.dataUrl && s.pdf.dataUrl !== '(large-data-url)' && !localPdfFile) {
                  try {
                    const r = await fetch(s.pdf.dataUrl);
                    const blob = await r.blob();
                    const file = new File([blob], s.pdf.name || 'remote.pdf', { type: blob.type });
                    setSelectedFileName(file.name);
                    setLocalPdfFile(file);
                  } catch (e) { console.warn('[WB POLL] Failed to fetch remote PDF', e); }
                }
              }
            }
          } catch (e) {
              const errStack = e && (e as Error).stack ? (e as Error).stack : e;
              console.warn('[WB POLL] Failed to fetch /state in production fallback', errStack);
              if (verboseLogging) {
                pushError('[WB POLL] Failed to fetch /state in production fallback');
                logAnomaly('Production /state fetch failed', { error: errStack });
              }
          }
          return changed;
        };

        // Self-scheduling adaptive loop (setTimeout, not setInterval): the next
        // delay depends on whether the last poll saw a change or we are drawing.
        const scheduleNext = () => {
          if (stopped || document.hidden) { pollTimer = null; return; }
          pollTimer = setTimeout(tick, intervalMs);
        };
        const tick = async () => {
          if (stopped) return;
          // While the RTC DataChannel is delivering live strokes, skip the DB read
          // entirely and just idle-poll as a cheap fallback probe.
          if (RTC_MODE && dcRef.current && dcRef.current.readyState === 'open') {
            intervalMs = IDLE_MAX_MS;
            scheduleNext();
            return;
          }
          let changed = false;
          try { changed = await fetchAndApply(); } catch (e) {}
          intervalMs = (changed || isDrawingRef.current)
            ? ACTIVE_MS
            : Math.min(IDLE_MAX_MS, Math.round(intervalMs * 1.5));
          scheduleNext();
        };
        // Pause entirely while the tab is hidden (nobody is watching); resume fast
        // on return so a peer's strokes appear promptly.
        const onVisibility = () => {
          if (!document.hidden && !stopped && pollTimer === null) { intervalMs = ACTIVE_MS; tick(); }
        };
        try { document.addEventListener('visibilitychange', onVisibility); } catch (e) {}
        // prime immediately, then self-schedule adaptively
        tick();

        return () => {
          stopped = true;
          try { if (pollTimer) clearTimeout(pollTimer); } catch (e) {}
          try { document.removeEventListener('visibilitychange', onVisibility); } catch (e) {}
        };
      }

      console.log('[WB SSE] Connecting to SSE stream:', `/api/whiteboard/stream?uuid=${uuid}`);
      const es = new EventSource(`/api/whiteboard/stream?uuid=${encodeURIComponent(uuid)}`);
      
      es.onopen = () => {
        console.log('[WB SSE] Connection opened successfully');
        // Try fetching persisted state as a fallback in case any messages were missed
        (async () => {
          try {
            const resp = await fetch(`/api/whiteboard/state?uuid=${encodeURIComponent(uuid)}`);
            if (resp.ok) {
              const j = await resp.json();
              const s = j?.state;
              if (s && Array.isArray(s.strokes) && strokesRef.current.length === 0) {
                console.log('[WB SSE] Applying fallback state from /state:', s.strokes.length, 'strokes');
                strokesRef.current = s.strokes; // Update ref first
                setStrokes(s.strokes); // This will trigger drawAll() via useEffect
                if (s.pdf && s.pdf.dataUrl && s.pdf.dataUrl !== '(large-data-url)') {
                  try {
                    const r = await fetch(s.pdf.dataUrl);
                    const blob = await r.blob();
                    const file = new File([blob], s.pdf.name || 'remote.pdf', { type: blob.type });
                    setSelectedFileName(file.name);
                    setLocalPdfFile(file);
                  } catch (e) {
                    // ignore
                  }
                }
              }
            }
          } catch (e) {
            // ignore fallback errors
          }
        })();
      };
      
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (!data) return;
          
          // Ignore our own events to avoid double-drawing
          if (data.clientId === clientIdRef.current) return;

          // ignore connected pings
          if (data.type === 'connected') {
            console.log('[WB SSE] Received connected message');
            return;
          }
          if (data.type === 'ping') return;

          console.log('[WB SSE] Received event:', data.type, data);

          if (data.type === 'init-state') {
            if (typeof data.page === 'number') setCurrentPage(data.page);
            console.log('[WB SSE] Applying initial state:', data.strokes?.length, 'strokes');
            if (Array.isArray(data.strokes)) {
              // Only apply initial state if local is empty to avoid wiping
              // a locally drawn stroke that may have happened just before
              // the server's init-state arrives (common race condition).
              // This prevents stale init-state from overwriting fresh strokes.
              setStrokes((local) => {
                if (local.length === 0) {
                  console.log('[WB SSE] Accepted init-state with', data.strokes.length, 'strokes');
                  strokesRef.current = data.strokes; // Update ref first
                  return data.strokes; // This will trigger drawAll() via useEffect
                } else {
                  if (verboseLogging) logAnomaly('SSE init-state ignored due to non-empty local strokes', { localCount: local.length, remoteCount: data.strokes.length });
                  console.log('[WB SSE] init-state ignored because local strokes exist:', local.length);
                  return local;
                }
              });
            }
            if (data.pdf) {
              // Restore PDF if available
              if (data.pdf.dataUrl && data.pdf.dataUrl !== '(large-data-url)') {
                (async () => {
                  try {
                    const resp = await fetch(data.pdf.dataUrl);
                    const blob = await resp.blob();
                    const file = new File([blob], data.pdf.name || 'remote.pdf', { type: blob.type });
                    setSelectedFileName(file.name);
                    setLocalPdfFile(file);
                  } catch (e) {}
                })();
              }
            }
            return;
          }

          // apply same handlers as BroadcastChannel messages
          if (data.type === 'set-page') {
            if (typeof data.page === 'number') setCurrentPage(data.page);
            return;
          }
          if (data.type === 'setColor') {
            try {
              if (data.color) {
                if (Array.isArray(data.color)) {
                  const c = data.color as number[];
                  setColor(`#${((1 << 24) + (c[0] << 16) + (c[1] << 8) + c[2]).toString(16).slice(1)}`);
                } else {
                  setColor(String(data.color));
                }
              }
            } catch (e) {}
            return;
          }
          if (data.type === 'setTool') {
            try { if (data.tool === 'eraser') setTool('eraser'); else setTool('pencil'); } catch (e) {}
            return;
          }
          if (data.type === 'setWidth') {
            try { if (typeof data.width === 'number') setStrokeWidth(Number(data.width)); } catch (e) {}
            return;
          }
          if (data.type === 'stroke-start') {
            applyingRemoteRef.current = true;
            const stroke = data.stroke;
            const id = data.strokeId || stroke.id;
            
            // DEBUG: Log received stroke
            console.log('[WB SSE] stroke-start:', { id, mode: stroke.mode, strokeWidth: stroke.strokeWidth });
            
            // Sync Ref - Avoid duplicates
            if (!strokesRef.current.some(st => (st as any).id === id)) {
                // console.log('[WB SSE] Adding new stroke:', id);
                strokesRef.current.push(stroke);
                
                // CRITICAL FIX: Draw incrementally immediately to avoid full redraw (flicker)
                drawIncremental(stroke, 0);
                if (id) lastDrawnPointMapRef.current.set(id, stroke.points.length);
                
                // Update tracking ref to prevent drawAll from running needlessly when state syncs
                lastDrawnStrokeCountRef.current = strokesRef.current.length;
                
                // REMOTE UPDATE: Must sync state to trigger student-side redraw
                setStrokes([...strokesRef.current]);
            }
            applyingRemoteRef.current = false;
          } else if (data.type === 'stroke-update') {
            // console.log('[WB SSE] Applying stroke-update:', data.strokeId);
            applyingRemoteRef.current = true;
            const strokeId = data.strokeId;
            const points = data.points;
            
            // Validate points
            const malformed = !Array.isArray(points) || points.some((p: any) => typeof p !== 'number' || Number.isNaN(p));
            if (malformed) {
                if (verboseLogging) logAnomaly('SSE received malformed stroke-update (points invalid)', { strokeId, points });
                console.warn('[WB SSE] Malformed stroke-update, ignoring:', strokeId);
            } else {
                const strokes = strokesRef.current;
                const idx = strokes.findIndex((st) => (st as any).id === strokeId);
                
                if (idx >= 0) {
                    const stroke = strokes[idx];
                    stroke.points = points; 

                    const lastCount = lastDrawnPointMapRef.current.get(strokeId) || 0;
                    if (points.length > lastCount) {
                        drawIncremental(stroke, lastCount);
                        lastDrawnPointMapRef.current.set(strokeId, points.length);
                    }
                    
                    // NO state sync - only draw incrementally to avoid flickering
                } else {
                    // CRITICAL FIX: Do NOT create a default black stroke for unknown IDs.
                    // This causes "eraser turns into black line" bugs if stroke-start is missed.
                    // Ignoring the orphan update is safer than drawing incorrect artifacts.
                    console.warn('[WB SSE] Ignored orphan stroke-update (missing start):', strokeId);
                    if (verboseLogging) logAnomaly('Orphaned stroke-update ignored', { strokeId });
                }
            }
            applyingRemoteRef.current = false;
          } else if (data.type === 'undo') {
            const next = strokesRef.current.filter((st) => (st as any).id !== data.strokeId);
            strokesRef.current = next;
            lastDrawnPointMapRef.current.delete(data.strokeId);
            lastDrawnStrokeCountRef.current = 0;
            setStrokes(next);
          } else if (data.type === 'redo') {
            strokesRef.current.push(data.stroke);
            lastDrawnStrokeCountRef.current = 0;
            setStrokes([...strokesRef.current]);
          } else if (data.type === 'clear') {
            strokesRef.current = [];
            lastDrawnPointMapRef.current.clear();
            lastDrawnStrokeCountRef.current = 0;
            syncedStrokeIdsRef.current.clear();
            setStrokes([]);
            setUndone([]);
            
            // Clear canvas immediately with proper reset
            const canvas = canvasRef.current;
            if (canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.globalCompositeOperation = 'source-over';
              }
            }
          } else if (data.type === 'pdf-set') {
            (async () => {
              try {
                const name = data.name || 'remote.pdf';
                const resp = await fetch(data.dataUrl);
                const blob = await resp.blob();
                const file = new File([blob], name, { type: blob.type });
                setSelectedFileName(file.name);
                setLocalPdfFile(file);
              } catch (e) {
                console.error('[WB SSE] Failed to apply remote pdf-set', e);
              }
            })();
          } else if (data.type === 'pdf-uploaded') {
            console.log('[WB SSE] PDF uploaded event received:', data.pdf?.name);
            if (data.pdf) {
              setRemotePdfData(data.pdf);
              setCurrentPage(data.pdf.currentPage || 1);
            }
          } else if (data.type === 'pdf-page-change' || data.type === 'set-page') {
            console.log('[WB SSE] PDF page change event received:', data.page);
            if (typeof data.page === 'number') {
              setCurrentPage(data.page);
            }
          }
        } catch (e) {
          console.error('[WB SSE] Error parsing message:', e);
        }
      };
      es.onerror = (err) => { 
        console.error('[WB SSE] Connection error:', err);
        if (verboseLogging) {
          pushError('[WB SSE] Connection error - check server or network');
          (async () => {
            try {
              const resp = await fetch(`/api/whiteboard/state?uuid=${encodeURIComponent(uuid)}`);
              const txt = await resp.text().catch(() => '(no body)');
              console.error('[WB SSE] Diagnostic /api/whiteboard/state response:', { status: resp.status, bodyPreview: txt.slice(0, 200) });
            } catch (e) {
              console.error('[WB SSE] Diagnostic fetch /state failed', e);
              logAnomaly('SSE diagnostic fetch failed', e);
            }
          })();
        }
        try { es.close(); } catch (e) { console.warn('[WB SSE] Error closing EventSource after error', e); } 
      };
      return () => { try { es.close(); } catch (e) {} };
    } catch (e) {
      console.error('[WB SSE] Setup failed:', e && (e as Error).stack ? (e as Error).stack : e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useNetlessWhiteboard]);

  return (
    <div className={`canvas-whiteboard ${className}`} style={{ border: '1px solid #ddd', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: '4px 8px', background: '#f5f5f5', borderBottom: '1px solid #ddd', flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        {errors.length > 0 && (
          <div style={{ background: 'rgba(244, 67, 54, 0.08)', color: '#c62828', padding: '6px 8px', borderRadius: 4, marginRight: 8, fontSize: 12 }}>
            <strong>Canvas Sync Error:</strong> {errors[errors.length - 1]}
          </div>
        )}
        {numPages > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 8, borderRight: '1px solid #ccc', paddingRight: 8 }}>
            {(currentUserRoleId === 'teacher') ? (
              <>
                <button 
                  onClick={() => changePage(currentPage - 1)} 
                  disabled={currentPage <= 1}
                  style={{ padding: '4px 8px', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer' }}
                >
                  &lt;
                </button>
                <span style={{ fontSize: 13, userSelect: 'none', minWidth: 40, textAlign: 'center' }}>
                  {currentPage} / {numPages}
                </span>
                <button 
                  onClick={() => changePage(currentPage + 1)} 
                  disabled={currentPage >= numPages}
                  style={{ padding: '4px 8px', cursor: currentPage >= numPages ? 'not-allowed' : 'pointer' }}
                >
                  &gt;
                </button>
              </>
            ) : (
              <span style={{ fontSize: 13, userSelect: 'none' }}>
                Page {currentPage} / {numPages}
              </span>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* PDF selector moved to /my-courses page (server-side whiteboard events). */}

          {/* Microphone and leave controls moved to the classroom sidebar; toolbar keeps drawing tools only. */}

          {isActionAllowed('setTool:pencil') && (
            <button onClick={() => {
              setTool('pencil');
              try {
                if (bcRef.current) bcRef.current.postMessage({ type: 'setTool', tool: 'pencil', clientId: clientIdRef.current });
                postEventToServer({ type: 'setTool', tool: 'pencil' });
              } catch (e) {}
            }} style={{ padding: '6px 10px', background: tool === 'pencil' ? '#e3f2fd' : 'white', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>✏️</button>
          )}
          {isActionAllowed('setTool:eraser') && (
            <button onClick={() => {
              setTool('eraser');
              try {
                if (bcRef.current) bcRef.current.postMessage({ type: 'setTool', tool: 'eraser', clientId: clientIdRef.current });
                postEventToServer({ type: 'setTool', tool: 'eraser' });
              } catch (e) {}
            }} style={{ padding: '6px 10px', background: tool === 'eraser' ? '#e3f2fd' : 'white', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>🧽</button>
          )}
        </div>
        <div>
          {isActionAllowed('setColor') && (
            <input 
              aria-label="Pen color" 
              type="color" 
              value={color} 
              onChange={(e) => {
                const newColor = e.target.value;
                setColor(newColor);
                try {
                  if (bcRef.current) bcRef.current.postMessage({ type: 'setColor', color: newColor, clientId: clientIdRef.current });
                  postEventToServer({ type: 'setColor', color: newColor });
                } catch (err) {}
              }} 
              style={{ width: 36, height: 32, padding: 0, border: 'none' }} 
            />
          )}
        </div>
        {isActionAllowed('setWidth') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>宽度:</span>
            <input
              type="range"
              min={1}
              max={30}
              value={strokeWidth}
              onChange={(e) => {
                const w = Number(e.target.value);
                setStrokeWidth(w);
                try {
                  if (bcRef.current) bcRef.current.postMessage({ type: 'setWidth', width: w, clientId: clientIdRef.current });
                  // post to server for cross-device sync
                  postEventToServer({ type: 'setWidth', width: w });
                } catch (err) {
                  // ignore
                }
              }}
              style={{ width: 60 }}
            />
            <span style={{ fontSize: 12, minWidth: 20 }}>{strokeWidth}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {isActionAllowed('undo') && (
            <button onClick={undo} style={{ padding: '6px 10px', border: '1px solid #ddd', background: 'white', borderRadius: 4, cursor: 'pointer' }} title="撤销">↶</button>
          )}
          {isActionAllowed('redo') && (
            <button onClick={redo} style={{ padding: '6px 10px', border: '1px solid #ddd', background: 'white', borderRadius: 4, cursor: 'pointer' }} title="重做">↷</button>
          )}
          {isActionAllowed('clear') && (
            <button onClick={clearAll} style={{ padding: '6px 10px', border: '1px solid #ddd', background: '#ffebee', color: '#c62828', borderRadius: 4, cursor: 'pointer' }} title="清空">🗑️</button>
          )}
          {/* onLeave is handled by the classroom controls; no leave button in the whiteboard toolbar. */}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Recording Control (Agora) */}
          {(currentUserRoleId === 'teacher' || currentUserRoleId === 'admin') && useNetlessWhiteboard && (
             <button
              onClick={handleToggleRecording}
              style={{
                padding: '4px 12px',
                background: isRecording ? '#ffebee' : 'white',
                color: isRecording ? '#d32f2f' : '#555',
                border: isRecording ? '1px solid #ff1744' : '1px solid #ddd',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 500,
                fontSize: 13,
                boxShadow: isRecording ? '0 0 5px rgba(211, 47, 47, 0.3)' : 'none'
              }}
              title={isRecording ? "點擊停止錄影 (Stop Recording)" : "點擊開始雲端錄影 (Start Cloud Recording)"}
            >
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: isRecording ? '#ff1744' : '#999',
              }} />
              {isRecording ? 'REC' : '錄影'}
            </button>
          )}

          {/* PDF Page Controls */}
          {pdf && numPages > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 8px', background: 'white', border: '1px solid #ddd', borderRadius: 4 }}>
              <button 
                onClick={() => changePage(currentPage - 1)}
                disabled={currentPage <= 1 || (currentUserRoleId !== 'teacher' && currentUserRoleId !== 'admin')}
                style={{ 
                  padding: '4px 8px', 
                  border: 'none', 
                  background: currentPage <= 1 || (currentUserRoleId !== 'teacher' && currentUserRoleId !== 'admin') ? '#e0e0e0' : '#2196f3',
                  color: currentPage <= 1 || (currentUserRoleId !== 'teacher' && currentUserRoleId !== 'admin') ? '#999' : 'white',
                  borderRadius: 4, 
                  cursor: currentPage <= 1 || (currentUserRoleId !== 'teacher' && currentUserRoleId !== 'admin') ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontWeight: 600
                }}
                title={currentUserRoleId !== 'teacher' && currentUserRoleId !== 'admin' ? '只有老師可以切換頁面' : '上一頁'}
              >
                ◀
              </button>
              <span style={{ fontSize: 13, fontWeight: 500, minWidth: 80, textAlign: 'center' }}>
                第 {currentPage} / {numPages} 頁
              </span>
              <button 
                onClick={() => changePage(currentPage + 1)}
                disabled={currentPage >= numPages || (currentUserRoleId !== 'teacher' && currentUserRoleId !== 'admin')}
                style={{ 
                  padding: '4px 8px', 
                  border: 'none', 
                  background: currentPage >= numPages || (currentUserRoleId !== 'teacher' && currentUserRoleId !== 'admin') ? '#e0e0e0' : '#2196f3',
                  color: currentPage >= numPages || (currentUserRoleId !== 'teacher' && currentUserRoleId !== 'admin') ? '#999' : 'white',
                  borderRadius: 4, 
                  cursor: currentPage >= numPages || (currentUserRoleId !== 'teacher' && currentUserRoleId !== 'admin') ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontWeight: 600
                }}
                title={currentUserRoleId !== 'teacher' && currentUserRoleId !== 'admin' ? '只有老師可以切換頁面' : '下一頁'}
              >
                ▶
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', flex: 1, background: 'white', minHeight: 0 }}>
        {useNetlessWhiteboard ? (
          // Use Netless whiteboard (collaborative)
          <div 
            ref={whiteboardRef}
            style={{ 
              width: '100%', 
              height: '100%',
              background: 'white',
              pointerEvents: editable ? 'auto' : 'none'
            }} 
          />
        ) : (
          // Fallback to Canvas (non-collaborative)
          <>
            {/* Background canvas for PDF */}
            <canvas
              ref={bgCanvasRef}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            />
            {/* Drawing canvas on top */}
            <canvas
              ref={canvasRef}
              {...(autoFit ? {} : { width: whiteboardWidth, height: whiteboardHeight - 48 })}
              onMouseDown={handlePointerDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handlePointerUp}
              onMouseEnter={handleCanvasMouseEnter}
              onMouseLeave={handleCanvasMouseLeave}
              style={{ position: 'absolute', top: 0, left: 0, display: 'block', cursor: editable && tool === 'eraser' ? 'none' : (editable ? 'crosshair' : 'default'), width: '100%', height: '100%', pointerEvents: editable ? 'auto' : 'none' }}
            />
            {/* Eraser cursor */}
            {showCursor && tool === 'eraser' && cursorPos && editable && (
              <div
                style={{
                  position: 'absolute',
                  left: cursorPos.x,
                  top: cursorPos.y,
                  width: strokeWidth,
                  height: strokeWidth,
                  border: '2px solid #333',
                  backgroundColor: 'rgba(255, 255, 255, 0.3)',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 1000
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
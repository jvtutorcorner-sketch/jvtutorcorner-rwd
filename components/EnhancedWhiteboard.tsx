"use client";

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { getStoredUser } from '@/lib/mockAuth';

// Dynamically load Amplify API at runtime to avoid static bundler errors
let _AmplifyAPI: any = null;
async function getAmplifyAPI(): Promise<any | null> {
  if (_AmplifyAPI) return _AmplifyAPI;
  try {
    const mod = await import('aws-amplify');
    // try common export locations
    _AmplifyAPI = (mod as any).API ?? (mod as any).default?.API ?? (mod as any);
    return _AmplifyAPI;
  } catch (e) {
    console.warn('[WB] Dynamic import of aws-amplify failed:', e);
    return null;
  }
}

// GraphQL definitions for whiteboard sync
const createWhiteboardEventMutation = /* GraphQL */ `
  mutation CreateWhiteboardEvent($input: CreateWhiteboardEventInput!) {
    createWhiteboardEvent(input: $input) {
      id
      event
      room
    }
  }
`;

const onCreateWhiteboardEventSubscription = /* GraphQL */ `
  subscription OnCreateWhiteboardEvent($room: String!) {
    onCreateWhiteboardEvent(filter: { room: { eq: $room } }) {
      event
      room
    }
  }
`;

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
}

type Stroke = { points: number[]; stroke: string; strokeWidth: number; mode: 'draw' | 'erase' };

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
}: WhiteboardProps) {
  const bcRef = useRef<BroadcastChannel | null>(null);
  const clientIdRef = useRef<string>(`c_${Math.random().toString(36).slice(2)}`);
  const applyingRemoteRef = useRef(false);
  const verboseLogging = typeof window !== 'undefined' && window.location.pathname === '/classroom/test';

  const logAnomaly = (title: string, info?: any) => {
    try {
      const snapshot = {
        time: Date.now(),
        page: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
        clientId: clientIdRef.current,
        strokesCount: strokesRef.current.length,
        recentStrokes: strokesRef.current.slice(-10).map((s) => ({ id: (s as any).id, len: s.points.length }))
      };
      console.error(`[WB-ANOMALY] ${title}`, { info, snapshot });
    } catch (e) {
      console.error('[WB-ANOMALY] Failed to log anomaly', e);
    }
  };

  // helper to POST events to server relay (AppSync + REST fallback)
  const postEventToServer = useCallback(async (event: any) => {
    try {
      const params = new URLSearchParams(window.location.search);
      const courseParam = params.get('courseId') || 'classroom';
      const uuid = `course_${courseParam}`;
      
      // 1. AppSync Mutation (Real-time broadcast) - dynamic import
      try {
        const APIclient = await getAmplifyAPI();
        if (APIclient && typeof APIclient.graphql === 'function') {
          await APIclient.graphql({
            query: createWhiteboardEventMutation,
            variables: {
              input: {
                room: uuid,
                event: JSON.stringify({ ...event, clientId: clientIdRef.current })
              }
            }
          } as any);
        }
      } catch (appsyncErr) {
        console.warn('[WB AppSync] Mutation failed, falling back to REST:', appsyncErr);
      }

      // 2. REST API call (for backward compatibility and server-side persistence)
      console.log('[WB POST] Sending event to server:', event.type, 'uuid:', uuid);
      const response = await fetch('/api/whiteboard/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uuid, event: { ...event, clientId: clientIdRef.current } })
      });
      
      if (!response.ok) {
        console.error('[WB POST] Non-OK response from /api/whiteboard/event', { status: response.status });
      }
      
      // ... REST of the logic for acks ...
      try {
        if (event && (event.type === 'stroke-start' || event.type === 'stroke-update')) {
          const strokeId = event.stroke?.id || event.strokeId;
          if (strokeId) {
            try { ensureServerAckForStroke(strokeId, courseParam); } catch (e) { /* ignore */ }
          }
        }
      } catch (e) {}
    } catch (e) {
      console.error('[WB POST] Error posting event:', e);
    }
  }, [channelName]);

  // Pending ack timers and helper to surface UI errors
  const pendingAckRef = useRef<Map<string, number>>(new Map());
  const [errors, setErrors] = useState<string[]>([]);
  const pushError = useCallback((msg: string) => {
    setErrors((e) => [...e.slice(-9), msg]);
    console.error('[WB ERR]', msg);
  }, []);

  const ensureServerAckForStroke = useCallback(async (strokeId: string, courseIdFromChannel: string) => {
    const uuid = `course_${courseIdFromChannel}`;
    // avoid duplicate ack watchers
    if (pendingAckRef.current.has(strokeId)) return;
    let attempts = 0;
    const maxAttempts = 15; // 80ms * 15 = 1.2 seconds for fast ACK detection
    const intervalMs = 80; // smart ACK polling: 80ms (12.5x/sec) - only for single stroke

    const check = async () => {
      attempts += 1;
      try {
        const resp = await fetch(`/api/whiteboard/state?uuid=${encodeURIComponent(uuid)}`);
        if (resp.ok) {
          const j = await resp.json();
          const s = j?.state;
          if (s && Array.isArray(s.strokes)) {
            const found = s.strokes.some((st: any) => (st as any).id === strokeId);
            if (found) {
              // ack received, clear timer
              const t = pendingAckRef.current.get(strokeId);
              if (t) { try { window.clearInterval(t); } catch (e) {} }
              pendingAckRef.current.delete(strokeId);
              if (verboseLogging) console.log('[WB ACK] ✓ Stroke ACK confirmed:', strokeId, `(attempt ${attempts})`);
              return;
            }
          }
        }
      } catch (e) {
        // ignore transient fetch errors
      }

      if (attempts >= maxAttempts) {
        // not found after retries -> clear interval and error
        const t = pendingAckRef.current.get(strokeId);
        if (t) { try { window.clearInterval(t); } catch (e) {} }
        pendingAckRef.current.delete(strokeId);
        // In production fallback mode, DynamoDB may not be configured, so suppress repeated errors
        if (verboseLogging) {
          const msg = `Canvas sync not confirmed for stroke ${strokeId}`;
          console.warn('[WB ACK] ✗ Timeout after', attempts, 'attempts:', strokeId);
          logAnomaly('Ack timeout for stroke', { strokeId, attempts, courseIdFromChannel });
          pushError(msg);
        }
        return;
      }
    };

    // schedule repeated checks
    const timerId = window.setInterval(check, intervalMs) as unknown as number;
    pendingAckRef.current.set(strokeId, timerId);
    // run first check immediately
    void check();
  }, [pushError]);

  // Buffer/high-frequency update batching for stroke-update events
  const pendingUpdatesRef = useRef<Map<string, { points: number[] }>>(new Map());
  const flushTimerRef = useRef<number | null>(null);
  const currentStrokeIdRef = useRef<string | null>(null);
  const localActiveStrokeRef = useRef<Stroke | null>(null);
  const lastPointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const FLUSH_INTERVAL = 40; // ms - 减少延迟以提升实时性

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

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null); // Background canvas for PDF
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentRenderTask = useRef<any>(null); // Track PDF render task
  const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
  const [color, setColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undone, setUndone] = useState<Stroke[]>([]);
  const isDrawingRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [whiteboardPermissions, setWhiteboardPermissions] = useState<Record<string, string[] | undefined> | null>(null);
  const [currentUserRoleId, setCurrentUserRoleId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const urlRole = params.get('role');
    if (urlRole) return urlRole === 'user' ? 'student' : urlRole;
    try {
      const u = getStoredUser();
      return u?.role === 'user' ? 'student' : (u?.role || null);
    } catch (e) {
      return null;
    }
  });

  // `editable` comes from props; default true

  // Keep a ref of strokes for BroadcastChannel state requests to avoid effect re-runs
  const strokesRef = useRef<Stroke[]>(strokes);
  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);
  
  // PDF state
  const [pdfLib, setPdfLib] = useState<any | null>(null);
  const [pdf, setPdf] = useState<any | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  // local copy of selected PDF file so remote events can update it
  const [localPdfFile, setLocalPdfFile] = useState<File | null>(pdfFile ?? null);

  useEffect(() => {
    // if parent passes a pdfFile prop update local copy
    if (pdfFile) setLocalPdfFile(pdfFile);
  }, [pdfFile]);
  const [whiteboardWidth, setWhiteboardWidth] = useState(width);
  const [whiteboardHeight, setWhiteboardHeight] = useState(height);
  const [canvasHeight, setCanvasHeight] = useState(height - 48);
  
  // Use Netless whiteboard if room is provided
  const useNetlessWhiteboard = Boolean(room && whiteboardRef);

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

  // Cleanup pending ack timers on unmount
  useEffect(() => {
    return () => {
      try {
        pendingAckRef.current.forEach((t) => { try { window.clearInterval(t); } catch (e) {} });
        pendingAckRef.current.clear();
      } catch (e) {}
    };
  }, []);
  
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

  // Load PDF file
  useEffect(() => {
    const activePdfFile = localPdfFile ?? pdfFile;
    if (!pdfLib || !activePdfFile) {
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
  }, [pdfLib, pdfFile, localPdfFile]);

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

        const ctx = bgCanvas.getContext('2d');
        if (!ctx) return;

        // Use the actual canvas width/height set by resize observer
        const viewportNative = page.getViewport({ scale: 1 });
        const scale = bgCanvas.width / viewportNative.width;
        const renderViewport = page.getViewport({ scale });

        // Clear before render to avoid ghosting
        ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);

        const renderTask = page.render({ canvasContext: ctx, viewport: renderViewport });
        currentRenderTask.current = renderTask;
        await renderTask.promise;
        currentRenderTask.current = null;
      } catch (e) {
        console.error('Failed to render PDF page', e);
        currentRenderTask.current = null;
      }
    })();
  }, [pdf, currentPage, numPages, whiteboardWidth, canvasHeight]); // Re-render if size changes

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
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const isActionAllowed = useCallback((actionKey: string) => {
    // If editable prop explicitly disabled, deny all actions
    if (!editable) return false;
    // If student, deny all drawing/tool actions
    if (currentUserRoleId === 'student') return false;
    // If admin settings are not configured, allow by default
    if (!whiteboardPermissions) return true;
    // If settings exist but we couldn't determine role, deny to be safe
    if (!currentUserRoleId) return false;
    const allowed = whiteboardPermissions[actionKey];
    if (!Array.isArray(allowed)) return true;
    return allowed.includes(currentUserRoleId);
  }, [currentUserRoleId, whiteboardPermissions]);

  // draw all strokes into the canvas (coordinates are normalized 0..1)
  const drawAll = useCallback(() => {
    const el = mainCanvasRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    // Reset transform and clear full pixel buffer, then scale to CSS pixels
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.scale(dpr, dpr);

    const displayW = el.width / dpr;
    const displayH = el.height / dpr;

    strokes.forEach((s) => {
      if (s.points.length < 2) return;
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = s.mode === 'erase' ? 'destination-out' : 'source-over';

      ctx.beginPath();
      // Scale normalized coordinates back to display pixels
      ctx.moveTo(s.points[0] * displayW, s.points[1] * displayH);
      for (let i = 2; i < s.points.length; i += 2) {
        ctx.lineTo(s.points[i] * displayW, s.points[i + 1] * displayH);
      }
      ctx.stroke();
    });

    // We no longer need to draw the localActiveStroke here because it is on the active canvas
  }, [strokes]);

  // Attach non-passive touch listeners to prevent page scroll while drawing on mobile
  

  const getPointerPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): { x: number; y: number } => {
    if (!activeCanvasRef.current) return { x: 0, y: 0 };
    const rect = activeCanvasRef.current.getBoundingClientRect();
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
    lastPointerPosRef.current = pos;
    const newStroke: Stroke & { id?: string; origin?: string } = { points: [pos.x, pos.y], stroke: color, strokeWidth, mode: tool === 'eraser' ? 'erase' : 'draw', id: `${clientIdRef.current}_${Date.now()}` , origin: clientIdRef.current };
    localActiveStrokeRef.current = newStroke;
    setStrokes((s) => [...s, newStroke]);
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
  }, [tool, color, strokeWidth, postEventToServer, isActionAllowed, useNetlessWhiteboard]);

  const handlePointerMove = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !localActiveStrokeRef.current) return;
    const pos = getPointerPos(e);
    const stroke = localActiveStrokeRef.current;
    
    // 1. Instant local drawing for zero lag on ACTIVE canvas
    const el = activeCanvasRef.current;
    const lastPos = lastPointerPosRef.current;
    if (el && lastPos) {
      const ctx = el.getContext('2d');
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        const displayW = el.width / dpr;
        const displayH = el.height / dpr;
        
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.strokeStyle = stroke.stroke;
        ctx.lineWidth = stroke.strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over';
        
        ctx.beginPath();
        ctx.moveTo(lastPos.x * displayW, lastPos.y * displayH);
        ctx.lineTo(pos.x * displayW, pos.y * displayH);
        ctx.stroke();
        ctx.restore();
      }
    }
    
    // 2. Update points in ref (O(1) compared to React state which is O(N))
    stroke.points.push(pos.x, pos.y);
    lastPointerPosRef.current = pos;
    
    // 3. Network/Sync updates (throttled by enqueueStrokeUpdate)
    try {
      const strokeId = (stroke as any).id;
      if (!useNetlessWhiteboard && bcRef.current) {
        bcRef.current.postMessage({ type: 'stroke-update', strokeId, points: stroke.points, clientId: clientIdRef.current });
      }
      if (!useNetlessWhiteboard) {
        enqueueStrokeUpdate(strokeId, stroke.points);
      }
    } catch (e) {}
  }, [enqueueStrokeUpdate, useNetlessWhiteboard]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    
    // Clear the active canvas
    const activeEl = activeCanvasRef.current;
    if (activeEl) {
      const ctx = activeEl.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, activeEl.width, activeEl.height);
      }
    }

    // Commit the final points from ref to React state
    if (localActiveStrokeRef.current) {
      const finalStroke = { ...localActiveStrokeRef.current };
      setStrokes((prev) => {
        const idx = prev.findIndex(s => (s as any).id === (finalStroke as any).id);
        if (idx >= 0) {
          const out = [...prev];
          out[idx] = finalStroke;
          return out;
        }
        return [...prev, finalStroke];
      });
      localActiveStrokeRef.current = null;
    }
    lastPointerPosRef.current = null;

    // flush any pending updates for the stroke that just finished
    try {
      const sid = currentStrokeIdRef.current;
      if (sid) {
        // ensure final update is sent immediately
        const pending = pendingUpdatesRef.current.get(sid);
        if (pending) {
          try { postEventToServer({ type: 'stroke-update', strokeId: sid, points: pending.points }); } catch (e) {}
          pendingUpdatesRef.current.delete(sid);
        }
      }
    } catch (e) {}
  }, [postEventToServer]);

  const undo = useCallback(() => {
    if (!isActionAllowed('undo')) return;
    setStrokes((s) => {
      if (s.length === 0) return s;
      const last = s[s.length - 1];
      setUndone((u) => [...u, last]);
      const next = s.slice(0, -1);
      try { if (!useNetlessWhiteboard && bcRef.current) bcRef.current.postMessage({ type: 'undo', strokeId: (last as any).id, clientId: clientIdRef.current }); } catch (e) {}
      try { if (!useNetlessWhiteboard) postEventToServer({ type: 'undo', strokeId: (last as any).id }); } catch (e) {}
      return next;
    });
  }, [isActionAllowed, useNetlessWhiteboard, postEventToServer]);

  const redo = useCallback(() => {
    if (!isActionAllowed('redo')) return;
    setUndone((u) => {
      if (u.length === 0) return u;
      const last = u[u.length - 1];
      setStrokes((s) => [...s, last]);
      try { if (!useNetlessWhiteboard && bcRef.current) bcRef.current.postMessage({ type: 'redo', stroke: last, clientId: clientIdRef.current }); } catch (e) {}
      try { if (!useNetlessWhiteboard) postEventToServer({ type: 'redo', stroke: last }); } catch (e) {}
      return u.slice(0, -1);
    });
  }, [isActionAllowed, useNetlessWhiteboard, postEventToServer]);

  const clearAll = useCallback(() => {
    if (!isActionAllowed('clear')) return;
    setStrokes([]);
    setUndone([]);
    try { if (!useNetlessWhiteboard && bcRef.current) bcRef.current.postMessage({ type: 'clear', clientId: clientIdRef.current }); } catch (e) {}
    try { if (!useNetlessWhiteboard) postEventToServer({ type: 'clear' }); } catch (e) {}
  }, [isActionAllowed, useNetlessWhiteboard, postEventToServer]);

  const handlePdfUpload = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!isActionAllowed('pdf-set')) return;

    setSelectedFileName(file.name);
    setLocalPdfFile(file);
    if (onPdfSelected) onPdfSelected(file);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        if (!useNetlessWhiteboard && bcRef.current) {
          bcRef.current.postMessage({ type: 'pdf-set', name: file.name, dataUrl, clientId: clientIdRef.current });
        }
        if (!useNetlessWhiteboard) {
          postEventToServer({ type: 'pdf-set', name: file.name, dataUrl });
        }
      } catch (e) {
        console.error('[WB] Failed to broadcast PDF', e);
      }
    };
    reader.readAsDataURL(file);
  }, [isActionAllowed, onPdfSelected, postEventToServer, useNetlessWhiteboard]);

  const handleIncomingEvent = useCallback((data: any) => {
    if (!data || data.clientId === clientIdRef.current) return;
    applyingRemoteRef.current = true;
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
      } else if (data.type === 'setTool') {
        try { if (data.tool === 'eraser') setTool('eraser'); else setTool('pencil'); } catch (e) {}
      } else if (data.type === 'setWidth') {
        try { if (typeof data.width === 'number') setStrokeWidth(Number(data.width)); } catch (e) {}
      } else if (data.type === 'stroke-start') {
        setStrokes((s) => {
          const strokeId = data.strokeId || (data.stroke as any)?.id;
          if (strokeId && s.some(st => (st as any).id === strokeId)) return s;
          return [...s, data.stroke];
        });
      } else if (data.type === 'stroke-update') {
        setStrokes((s) => {
          const strokeId = data.strokeId;
          const points = data.points;
          if (!strokeId || !Array.isArray(points)) return s;
          
          const idx = s.findIndex((st) => (st as any).id === strokeId);
          if (idx >= 0) {
            const updated = { ...(s[idx] as any), points };
            return [...s.slice(0, idx), updated, ...s.slice(idx + 1)];
          }
          // fallback if start was missed
          return [...s, { points, stroke: '#000', strokeWidth: 2, mode: 'draw', id: strokeId } as any];
        });
      } else if (data.type === 'undo') {
        setStrokes((s) => s.filter((st) => (st as any).id !== data.strokeId));
      } else if (data.type === 'redo') {
        if (data.stroke) setStrokes((s) => [...s, data.stroke]);
      } else if (data.type === 'clear') {
        setStrokes([]);
        setUndone([]);
      } else if (data.type === 'pdf-set') {
        (async () => {
          try {
            const name = data.name || (data.pdf as any)?.name || 'remote.pdf';
            const url = data.dataUrl || (data.pdf as any)?.dataUrl;
            if (!url) return;
            const resp = await fetch(url);
            const blob = await resp.blob();
            const file = new File([blob], name, { type: blob.type });
            setSelectedFileName(file.name);
            setLocalPdfFile(file);
          } catch (e) {
            console.error('[WB] Failed to apply remote PDF', e);
          }
        })();
      }
    } catch (e) {
      console.error('[WB] Error handling incoming event:', e);
    } finally {
      applyingRemoteRef.current = false;
    }
  }, []);

  // AppSync Subscription for high-frequency real-time sync
  useEffect(() => {
    if (useNetlessWhiteboard) return;
    if (typeof window === 'undefined') return;
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let sub: any;
    const setupSubscription = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const courseParam = params.get('courseId') || 'classroom';
        const uuid = `course_${courseParam}`;

        console.log('[WB AppSync] Subscribing to room:', uuid);
        try {
          const APIclient = await getAmplifyAPI();
          if (APIclient && typeof APIclient.graphql === 'function') {
            const maybeObs = APIclient.graphql({ query: onCreateWhiteboardEventSubscription, variables: { room: uuid } } as any);
            // Amplify may return an Observable when the realtime provider is configured
            if (maybeObs && typeof (maybeObs as any).subscribe === 'function') {
              sub = (maybeObs as any).subscribe({
                next: ({ data }: any) => {
                  const event = data.onCreateWhiteboardEvent;
                  if (!event || !event.event) return;
                  try {
                    const parsed = JSON.parse(event.event);
                    handleIncomingEvent(parsed);
                  } catch (e) {
                    console.error('[WB AppSync] Failed to parse event', e);
                  }
                },
                error: (err: any) => console.error('[WB AppSync] Subscription error:', err)
              });
            } else {
              console.warn('[WB AppSync] Subscription did not return Observable; realtime may not be configured');
            }
          }
        } catch (subErr) {
          console.warn('[WB AppSync] Subscribe error:', subErr);
        }
      } catch (err) {
        console.warn('[WB AppSync] Failed to setup subscription:', err);
      }
    };
    
    setupSubscription();
    return () => { if (sub) sub.unsubscribe(); };
  }, [useNetlessWhiteboard, handleIncomingEvent]);

  // BroadcastChannel setup for canvas sync (per-page channel)
  useEffect(() => {
    if (useNetlessWhiteboard) return;
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const courseParam = params.get('courseId') || 'default';
      const courseIdFromChannel = (channelName ? (channelName.startsWith('course_') ? channelName.replace(/^course_/, '').split('_')[0] : channelName.split('_')[0]) : courseParam) || 'default';
      const bcName = `whiteboard_course_${courseIdFromChannel}`;
      const ch = new BroadcastChannel(bcName);
      bcRef.current = ch;
      ch.onmessage = (ev: MessageEvent) => {
        const data = ev.data as any;
        handleIncomingEvent(data);
        
        // request-state and state are special for BC
        if (data.type === 'request-state') {
          try { ch.postMessage({ type: 'state', strokes: strokesRef.current, clientId: clientIdRef.current }); } catch (e) {}
        } else if (data.type === 'state') {
          setStrokes((local) => {
            if (local.length === 0 && Array.isArray(data.strokes)) return data.strokes;
            return local;
          });
        }
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

  // Attach non-passive touch listeners to prevent page scroll while drawing on mobile
  useEffect(() => {
    const el = activeCanvasRef.current;
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
    const mainCanvas = mainCanvasRef.current;
    if (!mainCanvas) return;

    // Responsive toolbar height: smaller on mobile
    const isMobilePortrait = window.innerWidth <= 768 && window.innerHeight > window.innerWidth;
    const toolbarHeight = isMobilePortrait ? 40 : 48;

    function resizeCanvasToDisplaySize() {
      // if PDF is loaded and autoFit is disabled, keep fixed size
      if (pdf && !autoFit) return;
      
      const canvases = [mainCanvasRef.current, activeCanvasRef.current, bgCanvasRef.current];
      if (!mainCanvasRef.current) return;
      
      const parent = mainCanvasRef.current.parentElement;
      if (!parent) return;
      
      const rect = parent.getBoundingClientRect();
      let displayW = rect.width;
      let displayH = Math.max(32, rect.height - toolbarHeight);

      // If PDF is loaded, adjust dimensions to maintain aspect ratio
      if (pdf && whiteboardWidth > 0 && canvasHeight > 0) {
        const pdfAspect = whiteboardWidth / canvasHeight;
        const containerAspect = displayW / displayH;
        
        if (containerAspect > pdfAspect) {
          // container is wider than PDF
          displayW = displayH * pdfAspect;
        } else {
          // container is taller than PDF
          displayH = displayW / pdfAspect;
        }
      }

      const dpr = window.devicePixelRatio || 1;
      const pixelW = Math.max(1, Math.round(displayW * dpr));
      const pixelH = Math.max(1, Math.round(displayH * dpr));

      canvases.forEach(c => {
        if (!c) return;

        // set CSS size
        c.style.width = `${displayW}px`;
        c.style.height = `${displayH}px`;
        
        // center in parent
        c.style.left = '50%';
        c.style.top = '50%';
        c.style.transform = 'translate(-50%, -50%)';

        // set drawing buffer size
        if (c.width !== pixelW || c.height !== pixelH) {
          c.width = pixelW;
          c.height = pixelH;
          // apply scaling for DPR
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
          }
        }
      });
      // redraw strokes at new size
      drawAll();
    }

    // initial resize
    resizeCanvasToDisplaySize();

    const ro = new ResizeObserver(() => {
      resizeCanvasToDisplaySize();
    });
    const parent = mainCanvas.parentElement || mainCanvas;
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

  // redraw when strokes change
  useEffect(() => {
    drawAll();
  }, [strokes, drawAll]);

  // Server-side SSE subscription for cross-device sync
  useEffect(() => {
    if (useNetlessWhiteboard) {
      console.log('[WB SSE] Skipping SSE (using Netless whiteboard)');
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      // Use courseId from URL parameter directly to ensure POST and GET use same uuid
      const params = new URLSearchParams(window.location.search);
      const courseParam = params.get('courseId') || 'classroom';
      const uuid = `course_${courseParam}`;
      // In production (Amplify) long-lived SSE often fails; skip SSE there.
      const isProduction = window.location.hostname === 'www.jvtutorcorner.com' || window.location.hostname === 'jvtutorcorner.com';
      if (isProduction) {
        console.log('[WB SSE] Production detected - skipping SSE. Falling back to /api/whiteboard/state polling.');
        console.log('[WB POLL] Using uuid:', uuid, 'from courseId:', courseParam);
        // Try fetching persisted state immediately and then poll periodically
        let pollId: number | null = null;
        let lastRemoteStrokeIds: string[] = [];
        let consecutiveFailures = 0;
        const maxFailures = 5;
        
        const fetchAndApply = async () => {
          try {
            const resp = await fetch(`/api/whiteboard/state?uuid=${encodeURIComponent(uuid)}`);
              if (!resp.ok) {
                consecutiveFailures++;
                const txt = await resp.text().catch(() => '(no body)');
                console.warn('[WB POLL] /api/whiteboard/state returned non-ok', resp.status, txt.slice(0, 200));
                if (verboseLogging) {
                  pushError(`[WB POLL] /api/whiteboard/state returned non-ok ${resp.status}`);
                  logAnomaly('Production /state returned non-ok', { status: resp.status, bodyPreview: txt?.slice(0,200) });
                }
                // 如果连续失败太多次，增加轮询间隔
                if (consecutiveFailures >= maxFailures && pollId) {
                  window.clearInterval(pollId);
                  pollId = window.setInterval(fetchAndApply, 500) as unknown as number;
                  console.warn('[WB POLL] Too many failures, reducing poll frequency to 500ms');
                }
                return;
              }
            
            // 成功后重置失败计数
            if (consecutiveFailures >= maxFailures && pollId) {
              // 恢复正常轮询间隔
              window.clearInterval(pollId);
              pollId = window.setInterval(fetchAndApply, 100) as unknown as number;
              console.log('[WB POLL] Connection recovered, restoring normal poll frequency');
            }
            consecutiveFailures = 0;
            
            const j = await resp.json();
            const s = j?.state;
            if (s && Array.isArray(s.strokes)) {
              // 使用完整的stroke ID列表进行精确比较
              const remoteStrokeIds = s.strokes.map((st: any) => st.id || 'unknown');
              const localStrokeIds = strokesRef.current.map((st: any) => (st as any).id || 'unknown');
              
              // 检查是否有新stroke或顺序变化
              const hasChanges = remoteStrokeIds.length !== localStrokeIds.length || 
                                 remoteStrokeIds.some((id: string, idx: number) => id !== localStrokeIds[idx]);
              
              // 检查是否是新的更新（与上次远程状态比较）
              const isNewUpdate = remoteStrokeIds.length !== lastRemoteStrokeIds.length ||
                                  remoteStrokeIds.some((id: string, idx: number) => id !== lastRemoteStrokeIds[idx]);
              
              if (hasChanges && isNewUpdate) {
                console.log('[WB POLL] ✓ Sync update: local=', localStrokeIds.length, 'remote=', remoteStrokeIds.length);
                
                // 检查是否需要合并而不是完全替换
                const localHasNewer = strokesRef.current.some(st => {
                  const id = (st as any).id;
                  return id && id.startsWith(clientIdRef.current) && !remoteStrokeIds.includes(id);
                });
                
                if (localHasNewer) {
                  // 合并：保留本地新增的stroke
                  console.log('[WB POLL] Merging local and remote strokes');
                  const merged = [...s.strokes];
                  strokesRef.current.forEach(st => {
                    const id = (st as any).id;
                    if (id && id.startsWith(clientIdRef.current) && !remoteStrokeIds.includes(id)) {
                      merged.push(st);
                    }
                  });
                  setStrokes(merged);
                } else {
                  // 完全替换
                  setStrokes(s.strokes);
                }
                
                lastRemoteStrokeIds = remoteStrokeIds;
                if (verboseLogging) {
                  console.log('[WB POLL] Applied remote strokes in production poll');
                }
              } else if (hasChanges) {
                // 本地落后于服务器，但远程状态没变 - 可能是初始同步
                if (localStrokeIds.length === 0 && remoteStrokeIds.length > 0) {
                  console.log('[WB POLL] Initial sync from server');
                  setStrokes(s.strokes);
                  lastRemoteStrokeIds = remoteStrokeIds;
                }
              }
              
              if (s.pdf && s.pdf.dataUrl && s.pdf.dataUrl !== '(large-data-url)' && !localPdfFile) {
                try {
                  const r = await fetch(s.pdf.dataUrl);
                  const blob = await r.blob();
                  const file = new File([blob], s.pdf.name || 'remote.pdf', { type: blob.type });
                  setSelectedFileName(file.name);
                  setLocalPdfFile(file);
                } catch (e) { console.warn('[WB POLL] Failed to fetch remote PDF', e); }
              }
            }
          } catch (e) {
              consecutiveFailures++;
              const errStack = e && (e as Error).stack ? (e as Error).stack : e;
              console.warn('[WB POLL] Failed to fetch /state in production fallback', errStack);
              if (verboseLogging) {
                pushError('[WB POLL] Failed to fetch /state in production fallback');
                logAnomaly('Production /state fetch failed', { error: errStack });
              }
          }
        };

        // initial fetch
        fetchAndApply();
        // 優化輪詢間隔：100ms = 10次/秒，在即時性和性能之間取得平衡
        try { pollId = window.setInterval(fetchAndApply, 100) as unknown as number; } catch (e) { pollId = null; }

        return () => {
          try { if (pollId) window.clearInterval(pollId); } catch (e) {}
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
                setStrokes(s.strokes);
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

          // Ignore our own events to avoid double-drawing (但允許沒有 clientId 的訊息通過)
          if (data.clientId && data.clientId === clientIdRef.current) return;

          // connected and ping are special for SSE
          if (data.type === 'connected') {
            console.log('[WB SSE] Received connected message');
            return;
          }
          if (data.type === 'ping') return;

          console.log('[WB SSE] Received event:', data.type);

          if (data.type === 'init-state') {
            console.log('[WB SSE] Applying initial state:', data.strokes?.length, 'strokes');
            if (Array.isArray(data.strokes)) {
              const localCount = strokesRef.current.length;
              const remoteCount = data.strokes.length;

              if (localCount === 0) {
                // 本地为空，直接应用远程状态
                setStrokes(data.strokes);
              } else if (remoteCount > localCount) {
                // 远程有更多strokes，尝试合并
                console.log('[WB SSE] Merging init-state with local strokes');
                const localIds = new Set(strokesRef.current.map((st: any) => st.id));
                const remoteOnly = data.strokes.filter((st: any) => !localIds.has(st.id));
                if (remoteOnly.length > 0) {
                  setStrokes([...strokesRef.current, ...remoteOnly]);
                }
              } else {
                if (verboseLogging) logAnomaly('SSE init-state ignored due to non-empty local strokes', { localCount, remoteCount });
                console.log('[WB SSE] init-state ignored, local has more strokes:', localCount, 'vs', remoteCount);
              }
            }
            if (data.pdf && data.pdf.dataUrl && data.pdf.dataUrl !== '(large-data-url)') {
              (async () => {
                try {
                  const resp = await fetch(data.pdf.dataUrl);
                  const blob = await resp.blob();
                  const file = new File([blob], data.pdf.name || 'remote.pdf', { type: blob.type });
                  setSelectedFileName(file.name);
                  setLocalPdfFile(file);
                } catch (e) {
                  // ignore PDF restore errors
                }
              })();
            }
            return;
          }

          // delegate to shared handler for other event types
          handleIncomingEvent(data);
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handlePdfUpload(e.target.files?.[0] || null)}
            accept="application/pdf"
            style={{ display: 'none' }}
          />
          {isActionAllowed('pdf-set') && (
            <button 
              onClick={() => fileInputRef.current?.click()} 
              style={{ padding: '6px 10px', background: 'white', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}
              title="匯入 PDF"
            >
              📄
            </button>
          )}

          {isActionAllowed('setTool:pencil') && (
            <button onClick={() => setTool('pencil')} style={{ padding: '6px 10px', background: tool === 'pencil' ? '#e3f2fd' : 'white', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>✏️</button>
          )}
          {isActionAllowed('setTool:eraser') && (
            <button onClick={() => setTool('eraser')} style={{ padding: '6px 10px', background: tool === 'eraser' ? '#e3f2fd' : 'white', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>🧽</button>
          )}
        </div>
        <div>
          {isActionAllowed('setColor') && (
            <input aria-label="Pen color" type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 36, height: 32, padding: 0, border: 'none' }} />
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

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }} />
      </div>

      <div style={{ position: 'relative', width: '100%', flex: 1, background: '#eee', minHeight: 0, overflow: 'hidden' }}>
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
            {/* Main drawing canvas (finished strokes) */}
            <canvas
              ref={mainCanvasRef}
              style={{ position: 'absolute', top: 0, left: 0, display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }}
            />
            {/* Active drawing canvas (current stroke) */}
            <canvas
              ref={activeCanvasRef}
              {...(autoFit ? {} : { width: whiteboardWidth, height: whiteboardHeight - 48 })}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              style={{ position: 'absolute', top: 0, left: 0, display: 'block', cursor: editable ? 'crosshair' : 'default', width: '100%', height: '100%', pointerEvents: editable ? 'auto' : 'none' }}
            />
          </>
        )}
      </div>
    </div>
  );
}

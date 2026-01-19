"use client";

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { getStoredUser } from '@/lib/mockAuth';

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

  const logToWindow = (msg: string) => {
    if (typeof window === 'undefined') return;
    if (!(window as any).__whiteboard_logs) (window as any).__whiteboard_logs = [];
    (window as any).__whiteboard_logs.push(`[${new Date().toISOString()}] ${msg}`);
    if ((window as any).__whiteboard_logs.length > 50) (window as any).__whiteboard_logs.shift();
  };

  const logAnomaly = (title: string, info?: any) => {
    logToWindow(`ANOMALY: ${title} ${info ? JSON.stringify(info) : ''}`);
  };

  // helper to POST events to server relay
  const postEventToServer = useCallback(async (event: any) => {
    try {
      // Use courseId from URL parameter directly (or fallback to 'classroom' if not present).
      // This ensures POST and GET use the SAME uuid for server state consistency.
      const params = new URLSearchParams(window.location.search);
      const courseParam = params.get('courseId') || 'classroom';
      const uuid = `course_${courseParam}`;
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
      // If this is a stroke event, start ack polling to ensure other clients (students)
      // receive the stroke via server relay. We poll persisted /api/whiteboard/state
      // and show an error if the stroke isn't visible after retries.
      // CRITICAL FIX: Only trigger on stroke-start, not on every stroke-update
      try {
        if (event && event.type === 'stroke-start') {
          const strokeId = event.stroke?.id;
          if (strokeId) {
            console.log('[WB POST] Starting ACK check for stroke:', strokeId);
            try { ensureServerAckForStroke(strokeId, courseParam); } catch (e) { /* ignore */ }
          } else {
            console.warn('[WB POST] No strokeId found for ACK check - event:', event);
          }
        }
      } catch (e) {}
    } catch (e) {
      console.error('[WB POST] Error posting event:', e && (e as Error).stack ? (e as Error).stack : e);
    }
  }, [channelName]);

  // Pending ack timers and helper to surface UI errors
  const pendingAckRef = useRef<Map<string, number>>(new Map());
  const maxConcurrentAcks = 3; // 限制最多同時進行的 ACK 檢查數量
  const [errors, setErrors] = useState<string[]>([]);
  const pushError = useCallback((msg: string) => {
    setErrors((e) => [...e.slice(-9), msg]);
    console.error('[WB ERR]', msg);
  }, []);

  const ensureServerAckForStroke = useCallback(async (strokeId: string, courseIdFromChannel: string) => {
    const uuid = `course_${courseIdFromChannel}`;
    // avoid duplicate ack watchers
    if (pendingAckRef.current.has(strokeId)) return;
    // 限制並發數量，防止資源耗盡
    if (pendingAckRef.current.size >= maxConcurrentAcks) {
      console.warn('[WB ACK] Too many concurrent ACK checks, skipping:', strokeId);
      return;
    }
    let attempts = 0;
    const maxAttempts = 80; // Total ~15 seconds with backoff
    
    // Adaptive backoff: start fast for UX, slow down for server health
    const getNextInterval = (currentAttempts: number) => {
      if (currentAttempts < 20) return 150;  // Initial 3s: fast (6.6x/sec)
      if (currentAttempts < 50) return 300;  // Up to 12s: balanced (3.3x/sec)
      return 600;                           // Final few seconds: slow
    };

    const check = async () => {
      if (!strokeId) return;
      attempts += 1;
      
      try {
        const resp = await fetch(`/api/whiteboard/state?uuid=${encodeURIComponent(uuid)}`);
        if (resp.ok) {
          const j = await resp.json();
          const s = j?.state;
          if (s && Array.isArray(s.strokes)) {
            const found = s.strokes.some((st: any) => (st as any).id === strokeId);
            if (found) {
              const timerId = pendingAckRef.current.get(strokeId);
              if (timerId) {
                // Clear the correct timer handle
                if (attempts === 1) clearTimeout(timerId);
                else clearTimeout(timerId);
              }
              pendingAckRef.current.delete(strokeId);
              if (verboseLogging) console.log('[WB ACK] ✓ Stroke ACK confirmed:', strokeId, `(attempt ${attempts})`);
              return;
            }
          }
        }
      } catch (e) {
        // ignore transient fetch errors
      }

      const currentTimerId = pendingAckRef.current.get(strokeId);

      if (attempts >= maxAttempts) {
        // not found after retries -> error
        if (currentTimerId) clearTimeout(currentTimerId);
        pendingAckRef.current.delete(strokeId);
        
        const msg = `Canvas sync not confirmed for stroke ${strokeId}`;
        console.warn('[WB ACK] ✗ Timeout after', attempts, 'attempts:', strokeId);
        logAnomaly(`Ack timeout for stroke ${strokeId}`, { attempts, courseIdFromChannel });
        pushError(msg);
      } else {
        // Schedule next check with adaptive delay
        const nextInterval = getNextInterval(attempts);
        const nextTimerId = setTimeout(check, nextInterval) as unknown as number;
        pendingAckRef.current.set(strokeId, nextTimerId);
      }
    };

    // Initial check after a short initial delay
    const initialTimerId = setTimeout(check, 150) as unknown as number;
    pendingAckRef.current.set(strokeId, initialTimerId);
  }, [pushError]);

  // Buffer/high-frequency update batching for stroke-update events
  const pendingUpdatesRef = useRef<Map<string, { points: number[] }>>(new Map());
  const flushTimerRef = useRef<number | null>(null);
  const currentStrokeIdRef = useRef<string | null>(null);
  const FLUSH_INTERVAL = 100; // ms

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

  // Cleanup pending ack timers on unmount AND periodically check for stuck timers
  useEffect(() => {
    // 定期清理超時的 ACK 檢查（每 10 秒檢查一次）
    const cleanupInterval = window.setInterval(() => {
      const now = Date.now();
      const maxAge = 15000; // 15 秒
      pendingAckRef.current.forEach((timerId, strokeId) => {
        // 假設 strokeId 格式為: c_xxxxx_timestamp
        const parts = strokeId.split('_');
        const timestamp = parseInt(parts[parts.length - 1]);
        if (!isNaN(timestamp) && (now - timestamp) > maxAge) {
          console.warn('[WB ACK] Force cleaning stuck ACK timer:', strokeId);
          try { window.clearInterval(timerId); } catch (e) {}
          pendingAckRef.current.delete(strokeId);
        }
      });
    }, 10000);

    return () => {
      try { window.clearInterval(cleanupInterval); } catch (e) {}
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
    const el = canvasRef.current;
    if (!el) return;

    // Ensure internal resolution matches CSS width/height to avoid blurriness and sync issues
    const dpr = window.devicePixelRatio || 1;
    const rect = el.getBoundingClientRect();
    const targetInternalW = Math.round(rect.width * dpr);
    const targetInternalH = Math.round(rect.height * dpr);
    
    if (el.width !== targetInternalW || el.height !== targetInternalH) {
      if (verboseLogging) logToWindow(`Resizing canvas internal buffer to ${targetInternalW}x${targetInternalH}`);
      el.width = targetInternalW;
      el.height = targetInternalH;
    }

    const ctx = el.getContext('2d');
    if (!ctx) return;

    if (verboseLogging) logToWindow(`drawAll called with ${strokes.length} strokes`);

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
  }, [strokes]);

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
    const newStroke: Stroke & { id?: string; origin?: string } = { points: [pos.x, pos.y], stroke: color, strokeWidth, mode: tool === 'eraser' ? 'erase' : 'draw', id: `${clientIdRef.current}_${Date.now()}` , origin: clientIdRef.current };
    
    if (verboseLogging) logToWindow(`Local stroke start: ${newStroke.id}`);
    
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
    if (!isDrawingRef.current) return;
    const pos = getPointerPos(e);
    setStrokes((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      const updated = { ...last, points: last.points.concat([pos.x, pos.y]) };
      const out = [...prev.slice(0, -1), updated];
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
      return out;
    });
  }, [enqueueStrokeUpdate, useNetlessWhiteboard]);

  const handlePointerUp = useCallback(() => {
    isDrawingRef.current = false;
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
  }, []);

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
        if (!data || data.clientId === clientIdRef.current) return; // ignore our own
        try {
          // support admin-driven tool/color/width events
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
          if (data.type === 'pdf-set') {
            // data: { type: 'pdf-set', name, dataUrl, clientId }
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
          if (data.type === 'stroke-start') {
            applyingRemoteRef.current = true;
            setStrokes((s) => {
              const strokeId = data.strokeId || (data.stroke as any)?.id;
              if (strokeId && s.some(st => (st as any).id === strokeId)) {
                console.log('[WB BC] Ignoring stroke-start for duplicate strokeId:', strokeId);
                return s;
              }
              console.log('[WB BC] Adding new stroke:', strokeId);
              return [...s, data.stroke];
            });
            applyingRemoteRef.current = false;
          } else if (data.type === 'stroke-update') {
            applyingRemoteRef.current = true;
            setStrokes((s) => {
              const idx = s.findIndex((st) => (st as any).id === data.strokeId);
              // Validate points
              const malformed = !Array.isArray(data.points) || data.points.some((p: any) => typeof p !== 'number' || Number.isNaN(p));
              if (malformed) {
                if (verboseLogging) logAnomaly('BC received malformed stroke-update (points invalid)', { strokeId: data.strokeId, points: data.points });
                console.warn('[WB BC] Malformed stroke-update, ignoring:', data.strokeId);
                // still try to ignore the malformed update
                return s;
              }
              if (idx >= 0) {
                // Update specific stroke without affecting others
                const updated = { ...(s[idx] as any), points: data.points };
                const result = [...s.slice(0, idx), updated, ...s.slice(idx + 1)];
                console.log('[WB BC] Updated stroke at index', idx, 'now total:', result.length);
                return result;
              }
              // if not found, append but record anomaly for diagnostics
              if (verboseLogging) logAnomaly('BC received stroke-update for unknown strokeId (appending)', { strokeId: data.strokeId, pointsLen: Array.isArray(data.points) ? data.points.length : null });
              console.warn('[WB BC] stroke-update for unknown strokeId, creating new:', data.strokeId);
              return [...s, { points: data.points, stroke: '#000', strokeWidth: 2, mode: 'draw', id: data.strokeId } as any];
            });
            applyingRemoteRef.current = false;
          } else if (data.type === 'undo') {
            applyingRemoteRef.current = true;
            setStrokes((s) => s.filter((st) => (st as any).id !== data.strokeId));
            applyingRemoteRef.current = false;
          } else if (data.type === 'redo') {
            applyingRemoteRef.current = true;
            setStrokes((s) => [...s, data.stroke]);
            applyingRemoteRef.current = false;
          } else if (data.type === 'clear') {
            applyingRemoteRef.current = true;
            setStrokes([]);
            setUndone([]);
            applyingRemoteRef.current = false;
          } else if (data.type === 'request-state') {
            // reply with full state
            try { ch.postMessage({ type: 'state', strokes: strokesRef.current, clientId: clientIdRef.current }); } catch (e) {}
          } else if (data.type === 'state') {
            // Avoid applying stale state that would overwrite recent local strokes.
            // Only apply if local is empty AND we're not currently applying remote events.
            // This prevents old state snapshots from overwriting newly drawn strokes.
            applyingRemoteRef.current = true;
            setStrokes((local) => {
              if (local.length === 0 && Array.isArray(data.strokes)) {
                console.log('[WB BC] Applying state snapshot:', data.strokes.length, 'strokes');
                return data.strokes;
              }
              if (local.length > 0) {
                if (verboseLogging) logAnomaly('BC state ignored due to local strokes', { localCount: local.length, remoteCount: data.strokes?.length });
                console.log('[WB BC] Ignoring state snapshot because local strokes exist:', local.length);
              }
              return local;
            });
            applyingRemoteRef.current = false;
          }
        } catch (e) {
          console.error('[WB BC] Error handling incoming message:', e);
          if (verboseLogging) {
            pushError('[WB BC] Error handling incoming message');
            logAnomaly('BroadcastChannel message handler error', e);
          }
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

  // redraw when strokes change
  useEffect(() => {
    drawAll();
    // Expose strokes to window for E2E testing
    if (typeof window !== 'undefined') {
      (window as any).__whiteboard_strokes = strokes;
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
      // Use courseId from URL parameter directly to ensure POST and GET use same uuid
      const params = new URLSearchParams(window.location.search);
      const courseParam = params.get('courseId') || 'classroom';
      const uuid = `course_${courseParam}`;
      // In production (Amplify/CloudFront) long-lived SSE often fails or is buffered; use polling there.
      // Must match server-side logic in app/api/whiteboard/stream/route.ts
      const isProduction = window.location.hostname.includes('jvtutorcorner.com') || 
                           window.location.hostname.includes('amplifyapp.com') || 
                           window.location.hostname.includes('cloudfront.net');

      if (isProduction) {
        console.log('[WB SSE] Production/Amplify detected - skipping SSE. Falling back to /api/whiteboard/state polling.');
        console.log('[WB POLL] Using uuid:', uuid, 'from courseId:', courseParam);
        // Try fetching persisted state immediately and then poll periodically
        let pollId: number | null = null;
        let lastRemoteHash = '';
        const fetchAndApply = async () => {
          try {
            const resp = await fetch(`/api/whiteboard/state?uuid=${encodeURIComponent(uuid)}`);
              if (!resp.ok) {
                const txt = await resp.text().catch(() => '(no body)');
                console.warn('[WB POLL] /api/whiteboard/state returned non-ok', resp.status, txt.slice(0, 200));
                if (verboseLogging) {
                  pushError(`[WB POLL] /api/whiteboard/state returned non-ok ${resp.status}`);
                  logAnomaly('Production /state returned non-ok', { status: resp.status, bodyPreview: txt?.slice(0,200) });
                }
                return;
              }
            const j = await resp.json();
            const s = j?.state;
            if (s && Array.isArray(s.strokes)) {
              // Compare both count and content to detect updates (not just count changes)
              const remoteCount = s.strokes.length;
              const localCount = strokesRef.current.length;
              const remoteHash = remoteCount > 0 ? JSON.stringify(s.strokes.map((st: any) => st.id)).slice(0, 100) : '';
              const localHash = localCount > 0 ? JSON.stringify(strokesRef.current.map((st: any) => st.id)).slice(0, 100) : '';
              
              // Detect missing strokes: if remote has more or different content
              const isMismatch = remoteCount !== localCount || remoteHash !== localHash;
              const isNewUpdate = remoteHash !== lastRemoteHash; // content actually changed since last sync
              
              if (isMismatch && isNewUpdate) {
                console.log('[WB POLL] ✓ Sync update detected: local=', localCount, 'remote=', remoteCount, 'mismatch=', isMismatch);
                setStrokes(s.strokes);
                lastRemoteHash = remoteHash; // track this update
                  if (verboseLogging) {
                    console.log('[WB POLL] Applied remote strokes in production poll');
                  }
              } else if (isMismatch && !isNewUpdate) {
                // Same data as before (server didn't change), but we mismatch.
                // If local > remote, it means we have pending strokes that server hasn't seen yet.
                // DO NOT overwrite local state with stale remote state.
                if (localCount > remoteCount) {
                  if (verboseLogging) console.log('[WB POLL] Local ahead of server (pending sync), ignoring stale remote state');
                  return;
                }

                // Only force resync if we are truly behind (remote > local) or same count but diff hash (rare collision/corruption)
                console.warn('[WB POLL] ⚠ Client behind server by', remoteCount - localCount, 'strokes - forcing resync');
                setStrokes(s.strokes);
                lastRemoteHash = remoteHash;
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
        // Two-tier polling: fast ACK (80ms) for stroke confirmation + balanced main polling (300ms) to avoid overload
        try { pollId = window.setInterval(fetchAndApply, 300) as unknown as number; } catch (e) { pollId = null; } // 300ms = 3x per second (sustainable)

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
            console.log('[WB SSE] Applying initial state:', data.strokes?.length, 'strokes');
            if (Array.isArray(data.strokes)) {
              // Only apply initial state if local is empty to avoid wiping
              // a locally drawn stroke that may have happened just before
              // the server's init-state arrives (common race condition).
              // This prevents stale init-state from overwriting fresh strokes.
              setStrokes((local) => {
                if (local.length === 0) {
                  console.log('[WB SSE] Accepted init-state with', data.strokes.length, 'strokes');
                  return data.strokes;
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
            console.log('[WB SSE] Applying stroke-start:', data);
            applyingRemoteRef.current = true;
            setStrokes((s) => {
              const strokeId = data.strokeId || (data.stroke as any)?.id;
              if (strokeId && s.some(st => (st as any).id === strokeId)) {
                console.log('[WB SSE] Ignoring stroke-start for duplicate strokeId:', strokeId);
                return s;
              }
              console.log('[WB SSE] Adding new stroke:', strokeId);
              return [...s, data.stroke];
            });
            applyingRemoteRef.current = false;
          } else if (data.type === 'stroke-update') {
            console.log('[WB SSE] Applying stroke-update:', data.strokeId);
            applyingRemoteRef.current = true;
            setStrokes((s) => {
              const idx = s.findIndex((st) => (st as any).id === data.strokeId);
              const malformed = !Array.isArray(data.points) || data.points.some((p: any) => typeof p !== 'number' || Number.isNaN(p));
              if (malformed) {
                if (verboseLogging) logAnomaly('SSE received malformed stroke-update (points invalid)', { strokeId: data.strokeId, points: data.points });
                console.warn('[WB SSE] Malformed stroke-update, ignoring:', data.strokeId);
                return s;
              }
              if (idx >= 0) {
                // Update specific stroke without affecting others
                const updated = { ...(s[idx] as any), points: data.points };
                const result = [...s.slice(0, idx), updated, ...s.slice(idx + 1)];
                console.log('[WB SSE] Updated stroke at index', idx, 'now total:', result.length);
                return result;
              }
              if (verboseLogging) logAnomaly('SSE received stroke-update for unknown strokeId (appending)', { strokeId: data.strokeId, pointsLen: Array.isArray(data.points) ? data.points.length : null });
              console.warn('[WB SSE] stroke-update for unknown strokeId, creating new:', data.strokeId);
              return [...s, { points: data.points, stroke: '#000', strokeWidth: 2, mode: 'draw', id: data.strokeId } as any];
            });
            applyingRemoteRef.current = false;
          } else if (data.type === 'undo') {
            setStrokes((s) => s.filter((st) => (st as any).id !== data.strokeId));
          } else if (data.type === 'redo') {
            setStrokes((s) => [...s, data.stroke]);
          } else if (data.type === 'clear') {
            setStrokes([]);
            setUndone([]);
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* PDF selector moved to /my-courses page (server-side whiteboard events). */}

          {/* Microphone and leave controls moved to the classroom sidebar; toolbar keeps drawing tools only. */}

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

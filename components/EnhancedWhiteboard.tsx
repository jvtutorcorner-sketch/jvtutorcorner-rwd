"use client";

import React, { useRef, useState, useEffect, useCallback } from 'react';

export interface WhiteboardProps {
  room?: any; // Netless whiteboard room (if provided, use it; otherwise use canvas fallback)
  whiteboardRef?: React.RefObject<HTMLDivElement>; // Ref for Netless whiteboard container
  width?: number;
  height?: number;
  className?: string;
  onPdfSelected?: (file: File | null) => void;
  pdfFile?: File | null; // PDF file to display as background
  micEnabled?: boolean;
  onToggleMic?: () => void;
  hasMic?: boolean;
  onLeave?: () => void;
}

type Stroke = { points: number[]; stroke: string; strokeWidth: number; mode: 'draw' | 'erase' };

export default function EnhancedWhiteboard({ 
  room,
  whiteboardRef,
  width = 800, 
  height = 600, 
  className = '', 
  onPdfSelected, 
  pdfFile,
  micEnabled,
  onToggleMic,
  hasMic,
  onLeave
}: WhiteboardProps) {
  const bcRef = useRef<BroadcastChannel | null>(null);
  const clientIdRef = useRef<string>(`c_${Math.random().toString(36).slice(2)}`);
  const applyingRemoteRef = useRef(false);

  // helper to POST events to server relay
  const postEventToServer = useCallback(async (event: any) => {
    try {
      // Use courseId as UUID so all participants in same course share the channel
      const params = new URLSearchParams(window.location.search);
      const courseId = params.get('courseId') || 'default';
      const uuid = `course_${courseId}`;
      console.log('[WB POST] Sending event to server:', event.type, 'uuid:', uuid);
      const response = await fetch('/api/whiteboard/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uuid, event }) });
      const result = await response.json();
      console.log('[WB POST] Server response:', result);
    } catch (e) {
      console.error('[WB POST] Error posting event:', e);
    }
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null); // Background canvas for PDF
  const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
  const [color, setColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undone, setUndone] = useState<Stroke[]>([]);
  const isDrawingRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  
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
        // @ts-ignore
        const lib = await import('pdfjs-dist/build/pdf');
        (lib as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        setPdfLib(lib);
      } catch (e) {
        console.warn('Failed to load pdfjs', e);
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

        await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
      } catch (e) {
        console.error('Failed to render PDF page', e);
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

  // draw all strokes into the canvas (coordinates are CSS pixels)
  const drawAll = useCallback(() => {
    const el = canvasRef.current;
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
      ctx.moveTo(s.points[0], s.points[1]);
      for (let i = 2; i < s.points.length; i += 2) {
        ctx.lineTo(s.points[i], s.points[i + 1]);
      }
      ctx.stroke();
    });
  }, [strokes]);

  // Attach non-passive touch listeners to prevent page scroll while drawing on mobile
  

  const getPointerPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): { x: number; y: number } => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = true;
    const pos = getPointerPos(e);
    const newStroke: Stroke & { id?: string; origin?: string } = { points: [pos.x, pos.y], stroke: color, strokeWidth, mode: tool === 'eraser' ? 'erase' : 'draw', id: `${clientIdRef.current}_${Date.now()}` , origin: clientIdRef.current };
    setStrokes((s) => [...s, newStroke]);
    setUndone([]);
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
  }, [tool, color, strokeWidth, postEventToServer]);

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
          postEventToServer({ type: 'stroke-update', strokeId: (updated as any).id, points: updated.points });
        }
      } catch (e) {}
      return out;
    });
  }, [postEventToServer]);

  const handlePointerUp = useCallback(() => {
    isDrawingRef.current = false;
  }, []);

  const undo = useCallback(() => {
    setStrokes((s) => {
      if (s.length === 0) return s;
      const last = s[s.length - 1];
      setUndone((u) => [...u, last]);
      const next = s.slice(0, -1);
      try { if (!useNetlessWhiteboard && bcRef.current) bcRef.current.postMessage({ type: 'undo', strokeId: (last as any).id, clientId: clientIdRef.current }); } catch (e) {}
      try { if (!useNetlessWhiteboard) postEventToServer({ type: 'undo', strokeId: (last as any).id }); } catch (e) {}
      return next;
    });
  }, []);

  const redo = useCallback(() => {
    setUndone((u) => {
      if (u.length === 0) return u;
      const last = u[u.length - 1];
      setStrokes((s) => [...s, last]);
      try { if (!useNetlessWhiteboard && bcRef.current) bcRef.current.postMessage({ type: 'redo', stroke: last, clientId: clientIdRef.current }); } catch (e) {}
      try { if (!useNetlessWhiteboard) postEventToServer({ type: 'redo', stroke: last }); } catch (e) {}
      return u.slice(0, -1);
    });
  }, []);

  const clearAll = useCallback(() => {
    setStrokes([]);
    setUndone([]);
    try { if (!useNetlessWhiteboard && bcRef.current) bcRef.current.postMessage({ type: 'clear', clientId: clientIdRef.current }); } catch (e) {}
    try { if (!useNetlessWhiteboard) postEventToServer({ type: 'clear' }); } catch (e) {}
  }, [useNetlessWhiteboard, postEventToServer]);

  // BroadcastChannel setup for canvas sync (per-page channel)
  useEffect(() => {
    if (useNetlessWhiteboard) return;
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const courseId = params.get('courseId') || 'default';
      const name = `whiteboard_course_${courseId}`;
      const ch = new BroadcastChannel(name);
      bcRef.current = ch;
      ch.onmessage = (ev: MessageEvent) => {
        const data = ev.data as any;
        if (!data || data.clientId === clientIdRef.current) return; // ignore our own
        try {
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
            setStrokes((s) => [...s, data.stroke]);
            applyingRemoteRef.current = false;
          } else if (data.type === 'stroke-update') {
            applyingRemoteRef.current = true;
            setStrokes((s) => {
              const idx = s.findIndex((st) => (st as any).id === data.strokeId);
              if (idx >= 0) {
                const updated = { ...(s[idx] as any), points: data.points };
                return [...s.slice(0, idx), updated, ...s.slice(idx + 1)];
              }
              // if not found, append
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
            try { ch.postMessage({ type: 'state', strokes, clientId: clientIdRef.current }); } catch (e) {}
          } else if (data.type === 'state') {
            // only apply if local empty to avoid overwriting
            setStrokes((local) => {
              if (local.length === 0 && Array.isArray(data.strokes)) return data.strokes;
              return local;
            });
          }
        } catch (e) {
          // ignore
        }
      };

      // ask for state from others
      setTimeout(() => { try { ch.postMessage({ type: 'request-state', clientId: clientIdRef.current }); } catch (e) {} }, 200);

      return () => { try { ch.close(); } catch (e) {} };
    } catch (e) {
      // BroadcastChannel not available
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useNetlessWhiteboard, setStrokes, setUndone, strokes]);

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

    const toolbarHeight = 48; // same as used when computing canvas height

    function resizeCanvasToDisplaySize() {
      if (pdf) return; // When PDF is loaded, size is fixed by props
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
  }, [drawAll]);

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
      // Use courseId as UUID so all participants in same course share the channel
      const params = new URLSearchParams(window.location.search);
      const courseId = params.get('courseId') || 'default';
      const uuid = `course_${courseId}`;
      console.log('[WB SSE] Connecting to SSE stream:', `/api/whiteboard/stream?uuid=${uuid}`);
      const es = new EventSource(`/api/whiteboard/stream?uuid=${uuid}`);
      
      es.onopen = () => {
        console.log('[WB SSE] Connection opened successfully');
      };
      
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (!data) return;
          // ignore connected pings
          if (data.type === 'connected') {
            console.log('[WB SSE] Received connected message');
            return;
          }
          if (data.type === 'ping') return;

          console.log('[WB SSE] Received event:', data.type, data);

          // apply same handlers as BroadcastChannel messages
          if (data.type === 'stroke-start') {
            console.log('[WB SSE] Applying stroke-start:', data);
            setStrokes((s) => [...s, data.stroke]);
          } else if (data.type === 'stroke-update') {
            console.log('[WB SSE] Applying stroke-update:', data.strokeId);
            setStrokes((s) => {
              const idx = s.findIndex((st) => (st as any).id === data.strokeId);
              if (idx >= 0) {
                const updated = { ...(s[idx] as any), points: data.points };
                return [...s.slice(0, idx), updated, ...s.slice(idx + 1)];
              }
              return [...s, { points: data.points, stroke: '#000', strokeWidth: 2, mode: 'draw', id: data.strokeId } as any];
            });
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
        try { es.close(); } catch (e) {} 
      };
      return () => { try { es.close(); } catch (e) {} };
    } catch (e) {
      // ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useNetlessWhiteboard]);

  return (
    <div className={`canvas-whiteboard ${className}`} style={{ border: '1px solid #ddd', width: whiteboardWidth, height: 'auto' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8, background: '#f5f5f5', borderBottom: '1px solid #ddd', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* PDF quick-select (left of mic) */}
          <button
            type="button"
            onClick={() => { const el = document.getElementById('pdf-input-toolbar') as HTMLInputElement | null; el?.click(); }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'white',
              border: '1px solid #ddd',
              cursor: 'pointer'
            }}
            title="Select PDF"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="2" y="2" width="20" height="20" rx="2" fill="#ea4335" />
              <text x="12" y="16" fontSize="9" fontWeight="700" fill="#fff" textAnchor="middle">PDF</text>
            </svg>
          </button>
          <input
            id="pdf-input-toolbar"
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f) setSelectedFileName(f.name);
                else setSelectedFileName(null);
                // update local state so remote handlers will prefer this file
                if (f) setLocalPdfFile(f);
                if (typeof onPdfSelected === 'function') onPdfSelected?.(f);

                    // read as data URL and broadcast to other tabs/devices (only when a file exists)
                    if (f) {
                      try {
                        const reader = new FileReader();
                        reader.onload = async () => {
                          try {
                            const dataUrl = String(reader.result || '');
                            if (bcRef.current) {
                              try { bcRef.current.postMessage({ type: 'pdf-set', name: f.name, dataUrl, clientId: clientIdRef.current }); } catch (e) {}
                            }
                            try { await postEventToServer({ type: 'pdf-set', name: f.name, dataUrl }); } catch (e) {}
                          } catch (e) {
                            console.error('[WB] Failed to broadcast selected PDF', e);
                          }
                        };
                        reader.readAsDataURL(f);
                      } catch (e) {
                        console.error('[WB] Failed to read selected PDF', e);
                      }
                    }
              }}
          />
          <div style={{ fontSize: 12, color: '#444', maxWidth: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedFileName ?? ''}</div>

          {onToggleMic && (
            <button 
              onClick={onToggleMic} 
              disabled={hasMic === false}
              title={micEnabled ? "Mute Microphone" : "Unmute Microphone"}
              style={{ 
                width: 40,
                height: 40,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: micEnabled ? 'white' : '#ea4335', 
                color: micEnabled ? '#3c4043' : 'white',
                border: micEnabled ? '1px solid #dadce0' : 'none', 
                cursor: hasMic === false ? 'not-allowed' : 'pointer',
                marginRight: 8,
                fontSize: 20,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease'
              }}
            >
              {micEnabled ? '🎤' : '🔇'}
            </button>
          )}

          <button onClick={() => setTool('pencil')} style={{ padding: '6px 10px', background: tool === 'pencil' ? '#e3f2fd' : 'white', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>✏️</button>
          <button onClick={() => setTool('eraser')} style={{ padding: '6px 10px', background: tool === 'eraser' ? '#e3f2fd' : 'white', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>🧽</button>
        </div>
        <div>
          <input aria-label="Pen color" type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 36, height: 32, padding: 0, border: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12 }}>宽度:</span>
          <input type="range" min={1} max={30} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} style={{ width: 60 }} />
          <span style={{ fontSize: 12, minWidth: 20 }}>{strokeWidth}</span>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button onClick={undo} style={{ padding: '6px 10px', border: '1px solid #ddd', background: 'white', borderRadius: 4, cursor: 'pointer' }} title="撤销">↶</button>
          <button onClick={redo} style={{ padding: '6px 10px', border: '1px solid #ddd', background: 'white', borderRadius: 4, cursor: 'pointer' }} title="重做">↷</button>
          <button onClick={clearAll} style={{ padding: '6px 10px', border: '1px solid #ddd', background: '#ffebee', color: '#c62828', borderRadius: 4, cursor: 'pointer' }} title="清空">🗑️</button>
          {typeof onLeave === 'function' && (
            <button
              onClick={() => { try { onLeave?.(); } catch (e) {} }}
              title="離開"
              style={{
                padding: '6px 10px',
                border: 'none',
                background: '#c62828',
                color: 'white',
                borderRadius: 4,
                cursor: 'pointer',
                marginLeft: 8
              }}
            >
              離開
            </button>
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }} />
      </div>

      <div style={{ position: 'relative', width: '100%', height: canvasHeight, background: 'white' }}>
        {useNetlessWhiteboard ? (
          // Use Netless whiteboard (collaborative)
          <div 
            ref={whiteboardRef}
            style={{ 
              width: '100%', 
              height: '100%',
              background: 'white'
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
              width={whiteboardWidth}
              height={canvasHeight}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              style={{ position: 'absolute', top: 0, left: 0, display: 'block', cursor: 'crosshair', width: '100%', height: '100%' }}
            />
          </>
        )}
      </div>
    </div>
  );
}

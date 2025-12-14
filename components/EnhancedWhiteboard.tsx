"use client";

import React, { useRef, useState, useEffect, useCallback } from 'react';

export interface WhiteboardProps {
  room?: any; // Netless whiteboard room (if provided, use it; otherwise use canvas fallback)
  width?: number;
  height?: number;
  className?: string;
}

type Stroke = { points: number[]; stroke: string; strokeWidth: number; mode: 'draw' | 'erase' };

export default function EnhancedWhiteboard({ room, width = 800, height = 600, className = '' }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
  const [color, setColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undone, setUndone] = useState<Stroke[]>([]);
  const isDrawingRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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

  // redraw canvas whenever strokes change
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    
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
  }, [strokes, width, height]);

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
    const newStroke: Stroke = { points: [pos.x, pos.y], stroke: color, strokeWidth, mode: tool === 'eraser' ? 'erase' : 'draw' };
    setStrokes((s) => [...s, newStroke]);
    setUndone([]);
  }, [tool, color, strokeWidth]);

  const handlePointerMove = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const pos = getPointerPos(e);
    setStrokes((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      const updated = { ...last, points: last.points.concat([pos.x, pos.y]) };
      return [...prev.slice(0, -1), updated];
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    isDrawingRef.current = false;
  }, []);

  const undo = useCallback(() => {
    setStrokes((s) => {
      if (s.length === 0) return s;
      const last = s[s.length - 1];
      setUndone((u) => [...u, last]);
      return s.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setUndone((u) => {
      if (u.length === 0) return u;
      const last = u[u.length - 1];
      setStrokes((s) => [...s, last]);
      return u.slice(0, -1);
    });
  }, []);

  const clearAll = useCallback(() => {
    setStrokes([]);
    setUndone([]);
  }, []);

  return (
    <div className={`canvas-whiteboard ${className}`} style={{ border: '1px solid #ddd', width, height }}>
      <div style={{ display: 'flex', gap: 8, padding: 8, background: '#f5f5f5', borderBottom: '1px solid #ddd', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
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
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={undo} style={{ padding: '6px 10px', border: '1px solid #ddd', background: 'white', borderRadius: 4, cursor: 'pointer' }} title="撤销">↶</button>
          <button onClick={redo} style={{ padding: '6px 10px', border: '1px solid #ddd', background: 'white', borderRadius: 4, cursor: 'pointer' }} title="重做">↷</button>
          <button onClick={clearAll} style={{ padding: '6px 10px', border: '1px solid #ddd', background: '#ffebee', color: '#c62828', borderRadius: 4, cursor: 'pointer' }} title="清空">🗑️</button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={width}
        height={height - 48}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        style={{ display: 'block', cursor: 'crosshair', background: 'white' }}
      />
    </div>
  );
}
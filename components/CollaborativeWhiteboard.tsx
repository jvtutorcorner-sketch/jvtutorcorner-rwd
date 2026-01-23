"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
// import throttle from 'lodash/throttle'; // Removed to prevent data loss

/**
 * Spec compliance:
 * 1. Dual-layer Canvas: TopCanvas (Local active) & BottomCanvas (History/Remote)
 * 2. Payload Optimization: Math.round coords, Batching (Time-based + Count-based)
 * 3. Flicker Prevention: Direct canvas drawing, no clearRect on stream
 * 4. Fix: Removed throttling on sender to prevent missing strokes (data loss).
 */

interface CollaborativeWhiteboardProps {
  appId?: string;
  token?: string;
  channelName?: string;
  userId?: string;
  width?: number;
  height?: number;
  color?: string;
  lineWidth?: number;
  editable?: boolean;
}

interface DrawPacket {
  type: 'draw_stream';
  points: number[]; // [x1, y1, x2, y2, ...]
  color: string;
  lineWidth: number;
  isEnd: boolean;
  strokeId: string;
}

interface Point {
  x: number;
  y: number;
}

export default function CollaborativeWhiteboard({
  appId = '5cbf2f6128cf4e5ea92e046e3c161621',
  token,
  channelName = 'test-channel',
  userId = `user_${Math.floor(Math.random() * 10000)}`,
  width = 800,
  height = 600,
  color = '#000000',
  lineWidth = 3,
  editable = true,
}: CollaborativeWhiteboardProps) {
  // Dual Canvas Refs
  const bottomCanvasRef = useRef<HTMLCanvasElement>(null);
  const topCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Context Refs (to avoid re-renders)
  const bottomCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const topCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  
  // State for drawing logic
  const isDrawingRef = useRef(false);
  const currentStrokeIdRef = useRef<string | null>(null);
  const pointsBufferRef = useRef<number[]>([]);
  const lastPointRef = useRef<{ x: number, y: number } | null>(null);
  
  // RTM Client Ref
  const rtmClientRef = useRef<any>(null);

  // Initialize Canvas Contexts
  useEffect(() => {
    if (bottomCanvasRef.current && topCanvasRef.current) {
      bottomCtxRef.current = bottomCanvasRef.current.getContext('2d');
      topCtxRef.current = topCanvasRef.current.getContext('2d');
      
      [bottomCtxRef.current, topCtxRef.current].forEach(ctx => {
        if (ctx) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }
      });
    }
  }, []);

  // Initialize Agora RTM
  useEffect(() => {
    let mounted = true;

    const initRTM = async () => {
      // Dynamic import to avoid SSR issues
      const AgoraRTM = await import('agora-rtm-sdk');
      
      const RTM = (AgoraRTM as any).RTM;
      const client = new RTM(appId, userId, {});
      rtmClientRef.current = client;

      try {
        await client.login({token: token || undefined});
        await client.subscribe(channelName);

        client.on('message', (event: any) => {
          if (event.channelName === channelName) {
            try {
              const data = JSON.parse(event.message) as DrawPacket;
              if (data.type === 'draw_stream') {
                handleRemoteDraw(data);
              }
            } catch (e) {
              console.error('Failed to parse RTM message', e);
            }
          }
        });

        console.log('RTM Joined', { channelName, userId });
      } catch (err) {
        console.error('RTM Init Error', err);
      }
    };

    initRTM();

    return () => {
      mounted = false;
      if (rtmClientRef.current) rtmClientRef.current.logout();
    };
  }, [appId, token, channelName, userId]);

  // Spec: Direct drawing for remote data
  const handleRemoteDraw = (data: DrawPacket) => {
    const ctx = bottomCtxRef.current;
    if (!ctx) return;

    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.lineWidth;
    ctx.beginPath();
    
    // Draw the segment received
    let hasMoved = false;
    for (let i = 0; i < data.points.length; i += 2) {
      const x = data.points[i];
      const y = data.points[i + 1];
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
        hasMoved = true;
      }
    }
    
    // Support Dots (single point click)
    if (!hasMoved && data.points.length === 2) {
       ctx.lineTo(data.points[0], data.points[1]); // Zero-length line to create a dot with round cap
    }

    ctx.stroke();
  };

  // Spec: Send immediately without throttling to prevent data loss
  const sendDrawPacket = useCallback((packet: DrawPacket) => {
    if (rtmClientRef.current) {
      rtmClientRef.current.publish(channelName, JSON.stringify(packet))
        .catch((err: any) => console.error('RTM Send Error', err));
    }
  }, [channelName]);

  // Flush buffer helper
  const flushBuffer = useCallback(() => {
    if (pointsBufferRef.current.length < 4) return; // Need at least 2 points (4 coords) to draw a segment

    const packetPoints = [...pointsBufferRef.current];
    const lastX = packetPoints[packetPoints.length - 2];
    const lastY = packetPoints[packetPoints.length - 1];

    sendDrawPacket({
      type: 'draw_stream',
      points: packetPoints,
      color,
      lineWidth,
      isEnd: false,
      strokeId: currentStrokeIdRef.current || '',
    });

    // Keep the last point as the start of the next segment to ensure continuity
    pointsBufferRef.current = [lastX, lastY];
  }, [sendDrawPacket, color, lineWidth]);

  // Time-based flush (every 50ms) to ensure smooth updates even when drawing slowly
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (isDrawingRef.current) {
        flushBuffer();
      }
    }, 50);
    return () => clearInterval(intervalId);
  }, [flushBuffer]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!editable) return;
    isDrawingRef.current = true;
    currentStrokeIdRef.current = `${userId}_${Date.now()}`;
    
    const { x, y } = getCoordinates(e);
    const rx = Math.round(x);
    const ry = Math.round(y);
    
    lastPointRef.current = { x: rx, y: ry };
    pointsBufferRef.current = [rx, ry];
    
    // Start local drawing on TopCanvas
    const ctx = topCtxRef.current;
    if (ctx) {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current || !editable) return;
    
    const { x, y } = getCoordinates(e);
    const rx = Math.round(x);
    const ry = Math.round(y);
    
    // 1. Local Draw on TopLayer
    const ctx = topCtxRef.current;
    if (ctx) {
      ctx.lineTo(rx, ry);
      ctx.stroke();
    }
    
    // 2. Add to buffer
    pointsBufferRef.current.push(rx, ry);
    
    // 3. Optional: Cap buffer size to avoid huge packets if interval is delayed
    if (pointsBufferRef.current.length >= 80) { // 40 points
      flushBuffer();
    }
  };

  const stopDrawing = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    
    // Send final remaining points
    if (pointsBufferRef.current.length > 0) {
      sendDrawPacket({
        type: 'draw_stream',
        points: pointsBufferRef.current,
        color,
        lineWidth,
        isEnd: true,
        strokeId: currentStrokeIdRef.current || '',
      });
    }
    
    // Spec: Transfer TopCanvas to BottomCanvas and clear TopCanvas
    if (bottomCtxRef.current && topCanvasRef.current) {
      bottomCtxRef.current.drawImage(topCanvasRef.current, 0, 0);
      const topCtx = topCtxRef.current;
      if (topCtx) {
        topCtx.clearRect(0, 0, width, height);
      }
    }
    
    pointsBufferRef.current = [];
    currentStrokeIdRef.current = null;
    lastPointRef.current = null;
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): Point => {
    let clientX, clientY;
    if ('touches' in e.nativeEvent) {
      clientX = e.nativeEvent.touches[0].clientX;
      clientY = e.nativeEvent.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    const rect = topCanvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  return (
    <div className="relative border border-gray-400 overflow-hidden" style={{ width, height }}>
      {/* Bottom Layer: Persistence / History / Remote */}
      <canvas
        ref={bottomCanvasRef}
        width={width}
        height={height}
        className="absolute top-0 left-0 bg-white"
      />
      
      {/* Top Layer: Local Real-time Active Stroke */}
      <canvas
        ref={topCanvasRef}
        width={width}
        height={height}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        className="absolute top-0 left-0 cursor-crosshair touch-none"
      />
    </div>
  );
}

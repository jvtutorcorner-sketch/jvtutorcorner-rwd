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

const VIRTUAL_WIDTH = 1920;
const VIRTUAL_HEIGHT = 1080;

interface CollaborativeWhiteboardProps {
  appId?: string;
  token?: string;
  channelName?: string;
  userId?: string;
  className?: string; // Add className support for external styling
  color?: string;
  lineWidth?: number;
  editable?: boolean;
}

interface DrawPacket {
  type: 'draw_stream';
  points: number[]; // [x1, y1, x2, y2, ...] (Virtual Coordinates)
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
  className = '',
  color = '#000000',
  lineWidth = 3,
  editable = true,
}: CollaborativeWhiteboardProps) {
  // Container & Canvas Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomCanvasRef = useRef<HTMLCanvasElement>(null);
  const topCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Scale Refs (Virtual -> Screen)
  const scaleRef = useRef({ x: 1, y: 1 });

  
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
  
  // Message Queue for RTM to prevent rate-limit dropping and ensure ordering
  const messageQueueRef = useRef<DrawPacket[]>([]);
  const isSendingRef = useRef(false);
  
  // Remote draw queue for smooth rendering
  const remoteDrawQueueRef = useRef<DrawPacket[]>([]);
  const isRemoteDrawingRef = useRef(false);

  // Coordinate System Helpers
  const toVirtual = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    
    // Relative position in the container
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Convert to Virtual Space (1920x1080)
    // Formula: (CurrentPos / CurrentWidth) * VirtualWidth
    const vx = Math.round((x / rect.width) * VIRTUAL_WIDTH);
    const vy = Math.round((y / rect.height) * VIRTUAL_HEIGHT);
    
    return { x: vx, y: vy };
  }, []);

  const toScreen = useCallback((vx: number, vy: number) => {
    // Convert Virtual Space to LOCAL CSS Pixels for Drawing logic
    // We do NOT multiply by DPR here because we use ctx.scale(dpr, dpr)
    // So the drawing context expects CSS pixel coordinates.
    return {
      x: vx * scaleRef.current.x,
      y: vy * scaleRef.current.y
    };
  }, []);

  // Initialize Canvas & Handle Resize (DPI + Aspect Ratio)
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const bottomCvs = bottomCanvasRef.current;
      const topCvs = topCanvasRef.current;
      
      if (!container || !bottomCvs || !topCvs) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // 1. Calculate Scale Factors (Screen CSS w / Virtual w)
      scaleRef.current = {
        x: rect.width / VIRTUAL_WIDTH,
        y: rect.height / VIRTUAL_HEIGHT
      };

      // 2. Setup Canvases with DPI correction
      [bottomCvs, topCvs].forEach(canvas => {
        // Set physical pixel size (buffer size)
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        // Set CSS display size (already handled by container layout usually, but good to ensure matches)
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;

        // Scale context
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Reset transform to avoid accumulation if called multiple times (though width reset does it technically)
          ctx.setTransform(1, 0, 0, 1, 0, 0); 
          ctx.scale(dpr, dpr);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }
      });
      
      // Update refs
      bottomCtxRef.current = bottomCvs.getContext('2d');
      topCtxRef.current = topCvs.getContext('2d');
    };

    // Initial setup
    handleResize();

    // Listen
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
                // Debounce remote draws to prevent excessive updates during rapid drawing
                if (!isRemoteDrawingRef.current) {
                  handleRemoteDraw(data);
                } else {
                  // If already processing, queue it (but limit queue size to prevent backlog)
                  if (remoteDrawQueueRef.current.length < 10) {
                    remoteDrawQueueRef.current.push(data);
                  }
                }
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

  // Spec: Queue remote draws for smooth rendering to prevent flickering
  const handleRemoteDraw = (data: DrawPacket) => {
    remoteDrawQueueRef.current.push(data);
    if (!isRemoteDrawingRef.current) {
      isRemoteDrawingRef.current = true;
      requestAnimationFrame(processRemoteDrawQueue);
    }
  };

  // Process remote draw queue in animation frame
  const processRemoteDrawQueue = () => {
    const ctx = bottomCtxRef.current;
    if (!ctx) {
      isRemoteDrawingRef.current = false;
      return;
    }

    // Process up to 5 remote draws per frame to prevent overwhelming
    let processed = 0;
    while (remoteDrawQueueRef.current.length > 0 && processed < 5) {
      const data = remoteDrawQueueRef.current.shift()!;
      
      ctx.strokeStyle = data.color;
      // Responsive Line Width: Scale based on width ratio
      // data.lineWidth is the Virtual Width
      ctx.lineWidth = data.lineWidth * (scaleRef.current.x || 1);
      ctx.beginPath();
      
      // Draw the segment received
      let hasMoved = false;
      for (let i = 0; i < data.points.length; i += 2) {
        // Points are in Virtual Coords
        const vx = data.points[i];
        const vy = data.points[i + 1];
        
        // Convert to Screen
        const { x, y } = toScreen(vx, vy);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
          hasMoved = true;
        }
      }
      
      // Support Dots (single point click)
      if (!hasMoved && data.points.length === 2) {
         const { x: x1, y: y1 } = toScreen(data.points[0], data.points[1]);
         ctx.lineTo(x1, y1); // Zero-length line to create a dot with round cap
      }

      ctx.stroke();
      processed++;
    }

    // If more items remain, schedule next frame
    if (remoteDrawQueueRef.current.length > 0) {
      requestAnimationFrame(processRemoteDrawQueue);
    } else {
      isRemoteDrawingRef.current = false;
    }
  };

  // Spec: Robust Queue-based sending to prevent RTM 429/Busy errors and dropped frames.
  const processQueue = useCallback(async () => {
    if (isSendingRef.current || messageQueueRef.current.length === 0 || !rtmClientRef.current) {
      return;
    }

    isSendingRef.current = true;
    const packet = messageQueueRef.current[0]; // Peek

    try {
      await rtmClientRef.current.publish(channelName, JSON.stringify(packet));
      // On success, dequeue
      messageQueueRef.current.shift();
    } catch (err: any) {
      console.error('RTM Send Error, Will Retry', err);
      // Wait a bit before retry to let rate limit cool down
      await new Promise(resolve => setTimeout(resolve, 200));
    } finally {
      isSendingRef.current = false;
      // Continue processing if there are more
      if (messageQueueRef.current.length > 0) {
         // Using setTimeout to break stack and avoid recursion limits, though await above handles it mostly
         // If we are "backed up", we proceed immediately?
         // Let's add slight delay if we want to be nice, but for real-time we want to drain fast
         processQueue();
      }
    }
  }, [channelName]);

  const sendDrawPacket = useCallback((packet: DrawPacket) => {
    // 1. Enqueue
    messageQueueRef.current.push(packet);
    // 2. Trigger processor
    processQueue();
  }, [processQueue]);

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

    // Important: We keep the LAST point as the START of the next segment.
    // This ensures that even if packets arrive late, the segments visually connect.
    pointsBufferRef.current = [lastX, lastY];
  }, [sendDrawPacket, color, lineWidth]);

  // Time-based flush (every 30ms) to ensure smooth updates even when drawing slowly
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (isDrawingRef.current) {
        flushBuffer();
      }
    }, 30);
    return () => clearInterval(intervalId);
  }, [flushBuffer]);

  const getClientPos = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    } else if ('changedTouches' in e && (e as any).changedTouches.length > 0) {
        // Handle touch end case where touches is empty but changedTouches has the point
        return { clientX: (e as any).changedTouches[0].clientX, clientY: (e as any).changedTouches[0].clientY };
    } else {
      return { clientX: (e as React.MouseEvent).clientX, clientY: (e as React.MouseEvent).clientY };
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!editable) return;
    isDrawingRef.current = true;
    currentStrokeIdRef.current = `${userId}_${Date.now()}`;
    
    // 1. Get Virtual Coords
    const { clientX, clientY } = getClientPos(e);
    const { x: vx, y: vy } = toVirtual(clientX, clientY);
    
    // Store Virtual
    lastPointRef.current = { x: vx, y: vy };
    pointsBufferRef.current = [vx, vy];
    
    // 2. Local Drawing (Convert to Screen)
    const ctx = topCtxRef.current;
    if (ctx) {
      const { x: sx, y: sy } = toScreen(vx, vy);
      ctx.strokeStyle = color;
      // Responsive Line Width: Scale based on width ratio
      // lineWidth is the Virtual Width
      ctx.lineWidth = lineWidth * (scaleRef.current.x || 1);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current || !editable) return;
    
    // 1. Get Virtual Coords
    const { clientX, clientY } = getClientPos(e);
    const { x: vx, y: vy } = toVirtual(clientX, clientY);
    
    // 2. Local Draw (Convert to Screen)
    const ctx = topCtxRef.current;
    if (ctx) {
      const { x: sx, y: sy } = toScreen(vx, vy);
      ctx.lineTo(sx, sy);
      ctx.stroke();
    }
    
    // 3. Add Virtual Point to buffer
    pointsBufferRef.current.push(vx, vy);
    
    // 4. Cap buffer size
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
    // We use the same dimensions for clearRect as the canvas logical size
    if (bottomCtxRef.current && topCanvasRef.current && topCtxRef.current) {
      bottomCtxRef.current.drawImage(topCanvasRef.current, 0, 0);
      
      // Clear using a safe large region or calculate exact
      // Since context is scaled, we clear in logical pixels.
      // We can just use the canvas.width since clearing larger is fine.
      // But accurate is: canvas.width / dpr
      const dpr = window.devicePixelRatio || 1;
      const logicalW = topCanvasRef.current.width / dpr;
      const logicalH = topCanvasRef.current.height / dpr;
      
      topCtxRef.current.clearRect(0, 0, logicalW, logicalH);
    }
    
    pointsBufferRef.current = [];
    currentStrokeIdRef.current = null;
    lastPointRef.current = null;
  };

  return (
    <div 
      ref={containerRef}
      className={`relative border border-gray-400 overflow-hidden ${className}`}
      style={{ 
        width: '100%', 
        maxWidth: '100%',
        aspectRatio: '16 / 9',
        touchAction: 'none' // Prevent scrolling on touch devices
      }}
    >
      {/* Bottom Layer: Persistence / History / Remote */}
      <canvas
        ref={bottomCanvasRef}
        className="absolute top-0 left-0 w-full h-full bg-white block"
      />
      
      {/* Top Layer: Local Real-time Active Stroke */}
      <canvas
        ref={topCanvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        className="absolute top-0 left-0 w-full h-full cursor-crosshair touch-none block"
      />
    </div>
  );
}

'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAgoraClassroom } from '@/lib/agora/useAgoraClassroom';

// ===== 型別 =====
type Role = 'teacher' | 'student';

interface ClassroomProps {
  role?: Role;
  channelName?: string;
}

type WhiteboardTool = 'selector' | 'pencil' | 'eraser' | 'text';

export interface WhiteboardApi {
  setTool: (tool: WhiteboardTool) => void;
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

// Load white-web-sdk from CDN at runtime to avoid bundling issues
function loadWhiteSdkFromCdn(version = '2.16.53') {
  const globalKey = 'WhiteWebSdk';
  if (typeof window === 'undefined') return Promise.reject(new Error('window is undefined'));
  if ((window as any)[globalKey]) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-white-sdk]`);
    if (existing) {
      // already inserted but not loaded yet
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load white-web-sdk')));
      return;
    }

    const script = document.createElement('script');
    script.setAttribute('data-white-sdk', version);
    // use a stable CDN entry; keeps UMD build that attaches to window.WhiteWebSdk
    script.src = `https://cdn.jsdelivr.net/npm/white-web-sdk@${version}/dist/index.js`;
    script.async = true;
    script.onload = () => {
      if ((window as any)[globalKey]) resolve();
      else reject(new Error('white-web-sdk loaded but global not available'));
    };
    script.onerror = () => reject(new Error('Failed to load white-web-sdk from CDN'));
    document.head.appendChild(script);
  });
}

// ===== 可拖曳視訊小窗 =====
interface DraggableVideoProps {
  width?: number;
  height?: number;
  initialX?: number;
  initialY?: number;
  label: string;
  children?: React.ReactNode;
}

const DraggableVideo: React.FC<DraggableVideoProps> = ({
  width = 180,
  height = 120,
  initialX = 20,
  initialY = 20,
  label,
  children,
}) => {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [dragging, setDragging] = useState(false);

  const startRef = useRef({ x: 0, y: 0 });

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    setDragging(true);
    startRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: globalThis.MouseEvent) => {
      setPosition({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width,
        height,
        position: 'absolute',
        left: position.x,
        top: position.y,
        cursor: dragging ? 'grabbing' : 'grab',
        background: '#000',
      }}
    >
      <div style={{ color: '#fff', padding: 4 }}>{label}</div>
      {children}
    </div>
  );
};

// The rest of the classroom UI (simplified for brevity):
const ClientClassroom: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let room: any;
    let destroyed = false;

    const initWhiteboard = async () => {
      try {
        const appId = process.env.NEXT_PUBLIC_NETLESS_APP_ID;
        const roomUUID = process.env.NEXT_PUBLIC_NETLESS_ROOM_UUID;
        const roomToken = process.env.NEXT_PUBLIC_NETLESS_ROOM_TOKEN;

        if (!appId || !roomUUID || !roomToken) {
          setError(
            '尚未設定 Netless 白板環境變數（NEXT_PUBLIC_NETLESS_APP_ID / ROOM_UUID / ROOM_TOKEN）',
          );
          setLoading(false);
          return;
        }

        if (!containerRef.current) {
          setError('Whiteboard container is not ready.');
          setLoading(false);
          return;
        }

        // Ensure SDK is loaded from CDN and use global
        await loadWhiteSdkFromCdn();
        const WhiteWebSdk = (window as any).WhiteWebSdk;

        const sdk = new WhiteWebSdk({
          appIdentifier: appId,
          deviceType: 'Desktop',
          region: 'sg', // 依你的專案調整 cn / us / eu / in / sg
        });

        room = await sdk.joinRoom({
          uuid: roomUUID,
          roomToken,
          isWritable: true,
          floatBar: true, // 內建工具列
          userPayload: {
            userId: `user-${Math.floor(Math.random() * 10000)}`,
          },
        });

        if (destroyed) {
          room?.disconnect?.();
          return;
        }

        room.bindHtmlElement(containerRef.current);
        setLoading(false);
        setError(null);

        // noop for now; external onReady handler could be added
      } catch (err: any) {
        console.error('Whiteboard init error:', err);
        setError(err?.message ?? 'Whiteboard init failed');
        setLoading(false);
      }
    };

    initWhiteboard();

    return () => {
      destroyed = true;
      room?.disconnect?.();
    };
  }, []);

  return (
    <div>
      <div ref={containerRef} style={{ width: '100%', height: '600px', background: '#fff' }} />
      {loading && <div>Loading whiteboard...</div>}
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
  );
};

export default ClientClassroom;

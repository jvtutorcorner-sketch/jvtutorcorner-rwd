// lib/agora/useAgoraClassroom.ts
'use client';

import { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
} from 'agora-rtc-sdk-ng';
// don't import types from white-web-sdk (we load it from CDN at runtime)
type Room = any;

export type ClassroomRole = 'teacher' | 'student';

interface UseAgoraClassroomOptions {
  channelName: string;
  role: ClassroomRole;
}

interface AgoraJoinResponse {
  appId: string;
  channelName: string;
  uid: number;
  token: string;
  whiteboardAppId: string;
  whiteboardRoomUUID: string;
  whiteboardRoomToken: string;
}

export function useAgoraClassroom({ channelName, role }: UseAgoraClassroomOptions) {
  const [client] = useState<IAgoraRTCClient>(() =>
    AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' }),
  );

  const [joined, setJoined] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whiteboardRoom, setWhiteboardRoom] = useState<Room | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const whiteboardRef = useRef<HTMLDivElement | null>(null);
  const whiteboardRoomRef = useRef<Room | null>(null);

  const localMicTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localCamTrackRef = useRef<ICameraVideoTrack | null>(null);

  const join = async () => {
    if (joined || loading) return;

    try {
      setLoading(true);
      setError(null);

      // 簡單給 uid：老師用 1，學生隨機
      const uid =
        role === 'teacher' ? 1 : Math.floor(1000 + Math.random() * 9000);

      const res = await fetch(
        `/api/agora/token?channelName=${encodeURIComponent(
          channelName,
        )}&uid=${uid}`,
      );

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'Failed to fetch token');
      }

      const data = (await res.json()) as AgoraJoinResponse;

      await client.join(data.appId, data.channelName, data.token, data.uid);

      // 初始化白板 — load WhiteWebSdk from global (CDN) at runtime
      const ensureWhiteSdk = () =>
        new Promise<void>((resolve, reject) => {
          if (typeof window === 'undefined') return reject(new Error('window is undefined'));
          if ((window as any).WhiteWebSdk) return resolve();

          // insert script if not present
          const existing = document.querySelector('script[data-white-sdk]');
          if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Failed to load white-web-sdk')));
            return;
          }

          const script = document.createElement('script');
          script.setAttribute('data-white-sdk', 'runtime');
          script.src = 'https://cdn.jsdelivr.net/npm/white-web-sdk@2.16.53/dist/index.js';
          script.async = true;
          script.onload = () => ((window as any).WhiteWebSdk ? resolve() : reject(new Error('white-web-sdk loaded but global not available')));
          script.onerror = () => reject(new Error('Failed to load white-web-sdk from CDN'));
          document.head.appendChild(script);
        });

      await ensureWhiteSdk();
      const WhiteWebSdk = (window as any).WhiteWebSdk;
      const whiteWebSdk = new WhiteWebSdk({
        appIdentifier: data.whiteboardAppId,
        deviceType: 'Surface',
      });

      const room = await whiteWebSdk.joinRoom({
        uuid: data.whiteboardRoomUUID,
        roomToken: data.whiteboardRoomToken,
        uid: String(uid),
        userPayload: {
          cursorName: role === 'teacher' ? 'Teacher' : 'Student',
        },
      });

      if (whiteboardRef.current) {
        room.bindHtmlElement(whiteboardRef.current);
      }

      // 設定預設工具為鉛筆
      room.setMemberState({ currentApplianceName: 'pencil' as any });

      whiteboardRoomRef.current = room;
      setWhiteboardRoom(room);

      const [micTrack, camTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      localMicTrackRef.current = micTrack;
      localCamTrackRef.current = camTrack;

      if (localVideoRef.current) {
        camTrack.play(localVideoRef.current);
      }

      await client.publish([micTrack, camTrack]);

      // 監聽遠端使用者
      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType);

        if (mediaType === 'video' && remoteVideoRef.current && user.videoTrack) {
          user.videoTrack.play(remoteVideoRef.current);
        }

        if (mediaType === 'audio' && user.audioTrack) {
          user.audioTrack.play();
        }

        setRemoteUsers([...client.remoteUsers]);
      });

      client.on('user-unpublished', () => {
        setRemoteUsers([...client.remoteUsers]);
      });

      client.on('user-left', () => {
        setRemoteUsers([...client.remoteUsers]);
      });

      setJoined(true);
    } catch (e: any) {
      console.error('join classroom error:', e);
      setError(e?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const leave = async () => {
    try {
      localCamTrackRef.current?.stop();
      localCamTrackRef.current?.close();
      localMicTrackRef.current?.stop();
      localMicTrackRef.current?.close();

      if (whiteboardRoomRef.current) {
        whiteboardRoomRef.current.disconnect();
        whiteboardRoomRef.current = null;
        setWhiteboardRoom(null);
      }

      client.removeAllListeners();
      await client.leave();
    } finally {
      setJoined(false);
      setRemoteUsers([]);
    }
  };

  // 元件卸載時自動離開
  useEffect(() => {
    return () => {
      if (client) {
        leave();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // 狀態
    joined,
    loading,
    error,
    remoteUsers,
    // DOM refs
    localVideoRef,
    remoteVideoRef,
    whiteboardRef,
    // 控制
    join,
    leave,
    whiteboardRoom,
  };
}

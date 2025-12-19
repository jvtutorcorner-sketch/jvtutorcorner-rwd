// lib/agora/useAgoraClassroom.ts
"use client";

import { useEffect, useRef, useState } from 'react';
import type {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
} from 'agora-rtc-sdk-ng';
// don't import types from white-web-sdk (we load it from CDN at runtime)
type Room = any;

export type ClassroomRole = 'teacher' | 'student';

const hexToRgbArray = (value: string | number[]): [number, number, number] => {
  if (Array.isArray(value) && value.length === 3) {
    const arr = value as number[];
    return [arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0];
  }
  let hex = (value || '').toString().trim();
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (hex.length !== 6 || Number.isNaN(Number.parseInt(hex, 16))) {
    return [0, 0, 0];
  }
  const num = Number.parseInt(hex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
};

// 视频质量配置
export type VideoQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface VideoQualityConfig {
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
}

const VIDEO_QUALITY_PRESETS: Record<VideoQuality, VideoQualityConfig> = {
  low: { width: 320, height: 240, frameRate: 15, bitrate: 200 },
  medium: { width: 640, height: 480, frameRate: 15, bitrate: 500 },
  high: { width: 1280, height: 720, frameRate: 30, bitrate: 1500 },
  ultra: { width: 1920, height: 1080, frameRate: 30, bitrate: 3000 }
};

interface UseAgoraClassroomOptions {
  channelName: string;
  role: ClassroomRole;
  // 新增：1对1优化
  isOneOnOne?: boolean;
  // 新增：默认视频质量
  defaultQuality?: VideoQuality;
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

export function useAgoraClassroom({ 
  channelName, 
  role, 
  isOneOnOne = false,
  defaultQuality = 'high'
}: UseAgoraClassroomOptions) {
  // create client lazily on join (dynamic import) to avoid server-side evaluation
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  // runtime-loaded Agora SDK module (avoid top-level import to prevent SSR errors)
  let AgoraSDK: any = null;

  const [joined, setJoined] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whiteboardMeta, setWhiteboardMeta] = useState<{ uuid?: string; appId?: string; region?: string } | null>(null);

  // 新增：视频质量控制状态
  const [currentQuality, setCurrentQuality] = useState<VideoQuality>(defaultQuality);
  const [isLowLatencyMode, setIsLowLatencyMode] = useState(isOneOnOne);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const whiteboardRef = useRef<HTMLDivElement | null>(null);
  const clientChannelRef = useRef<string | null>(null);

  const localMicTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localCamTrackRef = useRef<ICameraVideoTrack | null>(null);
  const handleUserPublishedRef = useRef<((user: any, mediaType: any) => Promise<void>) | null>(null);
  const handleUserUnpublishedRef = useRef<((user: any) => void) | null>(null);
  const handleUserLeftRef = useRef<(() => void) | null>(null);

  // 视频质量控制函数
  const setVideoQuality = async (quality: VideoQuality) => {
    if (!localCamTrackRef.current) return;

    const config = VIDEO_QUALITY_PRESETS[quality];
    try {
      await localCamTrackRef.current.setEncoderConfiguration({
        width: config.width,
        height: config.height,
        frameRate: config.frameRate,
        bitrateMin: config.bitrate * 0.8,
        bitrateMax: config.bitrate * 1.2,
      });
      setCurrentQuality(quality);
      console.log(`Video quality set to ${quality}:`, config);
    } catch (error) {
      console.error('Failed to set video quality:', error);
    }
  };

  // 低延迟模式切换
  const setLowLatencyMode = async (enabled: boolean) => {
    if (!clientRef.current) return;

    try {
      if (enabled) {
        // 启用低延迟模式 - 设置为观众角色以获得更低的延迟
        await clientRef.current.setClientRole('audience');
      } else {
        // 恢复正常模式
        await clientRef.current.setClientRole('host');
      }
      setIsLowLatencyMode(enabled);
      console.log(`Low latency mode ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Failed to set low latency mode:', error);
    }
  };

  // 1对1优化配置
  const applyOneOnOneOptimizations = async (client: IAgoraRTCClient) => {
    try {
      // 设置网络质量优先级 - 在 RTC 模式下音频优先
      await client.setStreamFallbackOption(0, 1); // 音频优先
      
      console.log('Applied 1-on-1 optimizations');
    } catch (error) {
      console.error('Failed to apply 1-on-1 optimizations:', error);
    }
  };

  // join with options: whether to publish audio/video
  const joinWithOptions = async (opts?: { publishAudio?: boolean; publishVideo?: boolean }) => {
    const { publishAudio = true, publishVideo = true } = opts || {};
    if (joined || loading) return;

    try {
      setLoading(true);
      setError(null);

      // 簡單給 uid：老師用 1，學生隨機

      const uid = role === 'teacher' ? 1 : Math.floor(1000 + Math.random() * 9000);

      const res = await fetch(`/api/agora/token?channelName=${encodeURIComponent(channelName)}&uid=${uid}`);

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'Failed to fetch token');
      }

      const data = (await res.json()) as AgoraJoinResponse;

      // if a client is already connected to a different channel, leave first
      if (clientRef.current && clientChannelRef.current && clientChannelRef.current !== channelName) {
        try {
          // ensure previous session is cleaned up before joining new course
          await leave();
        } catch (e) {
          console.warn('Failed to leave previous session before rejoining', e);
        }
      }

      // ensure Agora client exists (dynamic import)
      if (!clientRef.current) {
        const AgoraModule = await import('agora-rtc-sdk-ng');
        const Agora = (AgoraModule as any).default ?? AgoraModule;
        AgoraSDK = Agora;
        
        // 使用 RTC 模式，所有参与者都可以发布和订阅
        const clientConfig = {
          mode: 'rtc' as const,
          codec: 'vp8' as const
        };
        
        clientRef.current = Agora.createClient(clientConfig);
      }

      const client = clientRef.current!;

      await client.join(data.appId, data.channelName, data.token, data.uid);
      clientChannelRef.current = data.channelName;

      // 应用1对1优化 (AFTER join, when websocket is ready)
      if (isOneOnOne) {
        await applyOneOnOneOptimizations(client);
      }

      // Request server to create/return Agora Whiteboard room + token
      // Use localStorage to share the same whiteboard room UUID across participants
      const whiteboardRoomKey = `whiteboard_room_${channelName}`;
      let wbAppId: string | null = null;
      let wbUuid: string | null = null;
      let wbRoomToken: string | null = null;
      let wbRegion: string | null = null;
      
      try {
        // Try to get existing room UUID from localStorage
        const cachedUuid = typeof window !== 'undefined' ? localStorage.getItem(whiteboardRoomKey) : null;
        
        // Use channelName as whiteboard room name to ensure same room for all participants
        const wbResp = await fetch('/api/agora/whiteboard', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ 
            uuid: cachedUuid, // If we have cached UUID, request token for existing room
            name: channelName,
            role: 'admin' // Use admin role to ensure both teacher and student can write
          }),
        });
        if (wbResp.ok) {
          const wbJson = await wbResp.json();
          wbAppId = wbJson.whiteboardAppId ?? null;
          wbUuid = wbJson.uuid ?? null;
          wbRoomToken = wbJson.roomToken ?? null;
          wbRegion = wbJson.region ?? null;
          
          // Cache the UUID for other participants to use
            if (wbUuid && typeof window !== 'undefined') {
            const isNewRoom = !cachedUuid;
            localStorage.setItem(whiteboardRoomKey, wbUuid);

            // Notify other tabs if this is a newly created room
            if (isNewRoom) {
              try {
                const courseIdFromChannel = channelName.replace(/^course_/, '').split('_')[0];
                const bc = new BroadcastChannel(`whiteboard_course_${courseIdFromChannel}`);
                bc.postMessage({ type: 'whiteboard_room_created', uuid: wbUuid, timestamp: Date.now() });
                setTimeout(() => bc.close(), 100); // Close after brief delay to ensure message sent
              } catch (e) {
                console.warn('BroadcastChannel not available:', e);
              }
            }
          }
          
          console.log('Whiteboard: Using canvas-based fallback instead of Netless SDK');
          setWhiteboardMeta({ uuid: wbUuid ?? undefined, appId: wbAppId ?? undefined, region: wbRegion ?? undefined });
        } else {
          const txt = await wbResp.text();
          console.warn('whiteboard API returned non-OK:', wbResp.status, txt);
        }
      } catch (err) {
        console.warn('Failed to call /api/agora/whiteboard', err);
      }

      // Note: Whiteboard initialization removed - using canvas fallback instead
      console.log('Whiteboard: Using canvas-based fallback instead of Netless SDK');

      // Create tracks according to requested publish options
      let micTrack: IMicrophoneAudioTrack | null = null;
      let camTrack: ICameraVideoTrack | null = null;

      try {
        if (!AgoraSDK) {
          // ensure SDK is loaded (should have been loaded when creating client)
          const mod = await import('agora-rtc-sdk-ng');
          AgoraSDK = (mod as any).default ?? mod;
        }

        if (publishAudio && publishVideo) {
          const tracks = await AgoraSDK.createMicrophoneAndCameraTracks();
          micTrack = tracks[0] ?? null;
          camTrack = tracks[1] ?? null;
        } else if (publishAudio && !publishVideo) {
          micTrack = await AgoraSDK.createMicrophoneAudioTrack();
        } else if (!publishAudio && publishVideo) {
          camTrack = await AgoraSDK.createCameraVideoTrack();
        }

        // 应用视频质量设置
        if (camTrack) {
          const qualityConfig = VIDEO_QUALITY_PRESETS[currentQuality];
          await camTrack.setEncoderConfiguration({
            width: qualityConfig.width,
            height: qualityConfig.height,
            frameRate: qualityConfig.frameRate,
            bitrateMin: qualityConfig.bitrate * 0.8,
            bitrateMax: qualityConfig.bitrate * 1.2,
          });
        }
      } catch (err: any) {
        console.warn('create tracks failed, attempting fallbacks', err?.message ?? err);
        // individual fallbacks
        if (!micTrack && publishAudio) {
          try {
            if (!AgoraSDK) {
              const mod = await import('agora-rtc-sdk-ng');
              AgoraSDK = (mod as any).default ?? mod;
            }
            micTrack = await AgoraSDK.createMicrophoneAudioTrack();
          } catch (mErr: any) {
            console.warn('createMicrophoneAudioTrack failed', mErr?.message ?? mErr);
            micTrack = null;
          }
        }
        if (!camTrack && publishVideo) {
          try {
            if (!AgoraSDK) {
              const mod = await import('agora-rtc-sdk-ng');
              AgoraSDK = (mod as any).default ?? mod;
            }
            camTrack = await AgoraSDK.createCameraVideoTrack();
            // 即使是fallback也要應用質量設置
            if (camTrack) {
              const qualityConfig = VIDEO_QUALITY_PRESETS[currentQuality];
              await camTrack.setEncoderConfiguration({
                width: qualityConfig.width,
                height: qualityConfig.height,
                frameRate: qualityConfig.frameRate,
                bitrateMin: qualityConfig.bitrate * 0.8,
                bitrateMax: qualityConfig.bitrate * 1.2,
              });
            }
          } catch (cErr: any) {
            console.warn('createCameraVideoTrack failed', cErr?.message ?? cErr);
            camTrack = null;
          }
        }
      }

      localMicTrackRef.current = micTrack;
      localCamTrackRef.current = camTrack;

      if (camTrack) {
        const playEl = (role === 'teacher') ? localVideoRef.current : remoteVideoRef.current;
        if (playEl) {
          try {
            camTrack.play(playEl);
          } catch (playErr) {
            console.warn('Failed to play local video track', playErr);
          }
        }
      }

      const publishList: any[] = [];
      if (micTrack) publishList.push(micTrack);
      if (camTrack) publishList.push(camTrack);

      if (publishList.length > 0) {
        try {
          await client.publish(publishList);
        } catch (pubErr: any) {
          console.warn('Failed to publish local tracks', pubErr?.message ?? pubErr);
        }
      } else {
        // No local tracks available: inform user but continue joined without publishing
        console.warn('No local audio/video tracks available to publish');
        setError((prev) => (prev ? prev + ' | No local devices available' : 'No local devices available'));
      }

      // 監聽遠端使用者 — 使用可移除的 handler refs
      handleUserPublishedRef.current = async (user: any, mediaType: any) => {
        try {
          await client.subscribe(user, mediaType);

          if (mediaType === 'video' && user.videoTrack) {
            const remoteEl = (role === 'teacher') ? remoteVideoRef.current : localVideoRef.current;
            if (remoteEl) {
              try { user.videoTrack.play(remoteEl); } catch (e) { console.warn('Failed to play remote video track', e); }
            }
          }

          if (mediaType === 'audio' && user.audioTrack) {
            user.audioTrack.play();
          }

          setRemoteUsers([...client.remoteUsers]);
        } catch (err) {
          console.warn('user-published handler error', err);
        }
      };

      handleUserUnpublishedRef.current = (user: any) => {
        setRemoteUsers([...client.remoteUsers]);
      };

      handleUserLeftRef.current = () => {
        setRemoteUsers([...client.remoteUsers]);
      };

      if (handleUserPublishedRef.current) client.on('user-published', handleUserPublishedRef.current);
      if (handleUserUnpublishedRef.current) client.on('user-unpublished', handleUserUnpublishedRef.current);
      if (handleUserLeftRef.current) client.on('user-left', handleUserLeftRef.current);

      setJoined(true);
    } catch (e: any) {
      console.error('join classroom error:', e);
      setError(e?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // expose a convenience join that uses defaults (audio+video)
  const join = async (opts?: { publishAudio?: boolean; publishVideo?: boolean }) => {
    return joinWithOptions(opts);
  };

  const leave = async () => {
    try {
      localCamTrackRef.current?.stop();
      localCamTrackRef.current?.close();
      localMicTrackRef.current?.stop();
      localMicTrackRef.current?.close();

      const client = clientRef.current;
      if (client) {
        try {
          // remove listeners we registered (pass the same handler we attached)
          try {
            if (client.off && handleUserPublishedRef.current) client.off('user-published', handleUserPublishedRef.current);
          } catch {}
          try {
            if (client.off && handleUserUnpublishedRef.current) client.off('user-unpublished', handleUserUnpublishedRef.current);
          } catch {}
          try {
            if (client.off && handleUserLeftRef.current) client.off('user-left', handleUserLeftRef.current);
          } catch {}
        } catch {}

        try {
          await client.leave();
        } catch (e) {
          console.warn('client.leave() failed', e);
        }

        clientRef.current = null;
        clientChannelRef.current = null;
      }
    } finally {
      setJoined(false);
      setRemoteUsers([]);
    }
  };

  // Listen for whiteboard room UUID from other tabs
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const courseIdFromChannel = channelName.replace(/^course_/, '').split('_')[0];
    const bc = new BroadcastChannel(`whiteboard_course_${courseIdFromChannel}`);
    
    bc.onmessage = (event) => {
      if (event.data?.type === 'whiteboard_room_created' && event.data.uuid) {
        const whiteboardRoomKey = `whiteboard_room_${channelName}`;
        const existingUuid = localStorage.getItem(whiteboardRoomKey);
        
        if (!existingUuid) {
          console.log('Received whiteboard UUID from other tab');
          localStorage.setItem(whiteboardRoomKey, event.data.uuid);
        }
      }
    };
    
    return () => {
      bc.close();
    };
  }, [channelName]);

  // 元件卸載時自動離開
  useEffect(() => {
    return () => {
      // ensure we leave when unmounting
      leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // 狀態
    joined,
    loading,
    error,
    remoteUsers,
    whiteboardMeta,
    // 新增：视频质量控制状态
    currentQuality,
    isLowLatencyMode,
    // device helpers
    checkAudioDevice: async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return false;
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.some((d) => d.kind === 'audioinput');
      } catch (e) {
        return false;
      }
    },
    checkVideoDevice: async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return false;
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.some((d) => d.kind === 'videoinput');
      } catch (e) {
        return false;
      }
    },
    checkDevices: async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return { hasAudioInput: false, hasVideoInput: false };
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasAudioInput = devices.some((d) => d.kind === 'audioinput');
        const hasVideoInput = devices.some((d) => d.kind === 'videoinput');
        return { hasAudioInput, hasVideoInput };
      } catch (e) {
        return { hasAudioInput: false, hasVideoInput: false };
      }
    },
    // DOM refs
    localVideoRef,
    remoteVideoRef,
    whiteboardRef,
    // 控制
    join,
    leave,
    // 新增：视频质量控制函数
    setVideoQuality,
    setLowLatencyMode,
  };
}

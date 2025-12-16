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
  const [whiteboardRoom, setWhiteboardRoom] = useState<Room | null>(null);
  const [whiteboardMeta, setWhiteboardMeta] = useState<{ uuid?: string; appId?: string; region?: string } | null>(null);

  // 新增：视频质量控制状态
  const [currentQuality, setCurrentQuality] = useState<VideoQuality>(defaultQuality);
  const [isLowLatencyMode, setIsLowLatencyMode] = useState(isOneOnOne);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const whiteboardRef = useRef<HTMLDivElement | null>(null);
  const whiteboardRoomRef = useRef<Room | null>(null);
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
      // 设置为直播模式以获得更好的1对1性能
      await client.setClientRole('host');
      
      // 启用低延迟模式
      await setLowLatencyMode(true);
      
      // 设置网络质量优先级
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
        
        // 为1对1场景优化客户端配置
        const clientConfig = isOneOnOne ? {
          mode: 'live', // 使用直播模式获得更好的1对1性能
          codec: 'vp8'
        } : {
          mode: 'rtc',
          codec: 'vp8'
        };
        
        clientRef.current = Agora.createClient(clientConfig);
      }

      const client = clientRef.current!;

      // 应用1对1优化
      if (isOneOnOne) {
        await applyOneOnOneOptimizations(client);
      }

      await client.join(data.appId, data.channelName, data.token, data.uid);
      clientChannelRef.current = data.channelName;

      // Request server to create/return Agora Whiteboard room + token
      let wbAppId: string | null = null;
      let wbUuid: string | null = null;
      let wbRoomToken: string | null = null;
      let wbRegion: string | null = null;
      try {
        const wbResp = await fetch('/api/agora/whiteboard', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Classroom Room' }),
        });
        if (wbResp.ok) {
          const wbJson = await wbResp.json();
          wbAppId = wbJson.whiteboardAppId ?? null;
          wbUuid = wbJson.uuid ?? null;
          wbRoomToken = wbJson.roomToken ?? null;
          wbRegion = wbJson.region ?? null;
          setWhiteboardMeta({ uuid: wbUuid ?? undefined, appId: wbAppId ?? undefined, region: wbRegion ?? undefined });
        } else {
          const txt = await wbResp.text();
          console.warn('whiteboard API returned non-OK:', wbResp.status, txt);
        }
      } catch (err) {
        console.warn('Failed to call /api/agora/whiteboard', err);
      }

      // 初始化白板 — try multiple CDNs and make whiteboard init non-fatal
      const loadScriptWithTimeout = (src: string, timeoutMs = 8000) =>
        new Promise<void>((resolve, reject) => {
          if (typeof window === 'undefined') return reject(new Error('window is undefined'));
          // avoid inserting duplicate scripts
          const existing = Array.from(document.querySelectorAll(`script[data-white-sdk]`)).find(
            (s) => (s as HTMLScriptElement).getAttribute('data-white-sdk-src') === src,
          );
          if (existing) {
            if ((window as any).WhiteWebSdk) return resolve();
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Failed to load script')));
            return;
          }

          const script = document.createElement('script');
          script.setAttribute('data-white-sdk', 'runtime');
          script.setAttribute('data-white-sdk-src', src);
          script.src = src;
          script.async = true;

          const to = window.setTimeout(() => {
            script.onerror = null;
            script.onload = null;
            reject(new Error(`Loading ${src} timed out after ${timeoutMs}ms`));
          }, timeoutMs);

          script.onload = () => {
            window.clearTimeout(to);
            ((window as any).WhiteWebSdk ? resolve() : reject(new Error('white-web-sdk loaded but global not available')));
          };
          script.onerror = () => {
            window.clearTimeout(to);
            reject(new Error(`Failed to load ${src}`));
          };

          document.head.appendChild(script);
        });

      const ensureWhiteSdk = async () => {
        if (typeof window === 'undefined') throw new Error('window is undefined');
        if ((window as any).WhiteWebSdk) return;

        const cdns = [
          'https://cdn.jsdelivr.net/npm/white-web-sdk@2.16.53/dist/index.js',
          'https://unpkg.com/white-web-sdk@2.16.53/dist/index.js',
        ];

        let lastErr: Error | null = null;
        for (const url of cdns) {
          try {
            // try to load; small timeout
            await loadScriptWithTimeout(url, 8000);
            if ((window as any).WhiteWebSdk) return;
          } catch (err: any) {
            console.warn('white-web-sdk load failed for', url, err?.message ?? err);
            lastErr = err;
            // try next
          }
        }

        throw lastErr ?? new Error('Failed to load white-web-sdk from CDNs');
      };

      try {
        await ensureWhiteSdk();
        const WhiteWebSdk = (window as any).WhiteWebSdk;
        if (WhiteWebSdk && wbAppId && wbUuid && wbRoomToken) {
          try {
            const whiteWebSdk = new WhiteWebSdk({
              appIdentifier: wbAppId,
              deviceType: 'Surface',
              region: wbRegion || undefined,
            });
            // sanitize token if quoted
            if (typeof wbRoomToken === 'string') {
              wbRoomToken = wbRoomToken.trim();
              const m = wbRoomToken.match(/^"([\s\S]*)"$/);
              if (m) wbRoomToken = m[1];
            }

            const room = await whiteWebSdk.joinRoom({
              uuid: wbUuid,
              roomToken: wbRoomToken,
              uid: String(uid),
              userPayload: {
                cursorName: role === 'teacher' ? 'Teacher' : 'Student',
              },
            });

            if (whiteboardRef.current) {
              room.bindHtmlElement(whiteboardRef.current);
            }

            try {
              const scenes = typeof room.getScenes === 'function' ? room.getScenes() : null;
              const hasScenes = Array.isArray(scenes) ? scenes.length > 0 : !!room.state?.sceneState?.scenes?.length;
              if (!hasScenes && typeof room.putScenes === 'function' && typeof room.setScenePath === 'function') {
                const defaultSceneName = 'board';
                room.putScenes('/', [{ name: defaultSceneName }], 0);
                room.setScenePath(`/${defaultSceneName}`);
              }
            } catch (sceneErr) {
              console.warn('Failed to ensure default whiteboard scene', sceneErr);
            }

            try {
              if (typeof room.disableDeviceInputs === 'function') room.disableDeviceInputs(false);
            } catch {}
            try {
              if (typeof room.disableOperations === 'function') room.disableOperations(false);
            } catch {}
            try {
              if (typeof room.setViewMode === 'function') room.setViewMode('Freedom');
            } catch {}

            // Enable writable mode first
            try {
              if (typeof room.setWritable === 'function') {
                // some versions provide setWritable
                await room.setWritable(true);
              } else if (typeof room.enableWrite === 'function') {
                // fallback name
                await room.enableWrite(true);
              }
            } catch (e) {
              console.warn('Failed to enable whiteboard writable mode', e);
            }

            // Wait for whiteboard to be ready before setting tools
            const waitForReady = () => new Promise<void>((resolve) => {
              if (room.phase === 'connected' || room.state?.roomPhase === 'connected') {
                resolve();
              } else {
                // Wait a bit for initialization
                setTimeout(resolve, 300);
              }
            });

            await waitForReady();

            // 設定預設工具為鉛筆
            // set default tool after whiteboard is ready
            const defaultStroke = [0, 0, 0] as [number, number, number];
            try {
              if (typeof room.setMemberState === 'function') {
                room.setMemberState({ 
                  currentApplianceName: 'pencil' as any, 
                  strokeColor: defaultStroke,
                  isWritable: true 
                });
              }
            } catch (e) {
              console.warn('setMemberState failed', e);
            }

            // diagnostic: expose available methods
            try {
              console.debug('whiteboard room methods:', Object.keys(room).filter((k: string) => typeof (room as any)[k] === 'function'));
            } catch {}

            whiteboardRoomRef.current = room;
            setWhiteboardRoom(room);
            try {
              // expose for debugging in dev only
              if (typeof window !== 'undefined') {
                try {
                  (window as any).__wbRoom = room;
                  (window as any).__wb_setTool = (tool: string) => {
                    try {
                      if (room.setMemberState) {
                        room.setMemberState({ currentApplianceName: tool as any });
                      }
                      if (room.setWritable) {
                        room.setWritable(true);
                      }
                    } catch (e) {
                      console.warn('wb_setTool failed', e);
                    }
                  };
                  (window as any).__wb_setColor = (color: string | number[]) => {
                    try {
                      const strokeColor = hexToRgbArray(color);
                      if (room.setMemberState) {
                        room.setMemberState({ strokeColor: strokeColor as any });
                      } else if (room.setStrokeColor) {
                        room.setStrokeColor(strokeColor as any);
                      }
                    } catch (e) {
                      console.warn('wb_setColor failed', e);
                    }
                  };
                  console.info('Whiteboard room exposed as window.__wbRoom with helpers __wb_setTool(tool) and __wb_setColor(color)');
                } catch (e) {
                  // ignore exposure errors
                }
              }
            } catch {}
          } catch (wbErr: any) {
            console.warn('whiteboard initialization failed', wbErr);
            // non-fatal: show a friendly message but continue with Agora
            setError((prev) => prev ? prev + ' | Whiteboard init failed' : 'Whiteboard init failed');
          }
        } else {
          if (!wbAppId || !wbUuid || !wbRoomToken) {
            console.warn('Whiteboard data missing; skipping whiteboard initialization');
          }
        }
      } catch (wbLoadErr: any) {
        console.warn('whiteboard SDK load failed', wbLoadErr);
        setError((prev) => prev ? prev + ' | Whiteboard SDK load failed' : 'Whiteboard SDK load failed');
        // continue without whiteboard
      }

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

      if (whiteboardRoomRef.current) {
        try {
          // try multiple teardown methods depending on SDK version
          if (typeof whiteboardRoomRef.current.disconnect === 'function') {
            await whiteboardRoomRef.current.disconnect();
          }
        } catch (e) {
          console.warn('whiteboard disconnect failed', e);
        }
        try {
          if (typeof whiteboardRoomRef.current.destroy === 'function') {
            // some SDKs offer destroy/dispose
            await whiteboardRoomRef.current.destroy();
          } else if (typeof whiteboardRoomRef.current.dispose === 'function') {
            await whiteboardRoomRef.current.dispose();
          }
        } catch (e) {
          // ignore
        }

        whiteboardRoomRef.current = null;
        setWhiteboardRoom(null);
      }

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
    whiteboardRoom,
    // 新增：视频质量控制函数
    setVideoQuality,
    setLowLatencyMode,
  };
}
